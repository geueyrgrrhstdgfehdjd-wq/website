const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'hiddenpro_super_secret_2026_change_me_now';
const DATA_DIR = path.join(__dirname, 'data');

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files จาก root (ไม่ต้องมี public/)
app.use(express.static(__dirname));

// ===== DATABASE =====
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const dbFiles = {
  users: path.join(DATA_DIR, 'users.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  logs: path.join(DATA_DIR, 'logs.json'),
  codes: path.join(DATA_DIR, 'codes.json')
};

for (const file of Object.values(dbFiles)) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
}

const readDB = (key) => JSON.parse(fs.readFileSync(dbFiles[key], 'utf-8'));
const writeDB = (key, data) => fs.writeFileSync(dbFiles[key], JSON.stringify(data, null, 2));

const logEvent = (type, message, meta = {}) => {
  const logs = readDB('logs');
  logs.push({
    id: crypto.randomBytes(6).toString('hex'),
    type,
    message,
    meta,
    timestamp: new Date().toISOString()
  });
  if (logs.length > 2000) logs.shift();
  writeDB('logs', logs);
};

// ===== AUTH MIDDLEWARE =====
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'ต้องเป็นแอดมินเท่านั้น' });
  next();
};

// ===== PACKAGES CONFIG =====
const PACKAGES = {
  daily:    { name: 'DAILY PASS',    price: 49,    days: 1,     features: ['aimbot', 'esp', 'anti-ban-basic'] },
  weekly:   { name: 'WEEKLY',        price: 249,   days: 7,     features: ['aimbot-pro', 'wallhack', 'esp', 'anti-ban'] },
  monthly:  { name: 'MONTHLY VIP',   price: 799,   days: 30,    features: ['all'], popular: true },
  season:   { name: 'SEASON PASS',   price: 1899,  days: 90,    features: ['all', 'admin-tools', 'skins'] },
  lifetime: { name: 'LIFETIME',      price: 3999,  days: 99999, features: ['all', 'lifetime', 'pc-mobile', 'warranty'] }
};

// ===== ROUTES: AUTH =====
app.post('/api/register', (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบทุกช่อง' });
    if (username.length < 3) return res.status(400).json({ error: 'username ต้องมีอย่างน้อย 3 ตัวอักษร' });
    if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
    if (!email.includes('@')) return res.status(400).json({ error: 'อีเมลไม่ถูกต้อง' });

    const users = readDB('users');
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'username นี้ถูกใช้แล้ว' });
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });

    const hash = crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
    const isFirst = users.length === 0;
    const newUser = {
      id: crypto.randomBytes(8).toString('hex'),
      username,
      email,
      password: hash,
      role: isFirst ? 'admin' : 'user',
      credits: 0,
      activePkg: null,
      expiresAt: null,
      hwid: null,
      banned: false,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    writeDB('users', users);
    logEvent('register', `New user: ${username}`, { id: newUser.id, role: newUser.role });

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      success: true,
      message: isFirst ? 'สมัครสมาชิกสำเร็จ (คุณคือแอดมินคนแรก)' : 'สมัครสมาชิกสำเร็จ',
      token,
      user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'กรอก username และรหัสผ่าน' });

    const users = readDB('users');
    const user = users.find(u => u.username === username || u.email === username);
    if (!user) return res.status(401).json({ error: 'ไม่พบผู้ใช้นี้' });
    if (user.banned) return res.status(403).json({ error: 'บัญชีถูกระงับการใช้งาน' });

    const hash = crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
    if (user.password !== hash) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    logEvent('login', `User login: ${user.username}`);
    res.json({
      success: true,
      token,
      user: {
        id: user.id, username: user.username, email: user.email,
        role: user.role, credits: user.credits,
        activePkg: user.activePkg, expiresAt: user.expiresAt
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

app.get('/api/me', authMiddleware, (req, res) => {
  const users = readDB('users');
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  res.json({
    id: user.id, username: user.username, email: user.email,
    role: user.role, credits: user.credits,
    activePkg: user.activePkg, expiresAt: user.expiresAt, hwid: user.hwid
  });
});

// ===== ROUTES: PACKAGES =====
app.get('/api/packages', (req, res) => res.json(PACKAGES));

// ===== ROUTES: ORDERS =====
app.post('/api/orders/create', authMiddleware, (req, res) => {
  try {
    const { pkgId, method, slip, truemoneyUrl } = req.body;
    const pkg = PACKAGES[pkgId];
    if (!pkg) return res.status(400).json({ error: 'ไม่พบแพ็คเกจนี้' });
    if (!method) return res.status(400).json({ error: 'กรุณาเลือกวิธีชำระเงิน' });

    const orders = readDB('orders');
    const order = {
      id: 'ORD' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase(),
      userId: req.user.id,
      username: req.user.username,
      pkgId,
      pkgName: pkg.name,
      amount: pkg.price,
      method,
      slip: slip || null,
      truemoneyUrl: truemoneyUrl || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      approvedAt: null,
      rejectReason: null
    };
    orders.push(order);
    writeDB('orders', orders);
    logEvent('order', `New order ${order.id}`, { user: req.user.username, pkgId, amount: pkg.price });
    res.json({ success: true, order });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

app.get('/api/orders/my', authMiddleware, (req, res) => {
  const orders = readDB('orders');
  const my = orders
    .filter(o => o.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(my);
});

// ===== ROUTES: REDEEM CODE =====
app.post('/api/redeem', authMiddleware, (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'กรุณากรอกโค้ด' });

    const codes = readDB('codes');
    const codeData = codes.find(c => c.code === code.toUpperCase());
    if (!codeData) return res.status(404).json({ error: 'โค้ดไม่ถูกต้อง' });
    if (codeData.used >= codeData.maxUse) return res.status(400).json({ error: 'โค้ดนี้ถูกใช้ไปแล้ว' });
    if (codeData.expiresAt && new Date(codeData.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'โค้ดหมดอายุ' });
    }

    const users = readDB('users');
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    if (codeData.type === 'credits') {
      user.credits += codeData.value;
    } else if (codeData.type === 'package') {
      const pkg = PACKAGES[codeData.pkgId];
      if (pkg) {
        const start = user.expiresAt && new Date(user.expiresAt) > new Date() ? new Date(user.expiresAt) : new Date();
        const exp = new Date(start.getTime() + pkg.days * 86400000);
        user.activePkg = codeData.pkgId;
        user.expiresAt = exp.toISOString();
      }
    }

    codeData.used = (codeData.used || 0) + 1;
    codeData.usedBy = codeData.usedBy || [];
    codeData.usedBy.push({ username: req.user.username, at: new Date().toISOString() });

    writeDB('users', users);
    writeDB('codes', codes);
    logEvent('redeem', `Code ${code} redeemed by ${user.username}`);
    res.json({ success: true, message: 'ใช้โค้ดสำเร็จ!', codeData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// ===== ROUTES: ADMIN =====
app.get('/api/admin/orders', authMiddleware, adminOnly, (req, res) => {
  const orders = readDB('orders');
  res.json(orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post('/api/admin/orders/approve', authMiddleware, adminOnly, (req, res) => {
  try {
    const { orderId } = req.body;
    const orders = readDB('orders');
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
    if (order.status !== 'pending') return res.status(400).json({ error: 'ออเดอร์นี้ดำเนินการไปแล้ว' });

    order.status = 'approved';
    order.approvedAt = new Date().toISOString();
    writeDB('orders', orders);

    const users = readDB('users');
    const user = users.find(u => u.id === order.userId);
    if (user) {
      const pkg = PACKAGES[order.pkgId];
      const start = user.expiresAt && new Date(user.expiresAt) > new Date() ? new Date(user.expiresAt) : new Date();
      const exp = new Date(start.getTime() + pkg.days * 86400000);
      user.activePkg = order.pkgId;
      user.expiresAt = exp.toISOString();
      writeDB('users', users);
    }

    logEvent('approve', `Approved ${orderId}`, { by: req.user.username });
    res.json({ success: true, order });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

app.post('/api/admin/orders/reject', authMiddleware, adminOnly, (req, res) => {
  try {
    const { orderId, reason } = req.body;
    const orders = readDB('orders');
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
    order.status = 'rejected';
    order.rejectReason = reason || '';
    writeDB('orders', orders);
    logEvent('reject', `Rejected ${orderId}`, { by: req.user.username });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const users = readDB('users').map(u => ({
    id: u.id, username: u.username, email: u.email,
    role: u.role, credits: u.credits,
    activePkg: u.activePkg, expiresAt: u.expiresAt,
    banned: u.banned, createdAt: u.createdAt
  }));
  res.json(users);
});

app.post('/api/admin/users/ban', authMiddleware, adminOnly, (req, res) => {
  try {
    const { userId, banned } = req.body;
    const users = readDB('users');
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (user.role === 'admin') return res.status(400).json({ error: 'ไม่สามารถแบนแอดมิน' });
    user.banned = !!banned;
    writeDB('users', users);
    logEvent('ban', `${banned ? 'Banned' : 'Unbanned'} ${user.username}`, { by: req.user.username });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

app.post('/api/admin/codes/create', authMiddleware, adminOnly, (req, res) => {
  try {
    const { code, type, value, pkgId, maxUse, expiresAt } = req.body;
    const codes = readDB('codes');
    const newCode = {
      id: crypto.randomBytes(6).toString('hex'),
      code: (code || crypto.randomBytes(4).toString('hex').toUpperCase()).toUpperCase(),
      type: type || 'credits',
      value: value || 100,
      pkgId: pkgId || null,
      maxUse: maxUse || 1,
      used: 0,
      usedBy: [],
      expiresAt: expiresAt || null,
      createdAt: new Date().toISOString()
    };
    codes.push(newCode);
    writeDB('codes', codes);
    logEvent('code-create', `Created code ${newCode.code}`, { by: req.user.username });
    res.json({ success: true, code: newCode });
  } catch (e) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

app.get('/api/admin/codes', authMiddleware, adminOnly, (req, res) => {
  res.json(readDB('codes'));
});

app.get('/api/admin/stats', authMiddleware, adminOnly, (req, res) => {
  const users = readDB('users');
  const orders = readDB('orders');
  const totalRevenue = orders.filter(o => o.status === 'approved').reduce((s, o) => s + o.amount, 0);
  res.json({
    totalUsers: users.length,
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.status === 'pending').length,
    approvedOrders: orders.filter(o => o.status === 'approved').length,
    rejectedOrders: orders.filter(o => o.status === 'rejected').length,
    totalRevenue,
    activeUsers: users.filter(u => u.expiresAt && new Date(u.expiresAt) > new Date()).length
  });
});

app.get('/api/admin/logs', authMiddleware, adminOnly, (req, res) => {
  const logs = readDB('logs');
  res.json(logs.slice(-200).reverse());
});

// ✅ FALLBACK — ใช้ root
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🔥 HIDDEN PRO server running on http://localhost:${PORT}`);
});
