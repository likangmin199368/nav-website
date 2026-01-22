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
   - Pages 项目 → 设置 → 绑定 → 添加 → D1 数据库
   - 绑定名称：`DB`（必须为 `DB`）
   - 数据库：选择刚创建的 D1
5) 绑定 R2：
   - 先在 R2 创建存储桶（名称可自定，例如 `nav-item-uploads`）
   - Pages 项目 → 设置 → 绑定 → 添加 → R2 存储桶
   - 绑定名称：`UPLOADS`（必须为 `UPLOADS`）
   - 存储桶：选择刚创建的桶
6) Secrets：
   - Pages 项目 → 设置 → 变量和机密 → 添加
   - `JWT_SECRET`（任意强随机字符串）
   - `ADMIN_USERNAME`（初始管理员账号）
   - `ADMIN_PASSWORD`（初始管理员密码）
7) D1 Studio 建表（只需执行一次）：
   - 进入 D1 → 选择数据库 → Explore Data
   - 将 `migrations/init.sql` 的内容全部复制进去
   - 点击右下角 `Run` 按钮的下拉小箭头，选择 `Run all statement` 执行
8) 重新部署（一定要重新部署）：Pages 项目 → 部署 → 查看详细信息 → 管理部署 → 重试部署

## 数据库与初始化说明

默认数据不是自动导入的，可手动按需导入：
- 进入 D1 → 选择数据库 → Explore Data
- 将 `migrations/seed.sql` 的内容全部复制进去
- 点击右下角 `Run` 按钮的下拉小箭头，选择 `Run all statement` 执行

## 接口说明

- `/api/health`：健康检查
- `/api/login`：登录获取 token
- `/api/menus`、`/api/cards`、`/api/friends`、`/api/users/*`：CRUD
- `/api/upload`：上传文件（字段名 `logo`）
- `/uploads/<key>`：访问上传文件

## 测试
测试相关步骤已整理到 `TESTING.md`，包含手工 curl 测试、冒烟测试脚本、书签导入测试与解析器单元测试。

## 书签导入功能

支持导入 Chrome/Firefox 导出的书签 HTML 文件（Netscape Bookmark File Format）。

### 功能说明

- **映射规则**：
  - 顶层文件夹 → menus（主栏目）
  - 二级文件夹 → sub_menus（子栏目）
  - 书签链接 → cards（导航卡片）

- **导入模式**：
  - `merge`（默认）：同 URL 书签跳过不重复导入
  - `replace`：先删除目标范围数据再重新导入

- **目标栏目**：
  - `auto`（默认）：按文件夹结构自动创建栏目
  - `menu:<id>`：所有书签导入到指定栏目

### 前端使用

1. 登录后台管理 → 侧边栏点击「书签导入」
2. 上传书签 HTML 文件
3. 选择导入模式和目标栏目
4. 点击「预览导入」查看统计
5. 点击「确认导入」执行导入

### API 接口

```
POST /api/import/bookmarks
Content-Type: multipart/form-data
Authorization: Bearer <TOKEN>
```

参数：
- `file`：书签 HTML 文件（必须，最大 5MB）
- `mode`：merge | replace（默认 merge）
- `target`：auto | menu:<id>（默认 auto）
- `dryRun`：true | false（默认 false）

返回：
```json
{
  "ok": true,
  "dryRun": false,
  "created": { "menus": 3, "subMenus": 5, "cards": 20 },
  "updated": { "menus": 0, "subMenus": 0, "cards": 0 },
  "skipped": { "menus": 1, "subMenus": 0, "cards": 2 },
  "errors": [],
  "sample": [{ "title": "GitHub", "url": "https://github.com" }]
}
```

### 书签导入测试
书签导入相关测试已移动到 `TESTING.md`。

## 许可证

MIT
