# Nav-Item（Cloudflare Pages）

现代化导航站点，前端为 Vue 3 SPA，后端为 Cloudflare Pages Functions（Hono），数据使用 D1，上传使用 R2。

## 项目结构

```
nav-item/
├── functions/            # Pages Functions (ESM JS)
│   ├── api/[[path]].js   # API 路由
│   └── uploads/[[key]].js# R2 文件读取
├── migrations/           # D1 建表与种子
│   ├── init.sql
│   └── seed.sql
├── scripts/              # 本地脚本
│   └── smoke-test.mjs
├── web/                  # Vue 3 前端
│   ├── public/_redirects # SPA 重写
│   └── src/
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

1) 先在 GitHub fork 本项目到你自己的账号。
2) 打开 Cloudflare 控制台 → Pages → 创建项目，选择你 fork 的仓库。
3) 构建设置：
   - 构建预设：无
   - 构建命令：`npm run build`
   - 输出目录：`web/dist`
4) 绑定 D1：
   - 先在 D1 创建数据库（名称可自定，例如 `nav-item`）
   - Pages 项目 → 设置 → Functions → D1 绑定
   - 绑定名称：`DB`（必须为 `DB`）
   - 数据库：选择刚创建的 D1
5) 绑定 R2：
   - 先在 R2 创建存储桶（名称可自定，例如 `nav-item-uploads`）
   - Pages 项目 → 设置 → Functions → R2 绑定
   - 绑定名称：`UPLOADS`（必须为 `UPLOADS`）
   - 存储桶：选择刚创建的桶
6) Secrets（同页设置）：
   - `JWT_SECRET`（任意强随机字符串）
   - `ADMIN_USERNAME`（初始管理员账号）
   - `ADMIN_PASSWORD`（初始管理员密码）
7) D1 Studio 建表（只需执行一次）：
   - 进入 D1 → 选择数据库 → Studio
   - 将 `migrations/init.sql` 的内容全部复制进去执行
8) 以后只要 push 代码，Pages 会自动构建并发布。

## 数据库与初始化说明

默认数据不是自动导入的，可手动按需导入：
- 进入 D1 → 选择数据库 → Studio
- 将 `migrations/seed.sql` 的内容全部复制进去执行

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

参数说明：
- 手工测试中的地址 `http://127.0.0.1:8788` 是 `wrangler pages dev` 默认端口；若你使用了别的端口，请替换为实际地址。
- `/api/login` 需要传入用户名与密码，请与控制台设置的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 保持一致。
- 冒烟测试脚本使用两个环境变量：
  - `ADMIN_USERNAME`：管理员账号
  - `ADMIN_PASSWORD`：管理员密码
- `--baseURL`：目标地址（本地或线上均可），例如 `http://127.0.0.1:8788` 或 `https://your-pages-domain`.

测试内容：
- `/api/health` 是否可访问
- `/api/login` 是否返回 token
- `/api/users/me` 是否能用 token 访问
- `/api/menus` 创建与读取
- `/api/cards` 创建与读取
- `/api/friends` 创建与读取


## 许可证

MIT
