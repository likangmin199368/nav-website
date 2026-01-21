const baseArg = process.argv.find((arg) => arg.startsWith('--baseURL='));
const baseURL = baseArg ? baseArg.split('=')[1] : 'http://127.0.0.1:8788';

const adminUser = process.env.ADMIN_USERNAME;
const adminPass = process.env.ADMIN_PASSWORD;

if (!adminUser || !adminPass) {
  console.error('Missing ADMIN_USERNAME or ADMIN_PASSWORD env vars.');
  process.exit(1);
}

function url(path) {
  return `${baseURL}${path}`;
}

async function request(path, options = {}) {
  const res = await fetch(url(path), options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { res, data };
}

async function main() {
  const health = await request('/api/health');
  if (!health.res.ok) throw new Error(`/api/health failed: ${health.res.status}`);

  const login = await request('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: adminUser, password: adminPass })
  });
  if (!login.res.ok || !login.data?.token) {
    throw new Error(`/api/login failed: ${login.res.status}`);
  }
  const token = login.data.token;

  const me = await request('/api/users/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!me.res.ok) throw new Error(`/api/users/me failed: ${me.res.status}`);

  const menuCreate = await request('/api/menus', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name: 'Smoke Menu', order: 999 })
  });
  if (!menuCreate.res.ok || !menuCreate.data?.id) {
    throw new Error(`/api/menus POST failed: ${menuCreate.res.status}`);
  }

  const menuId = menuCreate.data.id;
  const cardCreate = await request('/api/cards', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      menu_id: menuId,
      sub_menu_id: null,
      title: 'Smoke Card',
      url: 'https://example.com',
      logo_url: '',
      desc: '',
      order: 1
    })
  });
  if (!cardCreate.res.ok || !cardCreate.data?.id) {
    throw new Error(`/api/cards POST failed: ${cardCreate.res.status}`);
  }

  const friendCreate = await request('/api/friends', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      title: 'Smoke Friend',
      url: 'https://example.com',
      logo: ''
    })
  });
  if (!friendCreate.res.ok || !friendCreate.data?.id) {
    throw new Error(`/api/friends POST failed: ${friendCreate.res.status}`);
  }

  const menuList = await request('/api/menus');
  if (!menuList.res.ok) throw new Error(`/api/menus GET failed: ${menuList.res.status}`);

  const cardList = await request(`/api/cards/${menuId}`);
  if (!cardList.res.ok) throw new Error(`/api/cards GET failed: ${cardList.res.status}`);

  const friendList = await request('/api/friends');
  if (!friendList.res.ok) throw new Error(`/api/friends GET failed: ${friendList.res.status}`);

  console.log('Smoke test passed.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
