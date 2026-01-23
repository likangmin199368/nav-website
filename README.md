# 项目简介

这是一个现代化导航站点，前端为 Vue 3 单页应用，部署在 Cloudflare Pages；后端为 Cloudflare Pages Functions（Hono），数据存储使用 D1，文件上传与访问使用 R2。

# 技术栈

- 前端：Vue 3、Vite、Vue Router
- 后端：Cloudflare Pages Functions、Hono
- 数据：Cloudflare D1
- 文件存储：Cloudflare R2

# 功能列表

- 导航菜单与卡片的管理与展示
- 后台管理页面（基于前端 SPA）
- 书签导入（支持从浏览器书签文件导入）
- 文件上传与访问（R2）
- API 登录与鉴权

# 项目结构

```
nav-item/
├── package.json                    # 根依赖与脚本
├── init.sql                        # D1 建表
├── functions/                      # Pages Functions (ESM JS)
│   ├── api/[[path]].js             # API 路由与鉴权
│   ├── lib/bookmark-parser.js      # 书签解析工具
│   └── uploads/[[key]].js          # R2 文件读取
├── web/                            # Vue 3 前端
│   ├── index.html                  # Vite 入口 HTML
│   ├── package.json                # 前端依赖与脚本
│   ├── package-lock.json           # 前端依赖锁文件
│   ├── vite.config.mjs             # Vite 构建配置
│   ├── public/                     # 静态资源与 SPA 重写
│   │   ├── _redirects              # SPA 路由重写到 index.html
│   │   ├── background.webp         # 首页背景图
│   │   ├── default-favicon.png     # 站点默认图标
│   │   └── robots.txt              # 搜索引擎抓取规则
│   └── src/                        # 视图与组件源码
│       ├── App.vue                 # 根组件
│       ├── api.js                  # 前端 API 请求封装
│       ├── main.js                 # 应用入口与挂载
│       ├── router.js               # 前端路由定义
│       ├── components/             # 复用组件
│       │   ├── CardGrid.vue        # 导航卡片网格
│       │   └── MenuBar.vue         # 顶部菜单栏
│       └── views/                  # 页面视图
│           ├── Admin.vue           # 后台容器页
│           ├── Home.vue            # 前台首页
│           └── admin/              # 后台管理模块
│               ├── BookmarkImport.vue # 书签导入页面
│               ├── CardManage.vue     # 卡片管理页面
│               ├── FriendLinkManage.vue # 友链管理页面
│               ├── MenuManage.vue     # 菜单管理页面
│               └── UserManage.vue     # 用户管理页面
```

# 部署到 Cloudflare Pages

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
   - 将 `init.sql` 的内容全部复制进去
   - 点击右下角 `Run` 按钮的下拉小箭头，选择 `Run all statement` 执行
8) 重新部署（一定要重新部署）：Pages 项目 → 部署 → 查看详细信息 → 管理部署 → 重试部署
