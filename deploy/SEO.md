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
