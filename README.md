# Nav-Item (Cloudflare Pages)

现代化导航站点，前端为 Vue 3 SPA，后端为 Cloudflare Pages Functions（Hono），数据使用 D1，上传使用 R2。

## 项目结构

```
nav-item/
├── functions/            # Pages Functions (ESM JS)
│   ├── api/[[path]].js   # API 路由
│   └── uploads/[[key]].js# R2 文件读取
├── migrations/           # D1 迁移
│   ├── 0001_init.sql
│   └── seed.sql          # 可选数据
├── scripts/              # 本地脚本
│   └── smoke-test.mjs
├── web/                  # Vue 3 前端
│   ├── public/_redirects # SPA 重写
│   └── src/
├── wrangler.toml
└── package.json
```

## 本地开发

1) 安装依赖并构建前端
```bash
npm install
npm run build
```

2) 运行本地 Pages + Functions（带 D1/R2 绑定）
```bash
wrangler pages dev web/dist \
  --d1 DB=nav-item \
  --r2 UPLOADS=nav-item-uploads \
  --binding JWT_SECRET=dev-secret \
  --binding ADMIN_USERNAME=admin \
  --binding ADMIN_PASSWORD=pass123 \
  --local-protocol http \
  --persist-to .wrangler/state/v3
```

## 部署到 Cloudflare Pages

### Dashboard 方式（推荐）
1) 连接 GitHub 仓库并创建 Pages 项目。
2) Build command:
```
npm run build
```
3) Output directory:
```
web/dist
```
4) 绑定资源：
- D1: `DB`
- R2: `UPLOADS`
5) Secrets：
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

### Wrangler 方式（可选）
创建 D1 与迁移：
```bash
wrangler d1 create nav-item
wrangler d1 migrations apply nav-item --remote
```

## 数据库与迁移

本地：
```bash
wrangler d1 migrations apply nav-item --local
```

可选种子数据：
```bash
wrangler d1 execute nav-item --file=migrations/seed.sql --local
```

## 接口说明

- `/api/health`：健康检查
- `/api/login`：登录获取 token
- `/api/menus`、`/api/cards`、`/api/friends`、`/api/users/*`：CRUD
- `/api/upload`：上传文件（字段名 `logo`）
- `/uploads/<key>`：访问上传文件

## 手工测试步骤（curl）

1) 健康检查
```bash
curl http://127.0.0.1:8788/api/health
```

2) 登录获取 token
```bash
curl -H "content-type: application/json" \
  -d '{"username":"admin","password":"pass123"}' \
  http://127.0.0.1:8788/api/login
```

3) 读取用户信息
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://127.0.0.1:8788/api/users/me
```

4) 新增菜单
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  -H "content-type: application/json" \
  -d '{"name":"Test Menu","order":1}' \
  http://127.0.0.1:8788/api/menus
```

5) 新增卡片
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  -H "content-type: application/json" \
  -d '{"menu_id":1,"sub_menu_id":null,"title":"Test","url":"https://example.com","logo_url":"","desc":"","order":1}' \
  http://127.0.0.1:8788/api/cards
```

6) 友链列表
```bash
curl http://127.0.0.1:8788/api/friends
```

7) 上传并访问
```bash
curl -F "logo=@web/public/default-favicon.png" http://127.0.0.1:8788/api/upload
curl http://127.0.0.1:8788/uploads/<key>
```

## 冒烟测试脚本（可选）

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=pass123 \
node scripts/smoke-test.mjs --baseURL=http://127.0.0.1:8788
```

## Git 清理说明

若曾提交过构建产物/缓存，可执行：
```bash
git rm -r --cached node_modules web/dist .wrangler
```

## 许可证

MIT
