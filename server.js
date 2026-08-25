const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'hp_' + crypto.randomBytes(32).toString('hex');
const DATA_DIR = path.join(__dirname, 'data');
const ADMIN_ACCOUNT = { username: 'nextrastore', email: 'admin@nextrastore.com', password: 'passnextrastore' };

// ===== CUSTOM COOKIE PARSER (ไม่ต้องใช้ module) =====
const parseCookies = (header) => {
  const out = {};
  if (!header) return out;
  header.split(/;\s*/).forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1);
      try { out[key] = decodeURIComponent(val); } catch { out[key] = val; }
    }
  });
  return out;
};

// ===== CUSTOM UUID (ไม่ต้องใช้ module) =====
const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const shortId = () => crypto.randomBytes(4).toString('hex');

// ===== MIDDLEWARE =====
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom cookie parser
app.use((req, res, next) => {
  req.cookies = parseCookies(req.headers.cookie);
  next();
});

app.use(express.static(__dirname));

// ===== DATABASE =====
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const dbFiles = {
  users: 'users.json',
  orders: 'orders.json',
  logs: 'logs.json',
  codes: 'codes.json',
  sessions: 'sessions.json',
  announcements: 'announcements.json',
  messages: 'messages.json',
  activity: 'activity.json',
  settings: 'settings.json'
};

const readDB = (k) => {
  const f = path.join(DATA_DIR, dbFiles[k]);
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); }
  catch { return []; }
};

const writeDB = (k, d) => {
  const f = path.join(DATA_DIR, dbFiles[k]);
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
};

const logEvent = (type, message, meta = {}) => {
  try {
    const logs = readDB('logs');
    logs.unshift({ id: shortId(), type, message, meta, timestamp: new Date().toISOString() });
    if (logs.length > 5000) logs.length = 5000;
    writeDB('logs', logs);
  } catch (e) { console.error('log error', e); }
};

const trackActivity = (userId, action, details = {}) => {
  try {
    const acts = readDB('activity');
    acts.unshift({ id: shortId(), userId, action, details, timestamp: new Date().toISOString() });
    if (acts.length > 1000) acts.length = 1000;
    writeDB('activity', acts);
  } catch (e) {}
};

// ===== SETTINGS =====
const DEFAULT_SETTINGS = {
  site: {
    name: 'HIDDEN PRO', logo: '🔥',
    description: 'บริการขายโปรแกรมเมอร์ฟรีไฟ • เข้าใช้งานง่าย • ปลอดภัย 100% • อัปเดตทุกแพตช์',
    keywords: 'free fire, hack, mod, ฟรีไฟ, โปร',
    contact: { discord: 'discord.gg/hiddenpro', line: '@hiddenpro', email: 'support@hiddenpro.shop' }
  },
  theme: { primary: '#ff5722', accent: '#ff9800', bg: '#0a0a0f' },
  content: {
    heroTitle1: 'HIDDEN', heroTitle2: 'PRO',
    heroSub: 'บริการขายโปรแกรมเมอร์ฟรีไฟ • เข้าใช้งานง่าย • ปลอดภัย 100% • อัปเดตทุกแพตช์',
    marquee: ['🔥 อัปเดต OB47 แล้ว', '⚡ เซิร์ฟเวอร์เสถียร 99.9%', '🎯 Aimbot • Wallhack • ESP • Anti-Ban', '💎 รองรับทุกดีไวซ์', '🚀 ติดตั้งง่ายใน 3 นาที']
  },
  packages: {
    daily:    { id: 'daily',    name: 'DAILY PASS',    price: 49,    oldPrice: 99,    days: 1,     image: '🎯', tag: 'มาใหม่',   featured: false, enabled: true, order: 1 },
    weekly:   { id: 'weekly',   name: 'WEEKLY',        price: 249,   oldPrice: 499,   days: 7,     image: '⚡', tag: 'ยอดนิยม', featured: false, enabled: true, order: 2 },
    monthly:  { id: 'monthly',  name: 'MONTHLY VIP',   price: 799,   oldPrice: 1490,  days: 30,    image: '💎', tag: 'แนะนำ',    featured: true,  enabled: true, order: 3 },
    season:   { id: 'season',   name: 'SEASON PASS',   price: 1899,  oldPrice: 3990,  days: 90,    image: '👑', tag: 'คุ้มสุด',   featured: false, enabled: true, order: 4 },
    lifetime: { id: 'lifetime', name: 'LIFETIME',      price: 3999,  oldPrice: 7990,  days: 99999, image: '🏆', tag: 'ถาวร',      featured: false, enabled: true, order: 5 }
  },
  payments: {
    truemoney: { enabled: true, wallet: '08x-xxx-xxxx' },
    promptpay: { enabled: true, id: '0812345678', name: 'HIDDEN PRO' },
    bank: { enabled: true, bank: 'กสิกรไทย', account: 'xxx-x-xx-xxxx', name: 'HIDDEN PRO' },
    usdt: { enabled: true, address: 'TXxx...', network: 'TRC20' }
  },
  system: {
    autoApprove: false, maintenance: false,
    minTopup: 50, registerBonus: 0,
    telegramNotify: '', discordWebhook: ''
  }
};

const getSettings = () => {
  const f = path.join(DATA_DIR, 'settings.json');
  if (!fs.existsSync(f)) { fs.writeFileSync(f, JSON.stringify(DEFAULT_SETTINGS, null, 2)); return DEFAULT_SETTINGS; }
  try {
    const loaded = JSON.parse(fs.readFileSync(f, 'utf-8'));
    return { ...DEFAULT_SETTINGS, ...loaded };
  } catch { return DEFAULT_SETTINGS; }
};
const saveSettings = (s) => fs.writeFileSync(path.join(DATA_DIR, 'settings.json'), JSON.stringify(s, null, 2));

// ===== ENSURE ADMIN =====
function ensureAdmin() {
  try {
    const users = readDB('users');
    let admin = users.find(u => u.username === ADMIN_ACCOUNT.username);
    if (!admin) {
      const hash = crypto.createHash('sha256').update(ADMIN_ACCOUNT.password + JWT_SECRET).digest('hex');
      admin = {
        id: crypto.randomBytes(8).toString('hex'),
        username: ADMIN_ACCOUNT.username, email: ADMIN_ACCOUNT.email, password: hash,
        role: 'admin', credits: 999999, activePkg: 'lifetime',
        expiresAt: new Date(Date.now() + 99999 * 86400000).toISOString(),
        banned: false, createdAt: new Date().toISOString(),
        ip: '127.0.0.1', lastLogin: new Date().toISOString()
      };
      users.push(admin);
      writeDB('users', users);
    } else {
      const hash = crypto.createHash('sha256').update(ADMIN_ACCOUNT.password + JWT_SECRET).digest('hex');
      let changed = false;
      if (admin.password !== hash) { admin.password = hash; changed = true; }
      if (admin.role !== 'admin') { admin.role = 'admin'; changed = true; }
      if (changed) writeDB('users', users);
    }
  } catch (e) { console.error('ensureAdmin error', e); }
}
ensureAdmin();

// ===== AUTH =====
const auth = (req, res, next) => {
  let token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.hp_token;
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token หมดอายุ' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'ต้องเป็นแอดมิน' });
  next();
};

// ===== SESSIONS =====
function newSession(userId, username, req, remember) {
  const sessions = readDB('sessions');
  const s = {
    id: crypto.randomBytes(32).toString('hex'),
    userId, username,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    device: /Mobile|Android|iPhone/i.test(req.headers['user-agent'] || '') ? '📱 Mobile' : '💻 Desktop',
    remember: !!remember,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    expiresAt: Date.now() + (remember ? 30 : 7) * 86400000
  };
  sessions.push(s);
  writeDB('sessions', sessions);
  return s;
}

// ===== PUBLIC ROUTES =====
app.get('/api/settings', (req, res) => {
  const s = getSettings();
  const safe = JSON.parse(JSON.stringify(s));
  if (safe.payments?.bank?.account) safe.payments.bank.account = '***-*-****';
  res.json(safe);
});

app.get('/api/packages', (req, res) => res.json(getSettings().packages));

app.get('/api/announcements', (req, res) => res.json(readDB('announcements').filter(a => a.active).slice(0, 5)));

// ===== AUTH ROUTES =====
app.post('/api/register', (req, res) => {
  try {
    const { username, email, password, rememberMe } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
    if (username.length < 3) return res.status(400).json({ error: 'username อย่างน้อย 3 ตัวอักษร' });
    if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' });
    if (!email.includes('@')) return res.status(400).json({ error: 'อีเมลไม่ถูกต้อง' });

    const users = readDB('users');
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'username ซ้ำ' });
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'email ซ้ำ' });

    const s = getSettings();
    const hash = crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
    const newUser = {
      id: crypto.randomBytes(8).toString('hex'),
      username, email, password: hash, role: 'user',
      credits: s.system?.registerBonus || 0,
      activePkg: null, expiresAt: null, banned: false,
      createdAt: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      lastLogin: new Date().toISOString()
    };
    users.push(newUser);
    writeDB('users', users);
    logEvent('register', `New: ${username}`);
    trackActivity(newUser.id, 'register');

    const remember = !!rememberMe;
    const token = jwt.sign({ id: newUser.id, username, role: 'user' }, JWT_SECRET, { expiresIn: remember ? '30d' : '7d' });
    const sess = newSession(newUser.id, username, req, remember);

    if (remember) {
      res.cookie('hp_token', token, { maxAge: 30 * 86400000, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
      res.cookie('hp_session', sess.id, { maxAge: 30 * 86400000, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    }
    res.json({ success: true, message: 'สมัครสำเร็จ', token, sessionId: sess.id, user: { id: newUser.id, username, email, role: 'user', credits: newUser.credits } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'เกิดข้อผิดพลาด' }); }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password, rememberMe } = req.body || {};
    const users = readDB('users');
    const user = users.find(u => u.username === username || u.email === username);
    if (!user) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });
    if (user.banned) return res.status(403).json({ error: 'บัญชีถูกระงับ' });
    const hash = crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
    if (user.password !== hash) return res.status(401).json({ error: 'รหัสผ่านผิด' });

    user.lastLogin = new Date().toISOString();
    user.ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    writeDB('users', users);
    trackActivity(user.id, 'login');

    const remember = !!rememberMe;
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: remember ? '30d' : '7d' });
    const sess = newSession(user.id, user.username, req, remember);

    if (remember) {
      res.cookie('hp_token', token, { maxAge: 30 * 86400000, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
      res.cookie('hp_session', sess.id, { maxAge: 30 * 86400000, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    }
    logEvent('login', `Login: ${user.username}`);
    res.json({ success: true, token, sessionId: sess.id, remember, user: { id: user.id, username: user.username, email: user.email, role: user.role, credits: user.credits, activePkg: user.activePkg, expiresAt: user.expiresAt } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'เกิดข้อผิดพลาด' }); }
});

app.get('/api/auto-login', (req, res) => {
  try {
    const token = req.cookies?.hp_token;
    const sessionId = req.cookies?.hp_session;
    if (!token || !sessionId) return res.status(401).json({ error: 'no_session' });
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ error: 'expired' }); }
    const sessions = readDB('sessions');
    const sess = sessions.find(s => s.id === sessionId);
    if (!sess || sess.expiresAt < Date.now() || sess.userId !== decoded.id) return res.status(401).json({ error: 'session_expired' });
    sess.lastActive = new Date().toISOString();
    writeDB('sessions', sessions);
    const user = readDB('users').find(u => u.id === decoded.id);
    if (!user || user.banned) return res.status(403).json({ error: 'banned' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, role: user.role, credits: user.credits, activePkg: user.activePkg, expiresAt: user.expiresAt }, session: sess });
  } catch (e) { console.error(e); res.status(500).json({ error: 'error' }); }
});

app.post('/api/refresh', auth, (req, res) => {
  try {
    const sess = readDB('sessions').find(s => s.id === req.cookies?.hp_session);
    const remember = sess?.remember || false;
    const user = readDB('users').find(u => u.id === req.user.id);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: remember ? '30d' : '7d' });
    if (remember) res.cookie('hp_token', token, { maxAge: 30 * 86400000, httpOnly: true, sameSite: 'lax' });
    res.json({ success: true, token });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.post('/api/logout', (req, res) => {
  const sid = req.cookies?.hp_session;
  if (sid) writeDB('sessions', readDB('sessions').filter(s => s.id !== sid));
  res.clearCookie('hp_token');
  res.clearCookie('hp_session');
  res.json({ success: true });
});

app.post('/api/logout-all', auth, (req, res) => {
  writeDB('sessions', readDB('sessions').filter(s => s.userId !== req.user.id));
  res.clearCookie('hp_token');
  res.clearCookie('hp_session');
  res.json({ success: true });
});

app.get('/api/me', auth, (req, res) => {
  const u = readDB('users').find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'ไม่พบ' });
  res.json({ id: u.id, username: u.username, email: u.email, role: u.role, credits: u.credits, activePkg: u.activePkg, expiresAt: u.expiresAt });
});

app.get('/api/my/sessions', auth, (req, res) => {
  res.json(readDB('sessions').filter(s => s.userId === req.user.id).map(s => ({
    id: s.id, device: s.device, ip: s.ip, createdAt: s.createdAt, lastActive: s.lastActive,
    remember: s.remember, current: s.id === req.cookies?.hp_session
  })));
});

app.get('/api/my/messages', auth, (req, res) => res.json(readDB('messages').filter(m => m.userId === req.user.id)));
app.post('/api/my/messages/:id/read', auth, (req, res) => {
  const messages = readDB('messages');
  const msg = messages.find(m => m.id === req.params.id && m.userId === req.user.id);
  if (msg) { msg.read = true; writeDB('messages', messages); }
  res.json({ success: true });
});

// ===== ORDERS =====
app.post('/api/orders/create', auth, (req, res) => {
  try {
    const { pkgId, method, slip } = req.body || {};
    const pkgs = getSettings().packages;
    const pkg = pkgs[pkgId];
    if (!pkg) return res.status(400).json({ error: 'ไม่พบแพ็คเกจ' });
    if (!method) return res.status(400).json({ error: 'เลือกวิธีชำระเงิน' });
    const orders = readDB('orders');
    const order = {
      id: 'ORD' + Date.now().toString(36).toUpperCase(),
      userId: req.user.id, username: req.user.username,
      pkgId, pkgName: pkg.name, amount: pkg.price,
      method, slip: slip || null, status: 'pending',
      createdAt: new Date().toISOString(), approvedAt: null, rejectReason: null,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    };
    orders.unshift(order);
    writeDB('orders', orders);
    logEvent('order', `${order.id} from ${req.user.username}`);
    trackActivity(req.user.id, 'order', { pkgId });
    res.json({ success: true, order });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.get('/api/orders/my', auth, (req, res) => {
  res.json(readDB('orders').filter(o => o.userId === req.user.id).slice(0, 100));
});

app.post('/api/redeem', auth, (req, res) => {
  try {
    const { code } = req.body || {};
    const codes = readDB('codes');
    const cd = codes.find(c => c.code === code?.toUpperCase());
    if (!cd) return res.status(404).json({ error: 'โค้ดไม่ถูกต้อง' });
    if (cd.used >= cd.maxUse) return res.status(400).json({ error: 'โค้ดถูกใช้แล้ว' });
    const pkgs = getSettings().packages;
    const users = readDB('users');
    const user = users.find(u => u.id === req.user.id);
    if (cd.type === 'credits') user.credits = (user.credits || 0) + cd.value;
    else if (cd.type === 'package' && pkgs[cd.pkgId]) {
      const pkg = pkgs[cd.pkgId];
      const start = user.expiresAt && new Date(user.expiresAt) > new Date() ? new Date(user.expiresAt) : new Date();
      user.activePkg = cd.pkgId;
      user.expiresAt = new Date(start.getTime() + pkg.days * 86400000).toISOString();
    }
    cd.used = (cd.used || 0) + 1;
    cd.usedBy = cd.usedBy || [];
    cd.usedBy.push({ username: req.user.username, at: new Date().toISOString() });
    writeDB('users', users);
    writeDB('codes', codes);
    logEvent('redeem', `${code} by ${req.user.username}`);
    res.json({ success: true, message: 'ใช้โค้ดสำเร็จ!' });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

// ===== ADMIN ROUTES =====
const admin = [auth, adminOnly];

app.get('/api/admin/stats', admin, (req, res) => {
  try {
    const users = readDB('users');
    const orders = readDB('orders');
    const sessions = readDB('sessions');
    const now = Date.now();
    const today = new Date(); today.setHours(0,0,0,0);
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);

    const todayOrders = orders.filter(o => new Date(o.createdAt) >= today);
    const monthOrders = orders.filter(o => new Date(o.createdAt) >= thisMonth);
    const onlineSessions = sessions.filter(s => now - new Date(s.lastActive).getTime() < 5 * 60 * 1000);

    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const dayOrders = orders.filter(o => new Date(o.createdAt) >= d && new Date(o.createdAt) < next);
      const dayRevenue = dayOrders.filter(o => o.status === 'approved').reduce((s, o) => s + o.amount, 0);
      last7.push({ date: d.toISOString().slice(5, 10), orders: dayOrders.length, revenue: dayRevenue });
    }

    res.json({
      totalUsers: users.length, totalOrders: orders.length,
      todayOrders: todayOrders.length, monthOrders: monthOrders.length,
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      approvedOrders: orders.filter(o => o.status === 'approved').length,
      rejectedOrders: orders.filter(o => o.status === 'rejected').length,
      totalRevenue: orders.filter(o => o.status === 'approved').reduce((s, o) => s + o.amount, 0),
      monthRevenue: monthOrders.filter(o => o.status === 'approved').reduce((s, o) => s + o.amount, 0),
      todayRevenue: todayOrders.filter(o => o.status === 'approved').reduce((s, o) => s + o.amount, 0),
      onlineUsers: onlineSessions.length,
      activeUsers: users.filter(u => u.expiresAt && new Date(u.expiresAt) > new Date()).length,
      bannedUsers: users.filter(u => u.banned).length,
      chart7days: last7
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'error' }); }
});

app.get('/api/admin/orders', admin, (req, res) => {
  try {
    const { status, search, limit = 100 } = req.query;
    let orders = readDB('orders');
    if (status && status !== 'all') orders = orders.filter(o => o.status === status);
    if (search) orders = orders.filter(o => o.id.includes(search) || o.username.includes(search) || o.pkgName.includes(search));
    res.json({ orders: orders.slice(0, Number(limit)), total: orders.length });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.post('/api/admin/orders/approve', admin, (req, res) => {
  try {
    const orders = readDB('orders');
    const order = orders.find(o => o.id === req.body.orderId);
    if (!order || order.status !== 'pending') return res.status(400).json({ error: 'ไม่สามารถอนุมัติ' });
    order.status = 'approved';
    order.approvedAt = new Date().toISOString();
    order.approvedBy = req.user.username;
    writeDB('orders', orders);
    const pkgs = getSettings().packages;
    const users = readDB('users');
    const user = users.find(u => u.id === order.userId);
    if (user && pkgs[order.pkgId]) {
      const pkg = pkgs[order.pkgId];
      const start = user.expiresAt && new Date(user.expiresAt) > new Date() ? new Date(user.expiresAt) : new Date();
      user.activePkg = order.pkgId;
      user.expiresAt = new Date(start.getTime() + pkg.days * 86400000).toISOString();
      writeDB('users', users);
    }
    logEvent('approve', order.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.post('/api/admin/orders/reject', admin, (req, res) => {
  try {
    const orders = readDB('orders');
    const order = orders.find(o => o.id === req.body.orderId);
    if (order) { order.status = 'rejected'; order.rejectReason = req.body.reason || ''; order.rejectedBy = req.user.username; writeDB('orders', orders); }
    logEvent('reject', order?.id || 'unknown');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.post('/api/admin/orders/bulk-approve', admin, (req, res) => {
  try {
    const orders = readDB('orders');
    const { ids } = req.body || {};
    const pkgs = getSettings().packages;
    const users = readDB('users');
    let count = 0;
    orders.forEach(o => {
      if (ids?.includes(o.id) && o.status === 'pending') {
        o.status = 'approved';
        o.approvedAt = new Date().toISOString();
        o.approvedBy = req.user.username;
        const user = users.find(u => u.id === o.userId);
        if (user && pkgs[o.pkgId]) {
          const pkg = pkgs[o.pkgId];
          const start = user.expiresAt && new Date(user.expiresAt) > new Date() ? new Date(user.expiresAt) : new Date();
          user.activePkg = o.pkgId;
          user.expiresAt = new Date(start.getTime() + pkg.days * 86400000).toISOString();
        }
        count++;
      }
    });
    writeDB('orders', orders);
    writeDB('users', users);
    logEvent('bulk-approve', `${count} orders`);
    res.json({ success: true, count });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.get('/api/admin/users', admin, (req, res) => {
  try {
    const { search, role, limit = 200 } = req.query;
    let users = readDB('users');
    if (search) users = users.filter(u => u.username.includes(search) || u.email.includes(search));
    if (role && role !== 'all') users = users.filter(u => u.role === role);
    res.json({ users: users.map(u => ({ ...u, password: undefined })).slice(0, Number(limit)), total: users.length });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.post('/api/admin/users/ban', admin, (req, res) => {
  try {
    const users = readDB('users');
    const user = users.find(u => u.id === req.body.userId);
    if (user && user.role !== 'admin') { user.banned = !!req.body.banned; writeDB('users', users); }
    logEvent('ban', `${req.body.banned ? 'Banned' : 'Unbanned'} user`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.post('/api/admin/users/credits', admin, (req, res) => {
  try {
    const { userId, amount, action } = req.body || {};
    const users = readDB('users');
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (action === 'add') user.credits = (user.credits || 0) + Number(amount);
    else if (action === 'remove') user.credits = Math.max(0, (user.credits || 0) - Number(amount));
    else if (action === 'set') user.credits = Number(amount);
    writeDB('users', users);
    logEvent('credits', `${action} ${amount} to ${user.username}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.post('/api/admin/users/give-package', admin, (req, res) => {
  try {
    const { userId, pkgId, days } = req.body || {};
    const users = readDB('users');
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const pkgs = getSettings().packages;
    const pkg = pkgs[pkgId];
    if (!pkg) return res.status(404).json({ error: 'ไม่พบแพ็คเกจ' });
    const start = user.expiresAt && new Date(user.expiresAt) > new Date() ? new Date(user.expiresAt) : new Date();
    user.activePkg = pkgId;
    user.expiresAt = new Date(start.getTime() + (days || pkg.days) * 86400000).toISOString();
    writeDB('users', users);
    logEvent('gift', `${pkgId} to ${user.username}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.delete('/api/admin/users/:id', admin, (req, res) => {
  try {
    writeDB('users', readDB('users').filter(u => u.id !== req.params.id && u.role !== 'admin'));
    logEvent('user-delete', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

// ===== PACKAGES ADMIN =====
app.post('/api/admin/packages', admin, (req, res) => {
  try {
    const settings = getSettings();
    const { id, name, price, oldPrice, days, image, tag, featured, enabled } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ต้องมี id' });
    settings.packages[id] = { id, name, price, oldPrice: oldPrice || null, days, image: image || '🎁', tag: tag || '', featured: !!featured, enabled: enabled !== false, order: settings.packages[id]?.order || 99 };
    saveSettings(settings);
    logEvent('pkg-save', id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.delete('/api/admin/packages/:id', admin, (req, res) => {
  try {
    const settings = getSettings();
    delete settings.packages[req.params.id];
    saveSettings(settings);
    logEvent('pkg-delete', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

// ===== CODES ADMIN =====
app.post('/api/admin/codes/create', admin, (req, res) => {
  try {
    const codes = readDB('codes');
    const { code, type, value, pkgId, maxUse } = req.body || {};
    const newCode = {
      id: shortId(),
      code: (code || crypto.randomBytes(4).toString('hex').toUpperCase()).toUpperCase(),
      type: type || 'credits',
      value: value || 100,
      pkgId: pkgId || null,
      maxUse: maxUse || 1,
      used: 0,
      usedBy: [],
      createdAt: new Date().toISOString(),
      createdBy: req.user.username
    };
    codes.unshift(newCode);
    writeDB('codes', codes);
    logEvent('code', `Created ${newCode.code}`);
    res.json({ success: true, code: newCode });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.post('/api/admin/codes/bulk', admin, (req, res) => {
  try {
    const { count = 10, type, value, pkgId, maxUse = 1 } = req.body || {};
    const codes = readDB('codes');
    const created = [];
    for (let i = 0; i < Math.min(count, 100); i++) {
      const cd = {
        id: shortId(),
        code: crypto.randomBytes(4).toString('hex').toUpperCase(),
        type, value, pkgId, maxUse,
        used: 0, usedBy: [],
        createdAt: new Date().toISOString(),
        createdBy: req.user.username
      };
      codes.unshift(cd);
      created.push(cd);
    }
    writeDB('codes', codes);
    logEvent('bulk-code', `${created.length} codes`);
    res.json({ success: true, codes: created });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.delete('/api/admin/codes/:id', admin, (req, res) => {
  try { writeDB('codes', readDB('codes').filter(c => c.id !== req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: 'error' }); }
});

app.get('/api/admin/codes', admin, (req, res) => res.json(readDB('codes')));

// ===== ANNOUNCEMENTS =====
app.get('/api/admin/announcements', admin, (req, res) => res.json(readDB('announcements')));
app.post('/api/admin/announcements', admin, (req, res) => {
  try {
    const anns = readDB('announcements');
    const ann = {
      id: shortId(),
      title: req.body.title, message: req.body.message,
      type: req.body.type || 'info', active: true,
      createdAt: new Date().toISOString(),
      createdBy: req.user.username
    };
    anns.unshift(ann);
    writeDB('announcements', anns);
    logEvent('announcement', ann.title);
    res.json({ success: true, announcement: ann });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});
app.delete('/api/admin/announcements/:id', admin, (req, res) => {
  try { writeDB('announcements', readDB('announcements').filter(a => a.id !== req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: 'error' }); }
});
app.post('/api/admin/announcements/:id/toggle', admin, (req, res) => {
  try {
    const anns = readDB('announcements');
    const ann = anns.find(a => a.id === req.params.id);
    if (ann) { ann.active = !ann.active; writeDB('announcements', anns); }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

// ===== MESSAGES ADMIN =====
app.get('/api/admin/messages', admin, (req, res) => res.json(readDB('messages')));
app.post('/api/admin/messages/send', admin, (req, res) => {
  try {
    const messages = readDB('messages');
    const msg = {
      id: shortId(),
      userId: req.body.userId, title: req.body.title, message: req.body.message,
      read: false,
      createdAt: new Date().toISOString(),
      from: req.user.username
    };
    messages.unshift(msg);
    writeDB('messages', messages);
    logEvent('message', `To ${req.body.userId}: ${req.body.title}`);
    res.json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

// ===== SETTINGS ADMIN =====
app.post('/api/admin/settings', admin, (req, res) => {
  try {
    const current = getSettings();
    const updated = { ...current, ...req.body };
    saveSettings(updated);
    logEvent('settings', 'Updated');
    res.json({ success: true, settings: updated });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.get('/api/admin/settings', admin, (req, res) => res.json(getSettings()));

// ===== LOGS/ACTIVITY =====
app.get('/api/admin/logs', admin, (req, res) => {
  try {
    const { type, limit = 200 } = req.query;
    let logs = readDB('logs');
    if (type && type !== 'all') logs = logs.filter(l => l.type === type);
    res.json(logs.slice(0, Number(limit)));
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.get('/api/admin/activity', admin, (req, res) => res.json(readDB('activity').slice(0, 100)));

// ===== SYSTEM ADMIN =====
app.post('/api/admin/system/backup', admin, (req, res) => {
  try {
    res.json({
      timestamp: new Date().toISOString(),
      data: {
        users: readDB('users'), orders: readDB('orders'),
        codes: readDB('codes'), sessions: readDB('sessions'),
        settings: getSettings(), logs: readDB('logs').slice(0, 500)
      }
    });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.post('/api/admin/system/clear-cache', admin, (req, res) => {
  try {
    writeDB('sessions', readDB('sessions').filter(s => s.expiresAt > Date.now()));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.get('/api/admin/system/info', admin, (req, res) => {
  try {
    const files = Object.values(dbFiles).map(name => {
      const f = path.join(DATA_DIR, name);
      return { name, exists: fs.existsSync(f), size: fs.existsSync(f) ? fs.statSync(f).size : 0 };
    });
    res.json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      files,
      dataDir: DATA_DIR
    });
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

app.get('/api/admin/export/:type', admin, (req, res) => {
  try {
    const type = req.params.type;
    const map = { users: 'users', orders: 'orders', codes: 'codes', logs: 'logs' };
    if (!map[type]) return res.status(400).json({ error: 'invalid' });
    const data = readDB(map[type]);
    let csv = '';
    if (data.length) {
      csv += Object.keys(data[0]).join(',') + '\n';
      data.forEach(row => {
        csv += Object.values(row).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',') + '\n';
      });
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-${Date.now()}.csv`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: 'error' }); }
});

// ===== FALLBACK =====
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`🔥 HIDDEN PRO running on port ${PORT}`);
  console.log(`👤 Admin: ${ADMIN_ACCOUNT.username} / ${ADMIN_ACCOUNT.password}`);
});
