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

## 服务器选型（1000 人同时在线）

上文压测在 **4 vCPU / 16GB 内存**的云容器上完成；API 层实测容量
（排行榜 16k req/s、写入 621 局/秒）是 1000 在线常态负载（~25 写/秒 +
每秒几十次读）的 1–2 个数量级，**CPU/内存都不是瓶颈，真正的约束是
出口带宽**（首次加载 ~7MB/人）。

### 推荐档位

| 档位 | 规格 | 参考机型（阿里云 / 腾讯云 / AWS） | 适用 |
| --- | --- | --- | --- |
| 入门 | 2 vCPU / 4GB / 40GB SSD | ecs.e-c1m2.large / 轻量 2C4G / t3.medium | 静态资源交给 CDN，源站只扛 API |
| 稳妥（推荐） | 4 vCPU / 8GB / 60GB SSD（NVMe 优先） | ecs.c7.xlarge(4C8G) / S5.LARGE8 / t3.xlarge | 与压测同级 CPU，留一倍余量 |
| 余量 | 8 vCPU / 16GB / 100GB NVMe | ecs.c7.2xlarge / S5.2XLARGE16 / c6i.2xlarge | 有集中活动/推广尖峰、不想依赖 CDN |

带宽按到达速率估算（静态首包 ~7MB/人，返回访客走 304 几乎为零）：

- 有 CDN：源站 5–10 Mbps 即可（API JSON 常态不足 1 Mbps）。
- 无 CDN：1000 人在 30 分钟内陆续进入 ≈ 31 Mbps 均值；100 人/分钟的
  尖峰 ≈ 90+ Mbps。国内固定带宽计费下这很贵，**优先按量带宽 + CDN**。

磁盘增长很慢：`runs` 每行约 200B，1000 日活 × 50 局/天 ≈ 10MB/天、
不足 4GB/年，40GB SSD 可用多年；用 SSD 主要为 WAL fsync 延迟稳定。

内存实测 PocketBase 常驻不足 300MB（含 JSVM 执行器池与进程内缓存），
4GB 已含足够的 SQLite 页缓存与系统余量。

### 部署形态

- **单机 Docker PocketBase 足够**（本仓库 compose 一键起，Dockerfile 已带
  `/api/health` 健康检查）。数据只有一个 `pb_data` 卷，备份即 rsync/快照。
- 前置 nginx/Caddy 做 SSL（Let's Encrypt）、gzip/brotli、静态缓存与连接
  排队兜底；`/_/` 管理面板在反代层限制来源 IP。
- 静态资源（尤其 5.3MB BGM）强烈建议套 CDN 或至少由反代缓存——应用层
  已发好 `Cache-Control`/304，边缘节点可直接照抄回源策略。
- 外部拨测 `/api/health`（Uptime Kuma、云监控均可）+ 云厂商默认的
  CPU/带宽告警即可，无需自建监控栈。

### 不建议

- **多机共享 SQLite**：NFS/对象存储上跑 SQLite 会损坏数据库，PocketBase
  也不支持多实例写同一库；到瓶颈先纵向升配，不要横向堆机器。
- **为这个规模上 K8s/微服务/Redis**：单进程 + 进程内缓存已经把热点压平，
  外置缓存反而多一跳网络往返。
- **盲目高配（16C64G）**：瓶颈在带宽而非计算，钱应花在按量带宽/CDN 上。
- **让源站硬扛无缓存的静态洪峰**：等于把 90+ Mbps 尖峰当成常态带宽买单。

### 监控与扩容信号

| 信号 | 阈值 | 动作 |
| --- | --- | --- |
| 出口带宽 | 持续 >80% 配额 | 上 CDN / 升按量带宽（最常见的第一瓶颈） |
| API p95 延迟 | >200ms（可用 `scripts/loadtest.mjs` 低并发定期拨测） | 查慢查询/日志，考虑升 CPU |
| CPU | 持续 >70% | 升一档 vCPU |
| PocketBase 日志 | 出现 `database is locked`/busy 重试、跑分 POST p95 >500ms | 写入逼近单写者上限，升 NVMe/CPU，规划迁移 |
| 磁盘 | >70% | 扩盘或归档历史 `runs` |
| 同时在线 | 稳定逼近 3000–5000 | 静态全量 CDN + 顶配单机；再往上迁 Postgres（架构级改造） |

### nginx 反代示例

实机验证过的完整配置见 [`deploy/nginx.flappy-friends.conf`](../deploy/nginx.flappy-friends.conf)
（含静态边缘缓存、SSE 直通与管理面板收紧示例）。

**反代后必做**：PocketBase 看到的来源地址都会变成 127.0.0.1，按 IP 限流会
全站共享同一个桶。需让 PocketBase 信任反代注入的 `X-Real-IP`——管理面板
`/_/` → Settings → Application → Trusted proxy headers 填 `X-Real-IP`，
或用超管 token 调用：

```bash
curl -X PATCH http://127.0.0.1:8090/api/settings \
  -H "Authorization: <superuser token>" -H "Content-Type: application/json" \
  -d '{"trustedProxy":{"headers":["X-Real-IP"],"useLeftmostIP":false}}'
```

## 水平扩展的边界

SQLite 单写者意味着 PocketBase 无法多实例横向扩展（多个进程不能共享同一
数据库文件写入）。超出单机容量（约数千在线）时的路径：

1. 纵向加配（CPU/内存/NVMe），并把静态资源全部推到 CDN；
2. 读写分离：排行榜/留言等公开读迁移到边缘缓存（本仓库的 TTL 缓存已把
   回源压到 ≤1 次/3 秒，天然适合再套 CDN）；
3. 再往上则需要迁移到支持多连接写入的数据库（如 Postgres + 自建 API），
   属于架构级改造，当前规模无需考虑。
