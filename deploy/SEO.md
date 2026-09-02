# hyunlix.top SEO / Google 自然流量手册

仓库已内置基础 SEO；上线后还要在 Google 侧完成验证与提交。

## 仓库已完成

| 项 | 文件 |
|----|------|
| Title / Description / robots / canonical | `index.html` |
| Open Graph + Twitter Card | `index.html` + `public/og-image.png` |
| JSON-LD (`VideoGame`) | `index.html` |
| `robots.txt` | `public/robots.txt` |
| `sitemap.xml` | `public/sitemap.xml` |
| 多语言切换时同步 description / OG | `src/i18n.tsx` |
| Search Console 验证 meta（可选构建注入） | `VITE_GOOGLE_SITE_VERIFICATION` |

线上应可访问：

- https://hyunlix.top/robots.txt
- https://hyunlix.top/sitemap.xml
- https://hyunlix.top/og-image.png

## 1. Google Search Console（必做）

1. 打开 [Google Search Console](https://search.google.com/search-console)
2. 添加资源：域名 `hyunlix.top`（推荐 DNS 验证）或网址前缀 `https://hyunlix.top/`
3. **DNS 验证（NameSilo）**  
   - Console 给你一条 TXT 记录  
   - NameSilo → Domain Manager → `hyunlix.top` → DNS → 添加 TXT  
   - 等生效后点验证
4. **或 HTML 标签验证**  
   - Console 给出 `content="xxxx"`  
   - 在服务器游戏 `.env` 写入：  
     `VITE_GOOGLE_SITE_VERIFICATION=xxxx`  
   - `docker compose up -d --build`

## 2. 提交 Sitemap

验证通过后：

1. Search Console → 索引 → 站点地图  
2. 提交：`https://hyunlix.top/sitemap.xml`  
3. 再用「网址检查」请求编入索引：`https://hyunlix.top/`

## 3. Google 上的内容与外链（自然流量）

技术 SEO 只是地基；自然流量靠可被搜索的提及：

- TikTok / Ins / X / Reddit / Discord 发帖时带完整链接 `https://hyunlix.top`
- 用一致名称：**Hyunjin × Felix**、**Hyunlix**、**fan flying game**
- 英文社区（Reddit r/straykids、X）与葡语/西语/韩语社区分别发本地语种贴
- 分享卡带二维码（已实现），利于 Story → 站内转化
- 避免买垃圾外链；优质粉丝帖 + 稳定可访问即可

## 4. 关键词预期（务实）

较容易积累的长尾：

- `hyunlix game` / `hyunjin felix game`
- `stray kids fan game` / `hyunlix flappy`

品牌词 `hyunlix.top` 会随外链与搜索习惯变强。不要期望一夜排到「Stray Kids」大词首页。

## 5. 上线后自检

```bash
curl -sI https://hyunlix.top/ | head
curl -s https://hyunlix.top/robots.txt
curl -s https://hyunlix.top/sitemap.xml | head
curl -sI https://hyunlix.top/og-image.png | head
```

[Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) 与  
[Twitter Card Validator](https://cards-dev.twitter.com/validator) 可刷新 OG 缓存。

## 6. 重建部署（含 SEO 静态文件）

```bash
cd /opt/hyunlix-reskin
git pull   # 或同步本分支
docker compose up -d --build
```

`public/` 下的 `robots.txt`、`sitemap.xml`、`og-image.png` 会进 Vite `dist`，由 PocketBase 静态托管。

## 7. 第二轮 SEO 优化（2026-09-03）

仓库侧已改：

| 项 | 文件 | 说明 |
|----|------|------|
| Fredoka 字体自托管 | `public/fonts/` + `public/style.css` + `index.html` | 去掉 fonts.googleapis 渲染阻塞 CSS（2 个 preconnect + 1 个 CSS 请求），改为同源 preload 单个 latin 可变字体文件 |
| JSON-LD 补充 | `index.html` | 新增 `playMode`、`screenshot`、`dateModified`、author `logo` |
| noscript 真实文案 | `index.html` | 不执行 JS 的爬虫也能看到游戏介绍 |
| description 控制在 ~160 字符 | `index.html` + `src/i18n.tsx`（EN/PT/ES） | 避免 SERP 摘要截断 |
| sitemap 只保留 canonical | `public/sitemap.xml` | 移除 `www.hyunlix.top`（非规范域）；`lastmod` 同步为变更日 |
| www → apex 301 | `deploy/nginx.hyunlix-reskin.conf` | 修复 www 与主域同时返回 200 的重复内容问题 |

### 服务器侧需手工执行

```bash
# 1. 同步代码并重建（字体 / sitemap / index.html 都在构建产物里）
cd /opt/hyunlix-reskin
git pull   # 或同步本分支
docker compose up -d --build

# 2. www 301：同步 deploy/nginx.hyunlix-reskin.conf 到 /etc/nginx/conf.d/ 后
nginx -t && nginx -s reload
# 验证（应返回 301 → https://hyunlix.top/）：
curl -sI https://www.hyunlix.top/ | head -3

# 3. 若 443 的 www 握手失败，扩展证书把 www 纳入 SAN：
certbot --expand -d hyunlix.top -d www.hyunlix.top
```

### Google 侧跟进

1. Search Console → 重新提交 `https://hyunlix.top/sitemap.xml`（www 已移除）
2. 「网址检查」→ 请求重新编入索引 `https://hyunlix.top/`
3. 用 [Rich Results Test](https://search.google.com/test/rich-results) 验证 VideoGame 结构化数据
4. PSI API 匿名配额经常 429；如需跑分到 [PageSpeed Insights](https://pagespeed.web.dev/) 手动测

### 性能基线（2026-09-03，本地 Lighthouse 移动模拟）

| 指标 | 线上（改动前） | 本地新构建（改动后，未部署） |
|------|------|------|
| Performance | 28 | 74 |
| FCP | 4.1s | 1.4s |
| LCP | 7.9s | 1.7s |
| TBT | 12.7s | 1.4s |
| SEO / Best Practices | 100 / 100 | 100 / 100 |

注意：本地构建跑在 localhost，网络部分偏乐观；**部署后请到 [PageSpeed Insights](https://pagespeed.web.dev/) 用线上 URL 复测**，才是真实的"改动后"分数（PSI API 匿名配额常 429，网页版可用）。

第三轮候选优化（本轮未动）：落地页当前会立刻加载 Phaser 主包，移动模拟 TBT 偏高（线上 12.7s）；可考虑把游戏 bundle 推迟到点击「Start game」再加载，或给落地页加骨架预览，对 LCP/TBT 都有收益。

### 遗留事项

- **Search Console 验证 meta 仍未上线**：线上 HTML 没有 `google-site-verification`，说明服务器 `.env` 没写 `VITE_GOOGLE_SITE_VERIFICATION`。若已用 DNS 验证可忽略；否则按第 1 节配置。
- 单 URL 承载四语（客户端切换），不符合 hreflang 的"多 URL"前提，故未加 hreflang——这是有意决策，不是遗漏。
