# 测试

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

### 书签导入冒烟测试（curl）

1) 登录获取 token
```bash
TOKEN=$(curl -s -H "content-type: application/json" \
  -d '{"username":"admin","password":"pass123"}' \
  http://127.0.0.1:8788/api/login | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: $TOKEN"
```

2) 预览导入（dryRun=true）
```bash
curl -H "Authorization: Bearer $TOKEN" \
  -F "file=@scripts/bookmarks-fixture.html" \
  -F "mode=merge" \
  -F "target=auto" \
  -F "dryRun=true" \
  http://127.0.0.1:8788/api/import/bookmarks
```

3) 确认导入
```bash
curl -H "Authorization: Bearer $TOKEN" \
  -F "file=@scripts/bookmarks-fixture.html" \
  -F "mode=merge" \
  -F "target=auto" \
  -F "dryRun=false" \
  http://127.0.0.1:8788/api/import/bookmarks
```

4) 验证导入结果
```bash
curl http://127.0.0.1:8788/api/menus
```

### 解析器单元测试

```bash
node scripts/bookmark-parser.test.mjs
```

测试文件 `scripts/bookmarks-fixture.html` 包含示例书签结构。
