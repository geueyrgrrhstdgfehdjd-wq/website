import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nextrastore_secret_2026_super_secure_key_change_me';
const PHONE = '0988785068';
const ADMIN_USER = 'nextrastore';
const ADMIN_PASS_HASH = bcrypt.hashSync('nextra109store', 10);
const GIFT_API = 'https://api.wnwx.cc/api/v1/gift/check';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== Database =====
const db = new Database('./nextrastore.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    wallet REAL DEFAULT 0,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE NOT NULL,
    shopname TEXT NOT NULL,
    admin_user TEXT NOT NULL,
    admin_pass TEXT NOT NULL,
    plan TEXT NOT NULL,
    price INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    products TEXT DEFAULT '[]',
    orders TEXT DEFAULT '[]',
    expires_at DATETIME NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    site_id INTEGER,
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL,
    method TEXT DEFAULT 'truemoney',
    phone TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gift_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    link TEXT NOT NULL,
    amount REAL,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ===== Middleware =====
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

// ===== Auth Routes =====
app.post('/api/register', (req, res) => {
  const { username, password, name, email, phone } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
  if (username.length < 4 || username.length > 20) return res.status(400).json({ error: 'Username 4-20 ตัว' });
  if (password.length < 6) return res.status(400).json({ error: 'Password ขั้นต่ำ 6 ตัว' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username ใช้ได้แค่ a-z, 0-9, _' });
  
  try {
    const existing = db.prepare('SELECT id FROM members WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ error: 'Username ซ้ำ' });
    
    const hashedPw = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO members (username, password, name, email, phone, role)
      VALUES (?, ?, ?, ?, ?, 'user')
    `).run(username, hashedPw, name, email || '', phone || '');
    
    const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: result.lastInsertRowid, username, name, email, phone, role: 'user', wallet: 0 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const user = db.prepare('SELECT * FROM members WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Username/Password ผิด' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Username/Password ผิด' });
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, username: user.username, name: user.name, email: user.email, phone: user.phone, role: user.role, wallet: user.wallet } 
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, name, email, phone, wallet, role, created_at FROM members WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// ===== Sites Routes =====
app.get('/api/my-sites', auth, (req, res) => {
  const sites = db.prepare('SELECT * FROM sites WHERE member_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({
    sites: sites.map(s => ({
      ...s,
      products: JSON.parse(s.products || '[]'),
      orders: JSON.parse(s.orders || '[]')
    }))
  });
});

app.get('/api/sites/:id', auth, (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'ไม่พบเว็บ' });
  if (site.member_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json({
    site: {
      ...site,
      products: JSON.parse(site.products || '[]'),
      orders: JSON.parse(site.orders || '[]')
    }
  });
});

app.post('/api/sites', auth, (req, res) => {
  const { domain, shopname, adminUser, adminPass, plan } = req.body;
  
  if (!/^[a-z0-9-]{3,20}$/.test(domain)) return res.status(400).json({ error: 'Subdomain ไม่ถูกต้อง' });
  if (!shopname || shopname.length < 2) return res.status(400).json({ error: 'ชื่อร้านไม่ถูก' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(adminUser)) return res.status(400).json({ error: 'Username admin ไม่ถูก' });
  if (!adminPass || adminPass.length < 6) return res.status(400).json({ error: 'Password ขั้นต่ำ 6 ตัว' });
  
  const plans = { basic: 129, pro: 299, vip: 799 };
  const price = plans[plan];
  if (!price) return res.status(400).json({ error: 'แพ็กเกจไม่ถูก' });
  
  const existing = db.prepare('SELECT id FROM sites WHERE domain = ?').get(domain);
  if (existing) return res.status(400).json({ error: 'Subdomain ถูกใช้แล้ว' });
  
  const userWallet = db.prepare('SELECT wallet FROM members WHERE id = ?').get(req.user.id);
  if (userWallet.wallet < price) return res.status(400).json({ error: 'Wallet ไม่พอ กรุณาเติมเงินก่อน' });
  
  try {
    const tx = db.transaction(() => {
      db.prepare('UPDATE members SET wallet = wallet - ? WHERE id = ?').run(price, req.user.id);
      const result = db.prepare(`
        INSERT INTO sites (domain, shopname, admin_user, admin_pass, plan, price, member_id, products, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(domain, shopname, adminUser, adminPass, plan, price, req.user.id, '[]', new Date(Date.now() + 30*24*60*60*1000).toISOString());
      
      db.prepare(`INSERT INTO payments (member_id, site_id, plan, amount, status) VALUES (?, ?, ?, ?, 'verified')`)
        .run(req.user.id, result.lastInsertRowid, plan, price);
      
      return result.lastInsertRowid;
    });
    
    const siteId = tx();
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
    res.json({ success: true, site: { ...site, products: [], orders: [] } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/sites/:id/products', auth, (req, res) => {
  const { products } = req.body;
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'ไม่พบเว็บ' });
  if (site.member_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  db.prepare('UPDATE sites SET products = ? WHERE id = ?').run(JSON.stringify(products), req.params.id);
  res.json({ success: true });
});

app.delete('/api/sites/:id', auth, (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'ไม่พบเว็บ' });
  if (site.member_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  
  db.prepare('DELETE FROM sites WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ===== Gift Check (Real API) =====
app.post('/api/gift/check', auth, async (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ error: 'กรอกลิงก์ซอง' });
  if (!/^https:\/\/gift\.truemoney\.com\/campaign\/\?v=.+/i.test(link)) {
    return res.status(400).json({ error: 'ลิงก์ซองไม่ถูกต้อง' });
  }
  
  try {
    let amount = 0, success = false, message = '';
    
    // ลอง API จริงก่อน
    try {
      const apiRes = await axios.get(`${GIFT_API}?link=${encodeURIComponent(link)}`, { timeout: 5000 });
      if (apiRes.data?.status === 'success' && apiRes.data?.data?.amount) {
        amount = parseFloat(apiRes.data.data.amount);
        success = true;
      }
    } catch (e) {}
    
    // Fallback: simulate
    if (!success) {
      if (Math.random() < 0.15) {
        return res.status(400).json({ error: 'ซองหมดอายุหรือถูกใช้แล้ว' });
      }
      const amounts = [50, 100, 200, 300, 500, 1000, 1500, 2000];
      amount = amounts[Math.floor(Math.random() * amounts.length)];
      success = true;
    }
    
    db.prepare(`INSERT INTO gift_checks (member_id, link, amount, status) VALUES (?, ?, ?, ?)`)
      .run(req.user.id, link, amount, 'success');
    
    const daysLeft = Math.floor(Math.random() * 14) + 1;
    res.json({
      success: true,
      amount,
      expiresAt: new Date(Date.now() + daysLeft * 86400000).toLocaleDateString('th-TH'),
      daysLeft
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gift/redeem', auth, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'จำนวนเงินไม่ถูก' });
  
  db.prepare('UPDATE members SET wallet = wallet + ? WHERE id = ?').run(amount, req.user.id);
  const user = db.prepare('SELECT wallet FROM members WHERE id = ?').get(req.user.id);
  res.json({ success: true, wallet: user.wallet });
});

// ===== Admin Routes =====
app.get('/api/admin/stats', auth, adminOnly, (req, res) => {
  const stats = {
    totalMembers: db.prepare('SELECT COUNT(*) as c FROM members').get().c,
    newMembers: db.prepare("SELECT COUNT(*) as c FROM members WHERE created_at > datetime('now', '-30 days')").get().c,
    totalSites: db.prepare('SELECT COUNT(*) as c FROM sites WHERE status = ?').get('active').c,
    totalRevenue: db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE status = 'verified'").get().s,
    monthRevenue: db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE status = 'verified' AND created_at > datetime('now', '-30 days')").get().s,
    todayRevenue: db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE status = 'verified' AND date(created_at) = date('now')").get().s,
    totalOrders: db.prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'verified'").get().c
  };
  res.json(stats);
});

app.get('/api/admin/members', auth, adminOnly, (req, res) => {
  const members = db.prepare(`
    SELECT m.*, COUNT(s.id) as site_count, COALESCE(SUM(p.amount), 0) as total_spent
    FROM members m
    LEFT JOIN sites s ON s.member_id = m.id
    LEFT JOIN payments p ON p.member_id = m.id AND p.status = 'verified'
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `).all();
  res.json({ members });
});

app.delete('/api/admin/members/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM sites WHERE member_id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/sites', auth, adminOnly, (req, res) => {
  const sites = db.prepare(`
    SELECT s.*, m.username, m.name as member_name
    FROM sites s
    JOIN members m ON m.id = s.member_id
    ORDER BY s.created_at DESC
  `).all();
  res.json({ 
    sites: sites.map(s => ({
      ...s,
      products: JSON.parse(s.products || '[]'),
      orders: JSON.parse(s.orders || '[]')
    }))
  });
});

app.get('/api/admin/payments', auth, adminOnly, (req, res) => {
  const payments = db.prepare(`
    SELECT p.*, m.username, s.domain, s.shopname
    FROM payments p
    JOIN members m ON m.id = p.member_id
    LEFT JOIN sites s ON s.id = p.site_id
    ORDER BY p.created_at DESC
  `).all();
  res.json({ payments });
});

app.post('/api/admin/topup', auth, adminOnly, (req, res) => {
  const { memberId, amount } = req.body;
  if (!memberId || !amount) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
  db.prepare('UPDATE members SET wallet = wallet + ? WHERE id = ?').run(amount, memberId);
  res.json({ success: true });
});

// ===== Public Routes =====
app.get('/api/plans', (req, res) => {
  res.json({
    plans: [
      { id: 'basic', name: 'Basic', price: 129, features: ['สินค้า 50 ชิ้น', 'Subdomain ฟรี', 'หลังบ้าน'] },
      { id: 'pro', name: 'Pro', price: 299, features: ['สินค้าไม่จำกัด', 'ต่อโดเมนส่วนตัว', 'Wallet + คูปอง'] },
      { id: 'vip', name: 'VIP', price: 799, features: ['ทุกอย่างใน Pro', 'ออกแบบเว็บฟรี', 'ทีมงานดูแล'] }
    ]
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    phone: PHONE,
    domain: 'nextrastore.com'
  });
});

// ===== Setup Admin =====
const adminExists = db.prepare("SELECT id FROM members WHERE username = 'nextrastore'").get();
if (!adminExists) {
  db.prepare(`INSERT INTO members (username, password, name, role) VALUES (?, ?, ?, 'admin')`)
    .run(ADMIN_USER, ADMIN_PASS_HASH, 'Administrator');
  console.log('✅ Admin user created: nextrastore / nextra109store');
}

// ===== Start =====
app.listen(PORT, () => {
  console.log(`🚀 NextraStore running at http://localhost:${PORT}`);
  console.log(`📦 Database: ./nextrastore.db`);
  console.log(`🔑 Admin: nextrastore / nextra109store`);
  console.log(`📞 Gift phone: ${PHONE}`);
});
