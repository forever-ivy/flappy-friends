# hyunlix.top 站长监控部署手册
#
# 站点已上线：https://hyunlix.top
# VPS：CentOS 7，Nginx → PocketBase:8090
# 本手册只装监控，不改动游戏主流程。

## 你将得到

| 地址 | 用途 |
|------|------|
| `https://stats.hyunlix.top` | Umami 访客分析 |
| `https://status.hyunlix.top` | Uptime Kuma 宕机监控 |
| `goaccess`（SSH） | Nginx 原始访问日志 |

## 0. NameSilo DNS（先做）

Domain Manager → `hyunlix.top` → DNS Records 增加：

| Type | Host | Value |
|------|------|-------|
| A | `stats` | 你的 VPS IP（如 `45.205.25.73`） |
| A | `status` | 同上 |

等解析生效：`dig +short stats.hyunlix.top`

## 1. 一键安装（推荐）

SSH 登录 VPS，进入本仓库目录后：

```bash
chmod +x deploy/install-monitoring.sh
bash deploy/install-monitoring.sh
```

脚本会：

- 在 `/opt/umami`、`/opt/uptime-kuma` 起 Docker 服务
- 生成 Umami 数据库密码与 `APP_SECRET`
- 安装 nginx 子域名配置并 reload

然后签发证书：

```bash
certbot --nginx -d stats.hyunlix.top
certbot --nginx -d status.hyunlix.top
```

## 2. 配置 Umami

1. 打开 `https://stats.hyunlix.top`
2. 默认账号 `admin` / `umami` → **立刻改密码**
3. Settings → Websites → Add：
   - Name: `Hyunlix`
   - Domain: `hyunlix.top`
4. 复制 **Website ID**（UUID）

## 3. 把统计脚本打进游戏（重建镜像）

在游戏服务器的 `.env`（与 `compose.yml` 同目录）增加：

```bash
VITE_UMAMI_SCRIPT_URL=https://stats.hyunlix.top/script.js
VITE_UMAMI_WEBSITE_ID=粘贴你的Website-ID
```

重建并发布：

```bash
docker compose up -d --build
```

本地验证构建是否注入：

```bash
VITE_UMAMI_SCRIPT_URL=https://stats.hyunlix.top/script.js \
VITE_UMAMI_WEBSITE_ID=00000000-0000-0000-0000-000000000000 \
npm run build
grep -n umami dist/index.html
```

未设置这两项时，构建产物**不会**带统计脚本（本地开发默认干净）。

## 4. 配置 Uptime Kuma

1. 打开 `https://status.hyunlix.top`，创建管理员
2. Add New Monitor：
   - HTTP(s) → `https://hyunlix.top/` 每 60s
   - HTTP(s) → `https://hyunlix.top/api/health` 每 60s
3. Settings → Notifications → 加 Telegram（推荐）

## 5. GoAccess（可选，看原始日志）

```bash
yum install -y epel-release goaccess
goaccess /var/log/nginx/access.log -c
```

## 6. 安全清单

- [ ] 改掉截图里泄露的 root 密码
- [ ] Umami 默认密码已改
- [ ] PocketBase `/_/` 加 IP 白名单（见主站 nginx）
- [ ] `stats` / `status` 仅 HTTPS，且强密码
- [ ] 防火墙只开 22/80/443（Umami/Kuma 已绑 `127.0.0.1`，不直连公网端口）

## 文件一览

```
deploy/install-monitoring.sh          # 一键安装
deploy/umami/docker-compose.yml
deploy/uptime-kuma/docker-compose.yml
deploy/nginx.stats.hyunlix.conf
deploy/nginx.status.hyunlix.conf
vite/umami-html-plugin.mjs            # 构建时注入统计脚本
```

## 故障排查

| 现象 | 检查 |
|------|------|
| stats 502 | `cd /opt/umami && docker compose ps` / `docker compose logs` |
| status 502 | `cd /opt/uptime-kuma && docker compose ps` |
| 证书失败 | DNS 是否已指向本机 IP；80 端口是否通 |
| 游戏页无统计 | `.env` 是否有两个 `VITE_UMAMI_*` 且已 `--build`；`curl -s https://hyunlix.top \| grep umami` |
