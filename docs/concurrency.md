# 高并发（1000 人同时在线）设计与容量说明

单机 PocketBase 0.39（SQLite）+ 静态前端的架构下，支撑 1000 人同时在线的
关键假设是：**读多写少、热点读全部命中缓存/索引、写路径短事务、接口有限流**。
本文档记录已落地的优化、参数与实测数字。

## 负载画像（1000 在线）

| 流量 | 估算 | 说明 |
| --- | --- | --- |
| 跑分写入 `POST /api/game/runs` | ~25 局/秒 | 平均一局 40 秒，每局一次批量同步 |
| 弹幕读取 `GET /api/game/messages` | ≤17 req/s | 前端节流：同一客户端 ≥60 秒才重新拉取 |
| 排行榜 `GET /api/game/leaderboards` | 常态个位数 req/s；极端整点洪峰 1000 req | 打开弹窗才请求 + 客户端缓存 30 秒 |
| 留言发表 `POST /api/game/messages` | 少量 | 按 IP 限流 12 次/分钟 |
| 静态资源 | 首次 ~7MB/人 | 强缓存 + 304 重验证，建议反代/CDN 分担 |

## 后端优化点

### 排行榜（原致命热点）

- 旧实现每次请求全表拉最多 5000 名玩家再在 JS 里排序；新实现由 SQLite 按
  索引排序 + `LIMIT 50` 直接出结果。索引（迁移 `1787665644_concurrency_indexes_and_limits.js`）：
  - `idx_players_best_rank (bestScore DESC, bestAchievedAt, created)`
  - `idx_players_total_rank (totalScore DESC, bestScore DESC, created)`
- 前 50 名以**预序列化 JSON** 缓存在 `$app.store()`（进程内、跨 JSVM 执行器共享），
  TTL 3 秒；跑分写入成功时主动失效，因此写后读永远是新的，缓存只用于扛读洪峰。
- 匿名 + limit=50（客户端标准调用）走零解析热路径，直接拼接返回缓存字符串。
- 个人名次 `me`：先在前 50 里找，不在榜时用**一条 COUNT 定向查询**
  （比我名次高的人数 + 1，条件与排序语义一一对应），永不全表扫描。

### 留言板

- `GET`：最近 50 条预序列化缓存 5 秒，发表时主动失效；limit<50 取缓存前缀。
- `POST`：按 IP 限流 **12 次/分钟**（PocketBase 内置限流，见迁移）。

### 跑分同步

- `runs (player, clientRunId)` 唯一索引自建库起就有，幂等去重按索引查询。
- 单请求最多 50 局、短事务；**全部为重复提交时跳过玩家行更新**（客户端重试
  风暴不产生无效写）；有新成绩才失效排行榜缓存。

### 限流（防刷/防爆破，账号规则保持宽松）

| 规则 | 阈值（按 IP/分钟） |
| --- | --- |
| `POST /api/game/messages` | 12 |
| `players:create`（注册） | 30 |
| `*:auth`（登录） | 30 |

注意：限流窗口在 PocketBase 进程内存中。60 秒内对同一进程重复跑
`npm run test:backend` 会因窗口未过而误报限流用例，请像 CI 一样对全新进程运行。

### 静态资源缓存（pb_hooks 中间件）

- Vite 内容哈希产物（`/assets/index-*.js` 等）：`max-age=31536000, immutable`。
- 美术/BGM 等未哈希文件（`/assets/**`）：`max-age=3600, stale-while-revalidate=86400`，
  过期后靠 `Last-Modified`/`If-Modified-Since` 返回 304（Go 静态服务自带），
  5.3MB 的 BGM 不会被反复全量下载。

### SQLite / PocketBase 本身

- PocketBase 默认已启用 `journal_mode=WAL`、`busy_timeout=10000`、
  `synchronous=NORMAL`：读写不互斥、写等待不立即报错，无需额外配置。
- SQLite 是**单写者**：写吞吐上限即单机上限（实测本仓库写路径 600+ 局/秒，
  余量 20 倍以上）。请求日志写在独立的 `auxiliary.db`，如需进一步降 IO
  可在管理面板把日志保留天数调小或提高最低记录级别。

## 前端配套

- 弹幕：只在进菜单时拉取，且同一客户端 **≥60 秒**才重新请求；发出的留言本地
  直接插入，不回源。无任何定时轮询 API 的代码路径。
- 排行榜：打开弹窗才请求；客户端按「榜单类型 + 登录身份」缓存 **30 秒**，
  来回切 best/total 不重复打接口；提交新成绩后主动清空。

## 实测（同机压测，5000 名玩家数据，100 并发 × 10s）

| 接口 | 优化前 | 优化后 |
| --- | --- | --- |
| 排行榜 GET | 20 req/s，p50 4400ms，p99 7506ms | **16262 req/s，p50 3.1ms，p99 58.6ms** |
| 留言 GET | 6931 req/s，p50 8.0ms | **14181 req/s，p50 4.1ms** |
| 跑分 POST（30 并发 × 5s） | — | **621 局/秒，p50 34.5ms，0 失败** |

压测脚本：`node scripts/loadtest.mjs <url> [并发] [秒]`（零依赖）。

对照负载画像：1000 在线的常态请求量（~25 写/s + 每秒几十读）距实测容量有
1–2 个数量级余量；即使 1000 人同一秒全部打开排行榜，也在 16k req/s 的
承载范围内。**结论：单机 PocketBase+SQLite 支撑 1000 同时在线是现实的。**

## 部署建议

- 机器：2 vCPU / 4GB 内存 / SSD 起步即可（压测即在同级容器完成）；
  出口带宽是首日峰值的主要约束（首次加载 ~7MB/人）。
- 建议在 PocketBase 前挂 nginx/Caddy 或 CDN：gzip/brotli 压缩 JSON 与 JS、
  静态资源边缘缓存、连接排队兜底。示例：

```nginx
server {
    listen 80;
    gzip on;
    gzip_types application/json application/javascript text/css;

    location /assets/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_cache static_cache;
        proxy_cache_valid 200 1h;   # 与应用层 Cache-Control 一致
    }
    location / {
        proxy_pass http://127.0.0.1:8090;
    }
}
```

## 水平扩展的边界

SQLite 单写者意味着 PocketBase 无法多实例横向扩展（多个进程不能共享同一
数据库文件写入）。超出单机容量（约数千在线）时的路径：

1. 纵向加配（CPU/内存/NVMe），并把静态资源全部推到 CDN；
2. 读写分离：排行榜/留言等公开读迁移到边缘缓存（本仓库的 TTL 缓存已把
   回源压到 ≤1 次/3 秒，天然适合再套 CDN）；
3. 再往上则需要迁移到支持多连接写入的数据库（如 Postgres + 自建 API），
   属于架构级改造，当前规模无需考虑。
