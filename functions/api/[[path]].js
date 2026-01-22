import { Hono } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { parseBookmarkHtml, flattenParsedData, MAX_FILE_SIZE } from '../lib/bookmark-parser.js';

const app = new Hono();

function getClientIp(c) {
  let ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';
  if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip;
}

function getShanghaiTime() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false });
}

async function requireAuth(c, next) {
  const auth = c.req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: '未授权' }, 401);
  }
  const token = auth.slice(7);
  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    c.set('user', payload);
    await next();
  } catch (e) {
    return c.json({ error: '无效token' }, 401);
  }
}

async function ensureAdmin(c) {
  const row = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
  if ((row?.count || 0) > 0) return null;
  const username = c.env.ADMIN_USERNAME;
  const password = c.env.ADMIN_PASSWORD;
  if (!username || !password) {
    return c.json({ error: '管理员账号未配置' }, 500);
  }
  const hash = await bcrypt.hash(password, 10);
  await c.env.DB.prepare('INSERT INTO users (username, password) VALUES (?, ?)')
    .bind(username, hash)
    .run();
  return null;
}

app.get('/api/health', (c) => {
  return c.json({ ok: true, timestamp: new Date().toISOString() });
});

app.post('/api/login', async (c) => {
  const bootstrapRes = await ensureAdmin(c);
  if (bootstrapRes) return bootstrapRes;
  const body = await c.req.json();
  const username = body?.username;
  const password = body?.password;
  if (!username || !password) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username=?')
    .bind(username)
    .first();
  if (!user) return c.json({ error: '用户名或密码错误' }, 401);

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return c.json({ error: '用户名或密码错误' }, 401);

  const lastLoginTime = user.last_login_time;
  const lastLoginIp = user.last_login_ip;
  const now = getShanghaiTime();
  const ip = getClientIp(c);
  await c.env.DB.prepare('UPDATE users SET last_login_time=?, last_login_ip=? WHERE id=?')
    .bind(now, ip, user.id)
    .run();

  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  const token = await new SignJWT({ id: user.id, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2h')
    .sign(secret);

  return c.json({ token, lastLoginTime, lastLoginIp });
});

app.get('/api/menus', async (c) => {
  const page = c.req.query('page');
  const pageSize = c.req.query('pageSize');
  if (!page && !pageSize) {
    const menusRes = await c.env.DB.prepare('SELECT * FROM menus ORDER BY "order"').all();
    const menus = menusRes.results || [];
    const menusWithSubMenus = await Promise.all(
      menus.map(async (menu) => {
        const subRes = await c.env.DB.prepare(
          'SELECT * FROM sub_menus WHERE parent_id = ? ORDER BY "order"'
        ).bind(menu.id).all();
        return { ...menu, subMenus: subRes.results || [] };
      })
    );
    return c.json(menusWithSubMenus);
  }

  const pageNum = parseInt(page || '1', 10) || 1;
  const size = parseInt(pageSize || '10', 10) || 10;
  const offset = (pageNum - 1) * size;
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) as total FROM menus').first();
  const rows = await c.env.DB.prepare('SELECT * FROM menus ORDER BY "order" LIMIT ? OFFSET ?')
    .bind(size, offset)
    .all();
  return c.json({
    total: countRow?.total || 0,
    page: pageNum,
    pageSize: size,
    data: rows.results || []
  });
});

app.get('/api/menus/:id/submenus', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM sub_menus WHERE parent_id = ? ORDER BY "order"'
  ).bind(c.req.param('id')).all();
  return c.json(rows.results || []);
});

app.post('/api/menus', requireAuth, async (c) => {
  const body = await c.req.json();
  const name = body?.name;
  const order = body?.order || 0;
  const result = await c.env.DB.prepare(
    'INSERT INTO menus (name, "order") VALUES (?, ?)'
  ).bind(name, order).run();
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/menus/:id', requireAuth, async (c) => {
  const body = await c.req.json();
  const name = body?.name;
  const order = body?.order || 0;
  const result = await c.env.DB.prepare(
    'UPDATE menus SET name=?, "order"=? WHERE id=?'
  ).bind(name, order, c.req.param('id')).run();
  return c.json({ changed: result.meta.changes });
});

app.delete('/api/menus/:id', requireAuth, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM menus WHERE id=?')
    .bind(c.req.param('id'))
    .run();
  return c.json({ deleted: result.meta.changes });
});

app.post('/api/menus/:id/submenus', requireAuth, async (c) => {
  const body = await c.req.json();
  const name = body?.name;
  const order = body?.order || 0;
  const result = await c.env.DB.prepare(
    'INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)'
  ).bind(c.req.param('id'), name, order).run();
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/menus/submenus/:id', requireAuth, async (c) => {
  const body = await c.req.json();
  const name = body?.name;
  const order = body?.order || 0;
  const result = await c.env.DB.prepare(
    'UPDATE sub_menus SET name=?, "order"=? WHERE id=?'
  ).bind(name, order, c.req.param('id')).run();
  return c.json({ changed: result.meta.changes });
});

app.delete('/api/menus/submenus/:id', requireAuth, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM sub_menus WHERE id=?')
    .bind(c.req.param('id'))
    .run();
  return c.json({ deleted: result.meta.changes });
});

app.get('/api/cards/:menuId', async (c) => {
  const menuId = c.req.param('menuId');
  const subMenuId = c.req.query('subMenuId');
  let query = '';
  let params = [];

  if (subMenuId) {
    query = 'SELECT * FROM cards WHERE sub_menu_id = ? ORDER BY "order"';
    params = [subMenuId];
  } else {
    query = 'SELECT * FROM cards WHERE menu_id = ? AND sub_menu_id IS NULL ORDER BY "order"';
    params = [menuId];
  }

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  const data = (rows.results || []).map((card) => {
    if (!card.custom_logo_path) {
      const base = card.logo_url || (card.url || '').replace(/\/+$/, '') + '/favicon.ico';
      return { ...card, display_logo: base };
    }
    return { ...card, display_logo: '/uploads/' + card.custom_logo_path };
  });
  return c.json(data);
});

app.post('/api/cards', requireAuth, async (c) => {
  const body = await c.req.json();
  const result = await c.env.DB.prepare(
    'INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, custom_logo_path, desc, "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    body?.menu_id ?? null,
    body?.sub_menu_id ?? null,
    body?.title ?? '',
    body?.url ?? '',
    body?.logo_url ?? null,
    body?.custom_logo_path ?? null,
    body?.desc ?? null,
    body?.order ?? 0
  ).run();
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/cards/:id', requireAuth, async (c) => {
  const body = await c.req.json();
  const result = await c.env.DB.prepare(
    'UPDATE cards SET menu_id=?, sub_menu_id=?, title=?, url=?, logo_url=?, custom_logo_path=?, desc=?, "order"=? WHERE id=?'
  ).bind(
    body?.menu_id ?? null,
    body?.sub_menu_id ?? null,
    body?.title ?? '',
    body?.url ?? '',
    body?.logo_url ?? null,
    body?.custom_logo_path ?? null,
    body?.desc ?? null,
    body?.order ?? 0,
    c.req.param('id')
  ).run();
  return c.json({ changed: result.meta.changes });
});

app.delete('/api/cards/:id', requireAuth, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM cards WHERE id=?')
    .bind(c.req.param('id'))
    .run();
  return c.json({ deleted: result.meta.changes });
});

app.post('/api/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('logo');
  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file uploaded' }, 400);
  }
  if (!c.env.UPLOADS) {
    return c.json({ error: 'UPLOADS binding not configured' }, 500);
  }

  const name = file.name || '';
  const extIndex = name.lastIndexOf('.');
  const ext = extIndex >= 0 ? name.slice(extIndex) : '';
  const filename = `${Date.now()}${ext}`;
  const data = await file.arrayBuffer();
  await c.env.UPLOADS.put(filename, data, {
    httpMetadata: { contentType: file.type }
  });

  return c.json({ filename, url: '/uploads/' + filename });
});

app.get('/api/friends', async (c) => {
  const page = c.req.query('page');
  const pageSize = c.req.query('pageSize');
  if (!page && !pageSize) {
    const rows = await c.env.DB.prepare('SELECT * FROM friends').all();
    return c.json(rows.results || []);
  }

  const pageNum = parseInt(page || '1', 10) || 1;
  const size = parseInt(pageSize || '10', 10) || 10;
  const offset = (pageNum - 1) * size;
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) as total FROM friends').first();
  const rows = await c.env.DB.prepare('SELECT * FROM friends LIMIT ? OFFSET ?')
    .bind(size, offset)
    .all();
  return c.json({
    total: countRow?.total || 0,
    page: pageNum,
    pageSize: size,
    data: rows.results || []
  });
});

app.post('/api/friends', requireAuth, async (c) => {
  const body = await c.req.json();
  const result = await c.env.DB.prepare(
    'INSERT INTO friends (title, url, logo) VALUES (?, ?, ?)'
  ).bind(body?.title ?? '', body?.url ?? '', body?.logo ?? null).run();
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/friends/:id', requireAuth, async (c) => {
  const body = await c.req.json();
  const result = await c.env.DB.prepare(
    'UPDATE friends SET title=?, url=?, logo=? WHERE id=?'
  ).bind(body?.title ?? '', body?.url ?? '', body?.logo ?? null, c.req.param('id')).run();
  return c.json({ changed: result.meta.changes });
});

app.delete('/api/friends/:id', requireAuth, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM friends WHERE id=?')
    .bind(c.req.param('id'))
    .run();
  return c.json({ deleted: result.meta.changes });
});

app.get('/api/users/profile', requireAuth, async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT id, username FROM users WHERE id = ?')
    .bind(user.id)
    .first();
  if (!row) return c.json({ message: '用户不存在' }, 404);
  return c.json({ data: row });
});

app.get('/api/users/me', requireAuth, async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT id, username, last_login_time, last_login_ip FROM users WHERE id = ?'
  ).bind(user.id).first();
  if (!row) return c.json({ message: '用户不存在' }, 404);
  return c.json({
    last_login_time: row.last_login_time,
    last_login_ip: row.last_login_ip
  });
});

app.put('/api/users/password', requireAuth, async (c) => {
  const body = await c.req.json();
  const oldPassword = body?.oldPassword;
  const newPassword = body?.newPassword;

  if (!oldPassword || !newPassword) {
    return c.json({ message: '请提供旧密码和新密码' }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ message: '新密码长度至少6位' }, 400);
  }

  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT password FROM users WHERE id = ?')
    .bind(user.id)
    .first();
  if (!row) return c.json({ message: '用户不存在' }, 404);

  const ok = await bcrypt.compare(oldPassword, row.password);
  if (!ok) return c.json({ message: '旧密码错误' }, 400);

  const hash = await bcrypt.hash(newPassword, 10);
  await c.env.DB.prepare('UPDATE users SET password = ? WHERE id = ?')
    .bind(hash, user.id)
    .run();
  return c.json({ message: '密码修改成功' });
});

app.get('/api/users', requireAuth, async (c) => {
  const page = c.req.query('page');
  const pageSize = c.req.query('pageSize');
  if (!page && !pageSize) {
    const rows = await c.env.DB.prepare('SELECT id, username FROM users').all();
    return c.json({ data: rows.results || [] });
  }

  const pageNum = parseInt(page || '1', 10) || 1;
  const size = parseInt(pageSize || '10', 10) || 10;
  const offset = (pageNum - 1) * size;
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) as total FROM users').first();
  const rows = await c.env.DB.prepare('SELECT id, username FROM users LIMIT ? OFFSET ?')
    .bind(size, offset)
    .all();
  return c.json({
    total: countRow?.total || 0,
    page: pageNum,
    pageSize: size,
    data: rows.results || []
  });
});

// ==================== 书签导入 API ====================

/**
 * POST /api/import/bookmarks
 * 导入 Google Chrome 导出的书签 HTML 文件
 *
 * 参数:
 * - file: HTML 文件 (multipart/form-data)
 * - mode: merge | replace (默认 merge)
 * - target: auto | menu:<id> (默认 auto)
 * - dryRun: true | false (默认 false)
 */
app.post('/api/import/bookmarks', requireAuth, async (c) => {
  try {
    // 解析 form data
    const formData = await c.req.formData();
    const file = formData.get('file');
    const mode = formData.get('mode') || c.req.query('mode') || 'merge';
    const target = formData.get('target') || c.req.query('target') || 'auto';
    const dryRunParam = formData.get('dryRun') || c.req.query('dryRun') || 'false';
    const dryRun = dryRunParam === 'true' || dryRunParam === true;

    // 验证文件
    if (!file || typeof file === 'string') {
      return c.json({ ok: false, error: '请上传书签 HTML 文件' }, 400);
    }

    // 检查文件大小
    const fileSize = file.size || 0;
    if (fileSize > MAX_FILE_SIZE) {
      return c.json({ ok: false, error: `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 400);
    }

    // 读取文件内容
    const htmlContent = await file.text();
    if (!htmlContent || htmlContent.length < 10) {
      return c.json({ ok: false, error: '文件内容为空或无效' }, 400);
    }

    // 解析书签 HTML
    const { menus: parsedMenus, errors: parseErrors } = parseBookmarkHtml(htmlContent);
    const { menuList, subMenuList, cardList } = flattenParsedData(parsedMenus);

    // 统计数据
    const stats = {
      created: { menus: 0, subMenus: 0, cards: 0 },
      updated: { menus: 0, subMenus: 0, cards: 0 },
      skipped: { menus: 0, subMenus: 0, cards: 0 }
    };
    const sample = [];
    const errors = [...parseErrors];

    // 如果没有解析到任何数据
    if (menuList.length === 0 && cardList.length === 0) {
      return c.json({
        ok: false,
        error: '未能从书签文件中解析出有效数据',
        errors,
        dryRun
      }, 400);
    }

    // 解析 target 参数
    let targetMenuId = null;
    if (target !== 'auto' && target.startsWith('menu:')) {
      targetMenuId = parseInt(target.replace('menu:', ''), 10);
      if (isNaN(targetMenuId)) {
        return c.json({ ok: false, error: 'target 参数格式错误' }, 400);
      }
      // 验证目标菜单存在
      const targetMenu = await c.env.DB.prepare('SELECT id FROM menus WHERE id = ?')
        .bind(targetMenuId)
        .first();
      if (!targetMenu) {
        return c.json({ ok: false, error: `目标栏目 (id=${targetMenuId}) 不存在` }, 404);
      }
    }

    // dry run 模式: 只返回预览
    if (dryRun) {
      // 计算预览统计
      if (target === 'auto') {
        // 查询已存在的 menus
        const existingMenus = await c.env.DB.prepare('SELECT name FROM menus').all();
        const existingMenuNames = new Set((existingMenus.results || []).map(m => m.name));

        for (const menu of menuList) {
          if (existingMenuNames.has(menu.name)) {
            stats.skipped.menus++;
          } else {
            stats.created.menus++;
          }
        }
      }

      stats.created.subMenus = subMenuList.length;
      stats.created.cards = cardList.length;

      // 提取样本
      const sampleCards = cardList.slice(0, 10).map(card => ({
        title: card.title,
        url: card.url
      }));

      return c.json({
        ok: true,
        dryRun: true,
        created: stats.created,
        updated: stats.updated,
        skipped: stats.skipped,
        errors,
        sample: sampleCards,
        summary: {
          totalMenus: menuList.length,
          totalSubMenus: subMenuList.length,
          totalCards: cardList.length
        }
      });
    }

    // ========== 实际导入 ==========

    // replace 模式: 先删除数据
    if (mode === 'replace') {
      if (targetMenuId) {
        // 只删除目标菜单下的数据
        await c.env.DB.prepare('DELETE FROM cards WHERE menu_id = ?').bind(targetMenuId).run();
        await c.env.DB.prepare('DELETE FROM sub_menus WHERE parent_id = ?').bind(targetMenuId).run();
      } else {
        // 删除所有导入相关的数据（按名称匹配）
        for (const menu of menuList) {
          const existing = await c.env.DB.prepare('SELECT id FROM menus WHERE name = ?')
            .bind(menu.name)
            .first();
          if (existing) {
            await c.env.DB.prepare('DELETE FROM cards WHERE menu_id = ?').bind(existing.id).run();
            await c.env.DB.prepare('DELETE FROM sub_menus WHERE parent_id = ?').bind(existing.id).run();
            await c.env.DB.prepare('DELETE FROM menus WHERE id = ?').bind(existing.id).run();
          }
        }
      }
    }

    // 映射表: tempId -> 实际 ID
    const menuIdMap = new Map();
    const subMenuIdMap = new Map();

    // 1. 创建/复用 menus
    if (target === 'auto') {
      for (const menu of menuList) {
        // 查找同名菜单
        const existing = await c.env.DB.prepare('SELECT id FROM menus WHERE name = ?')
          .bind(menu.name)
          .first();

        if (existing) {
          menuIdMap.set(menu._tempId, existing.id);
          stats.skipped.menus++;
        } else {
          const result = await c.env.DB.prepare(
            'INSERT INTO menus (name, "order") VALUES (?, ?)'
          ).bind(menu.name, menu.order).run();
          menuIdMap.set(menu._tempId, result.meta.last_row_id);
          stats.created.menus++;
        }
      }
    } else {
      // target = menu:<id>, 所有内容都导入到指定菜单
      for (const menu of menuList) {
        menuIdMap.set(menu._tempId, targetMenuId);
      }
    }

    // 2. 创建 sub_menus
    for (const subMenu of subMenuList) {
      const parentId = menuIdMap.get(subMenu._menuTempId);
      if (!parentId) {
        errors.push(`子栏目 "${subMenu.name}" 的父栏目未找到`);
        continue;
      }

      // 查找同名子菜单
      const existing = await c.env.DB.prepare(
        'SELECT id FROM sub_menus WHERE parent_id = ? AND name = ?'
      ).bind(parentId, subMenu.name).first();

      if (existing) {
        subMenuIdMap.set(subMenu._tempId, existing.id);
        stats.skipped.subMenus++;
      } else {
        const result = await c.env.DB.prepare(
          'INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)'
        ).bind(parentId, subMenu.name, subMenu.order).run();
        subMenuIdMap.set(subMenu._tempId, result.meta.last_row_id);
        stats.created.subMenus++;
      }
    }

    // 3. 批量创建 cards (使用去重策略)
    // 先获取目标范围内已存在的 URL
    const existingUrls = new Map(); // key: "menuId-subMenuId-url", value: card id

    // 收集所有需要检查的 menu_id
    const allMenuIds = [...new Set(menuIdMap.values())];
    for (const menuId of allMenuIds) {
      const cardsInMenu = await c.env.DB.prepare(
        'SELECT id, url, sub_menu_id FROM cards WHERE menu_id = ?'
      ).bind(menuId).all();

      for (const card of (cardsInMenu.results || [])) {
        const key = `${menuId}-${card.sub_menu_id || 'null'}-${card.url}`;
        existingUrls.set(key, card.id);
      }
    }

    // 批量插入 cards
    for (const card of cardList) {
      const menuId = menuIdMap.get(card._menuTempId);
      const subMenuId = card._subMenuTempId ? subMenuIdMap.get(card._subMenuTempId) : null;

      if (!menuId) {
        errors.push(`卡片 "${card.title}" 的所属栏目未找到`);
        continue;
      }

      const urlKey = `${menuId}-${subMenuId || 'null'}-${card.url}`;

      if (existingUrls.has(urlKey)) {
        // URL 已存在，跳过
        stats.skipped.cards++;
      } else {
        // 插入新卡片
        await c.env.DB.prepare(
          'INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, custom_logo_path, desc, "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          menuId,
          subMenuId,
          card.title,
          card.url,
          null,
          null,
          card.desc || null,
          card.order
        ).run();
        stats.created.cards++;

        // 添加到已存在集合，防止同一批次重复
        existingUrls.set(urlKey, true);
      }
    }

    // 生成样本
    const sampleCards = cardList.slice(0, 5).map(card => ({
      title: card.title,
      url: card.url
    }));

    return c.json({
      ok: true,
      dryRun: false,
      created: stats.created,
      updated: stats.updated,
      skipped: stats.skipped,
      errors,
      sample: sampleCards
    });

  } catch (e) {
    console.error('Import bookmarks error:', e);
    return c.json({ ok: false, error: `导入失败: ${e.message}` }, 500);
  }
});

export const onRequest = (c) => app.fetch(c.request, c.env, c.executionCtx);
