const state = {
  token: localStorage.getItem('hp_token') || null,
  user: JSON.parse(localStorage.getItem('hp_user') || 'null'),
  currentPkg: null
};

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function openModal(name) { document.getElementById(name + 'Modal').classList.add('show'); }
function closeModal(name) { document.getElementById(name + 'Modal').classList.remove('show'); }
function switchModal(from, to) { closeModal(from); setTimeout(() => openModal(to), 200); }
function scrollToEl(sel) { setTimeout(() => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth' }), 200); }

function toggleMobile() { document.getElementById('navMenu').classList.toggle('show'); }

function updateNav() {
  const isLogged = !!state.token;
  document.getElementById('navActions').style.display = isLogged ? 'none' : 'flex';
  document.getElementById('navUser').style.display = isLogged ? 'flex' : 'none';
  if (isLogged && state.user) {
    document.getElementById('navUsername').textContent = state.user.username;
    const adminLink = document.getElementById('navAdmin');
    if (state.user.role === 'admin') adminLink.style.display = 'block';
  }
}

function showPage(name) {
  if (name === 'admin' && (!state.user || state.user.role !== 'admin')) {
    toast('ต้องเข้าสู่ระบบในฐานะแอดมิน', 'error');
    return;
  }
  if ((name === 'dashboard' || name === 'admin') && !state.token) {
    openModal('login');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelectorAll('#navMenu a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === name);
  });
  if (name === 'dashboard') loadDashboard();
  if (name === 'admin') loadAdmin();
}

function showHome() { showPage('home'); }

async function handleRegister(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/register', {
      method: 'POST',
      body: { username: fd.get('username'), email: fd.get('email'), password: fd.get('password') }
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('hp_token', data.token);
    localStorage.setItem('hp_user', JSON.stringify(data.user));
    updateNav();
    closeModal('register');
    toast(data.message);
    showPage('dashboard');
  } catch (err) { toast(err.message, 'error'); }
}

async function handleLogin(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/login', {
      method: 'POST',
      body: { username: fd.get('username'), password: fd.get('password') }
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('hp_token', data.token);
    localStorage.setItem('hp_user', JSON.stringify(data.user));
    updateNav();
    closeModal('login');
    toast('เข้าสู่ระบบสำเร็จ!');
    showPage('dashboard');
  } catch (err) { toast(err.message, 'error'); }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('hp_token');
  localStorage.removeItem('hp_user');
  updateNav();
  showHome();
  toast('ออกจากระบบแล้ว');
}

function buyPkg(pkgId) {
  if (!state.token) { openModal('login'); return; }
  state.currentPkg = pkgId;
  const prices = { daily: 49, weekly: 249, monthly: 799, season: 1899, lifetime: 3999 };
  const names = { daily: 'DAILY PASS', weekly: 'WEEKLY', monthly: 'MONTHLY VIP', season: 'SEASON PASS', lifetime: 'LIFETIME' };
  document.getElementById('buyPkgName').textContent = names[pkgId];
  document.getElementById('buyPkgPrice').textContent = '฿' + prices[pkgId];
  openModal('buy');
}

async function handleBuy(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/orders/create', {
      method: 'POST',
      body: { pkgId: state.currentPkg, method: fd.get('method'), slip: fd.get('slip') }
    });
    closeModal('buy');
    toast('ส่งออเดอร์แล้ว! รอแอดมินอนุมัติ (' + data.order.id + ')');
    if (document.getElementById('page-dashboard').classList.contains('active')) loadDashboard();
  } catch (err) { toast(err.message, 'error'); }
}

async function handleRedeem(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/redeem', { method: 'POST', body: { code: fd.get('code') } });
    closeModal('redeem');
    toast(data.message);
    if (document.getElementById('page-dashboard').classList.contains('active')) loadDashboard();
  } catch (err) { toast(err.message, 'error'); }
}

async function loadDashboard() {
  if (!state.token) return;
  try {
    const me = await api('/me');
    state.user = { ...state.user, ...me };
    localStorage.setItem('hp_user', JSON.stringify(state.user));
    document.getElementById('dashUsername').textContent = me.username;
    document.getElementById('dashPkg').textContent = me.activePkg ? me.activePkg.toUpperCase() : 'ยังไม่มี';
    document.getElementById('dashExpire').textContent = me.expiresAt ? new Date(me.expiresAt).toLocaleString('th-TH') : '-';
    document.getElementById('dashCredits').textContent = me.credits || 0;
    const orders = await api('/orders/my');
    document.getElementById('dashOrders').textContent = orders.length;
    document.getElementById('orderList').innerHTML = orders.length ? orders.map(o => `
      <div class="order-item">
        <div><strong>${o.pkgName}</strong><span class="order-id">${o.id}</span></div>
        <div>฿${o.amount} • ${o.method}</div>
        <div class="status status-${o.status}">${o.status}</div>
      </div>
    `).join('') : '<p style="text-align:center;color:var(--text-muted);">ยังไม่มีออเดอร์</p>';
  } catch (err) { toast(err.message, 'error'); }
}

async function loadAdmin() {
  if (!state.token) return;
  try {
    const stats = await api('/admin/stats');
    document.getElementById('statUsers').textContent = stats.totalUsers;
    document.getElementById('statOrders').textContent = stats.totalOrders;
    document.getElementById('statPending').textContent = stats.pendingOrders;
    document.getElementById('statRevenue').textContent = '฿' + stats.totalRevenue.toLocaleString();

    const orders = await api('/admin/orders');
    document.getElementById('adminOrderList').innerHTML = orders.length ? orders.map(o => `
      <div class="order-item admin">
        <div><strong>${o.pkgName}</strong> <span class="order-id">${o.id}</span><br><small>@${o.username} • ${new Date(o.createdAt).toLocaleString('th-TH')}</small></div>
        <div>฿${o.amount} • ${o.method}</div>
        <div class="status status-${o.status}">${o.status}</div>
        <div class="admin-actions">${o.status === 'pending' ? `<button class="btn-approve" onclick="approveOrder('${o.id}')">✓</button><button class="btn-reject" onclick="rejectOrder('${o.id}')">✗</button>` : '<small>✓</small>'}</div>
      </div>
    `).join('') : '<p style="text-align:center;color:var(--text-muted);">ไม่มีออเดอร์</p>';

    const users = await api('/admin/users');
    document.getElementById('adminUserList').innerHTML = users.map(u => `
      <div class="user-item">
        <div class="user-info"><strong>${u.username}</strong> ${u.role === 'admin' ? '<span class="badge-admin">ADMIN</span>' : ''} ${u.banned ? '<span class="badge-banned">BAN</span>' : ''}<br><small>${u.email}</small></div>
        <div>${u.activePkg || '-'}</div>
        <div class="admin-actions">${u.role !== 'admin' ? `<button class="btn-${u.banned ? 'approve' : 'reject'}" onclick="banUser('${u.id}', ${!u.banned})">${u.banned ? 'ปลด' : 'แบน'}</button>` : ''}</div>
      </div>
    `).join('');

    const codes = await api('/admin/codes');
    document.getElementById('adminCodeList').innerHTML = codes.length ? codes.map(c => `
      <div class="code-item"><code>${c.code}</code><span>${c.type} ${c.type === 'credits' ? '฿' + c.value : c.pkgId}</span><span>ใช้ ${c.used || 0}/${c.maxUse}</span></div>
    `).join('') : '<p style="text-align:center;color:var(--text-muted);">ยังไม่มีโค้ด</p>';

    const logs = await api('/admin/logs');
    document.getElementById('adminLogList').innerHTML = logs.length ? logs.map(l => `
      <div class="log-item log-${l.type}"><span class="log-time">${new Date(l.timestamp).toLocaleTimeString('th-TH')}</span><span class="log-type">${l.type}</span><span>${l.message}</span></div>
    `).join('') : '<p style="text-align:center;color:var(--text-muted);">ไม่มี log</p>';
  } catch (err) { toast(err.message, 'error'); }
}

async function approveOrder(id) {
  if (!confirm('อนุมัติ ' + id + '?')) return;
  try { await api('/admin/orders/approve', { method: 'POST', body: { orderId: id } }); toast('อนุมัติแล้ว'); loadAdmin(); }
  catch (err) { toast(err.message, 'error'); }
}

async function rejectOrder(id) {
  const reason = prompt('เหตุผล:');
  if (reason === null) return;
  try { await api('/admin/orders/reject', { method: 'POST', body: { orderId: id, reason } }); toast('ปฏิเสธแล้ว'); loadAdmin(); }
  catch (err) { toast(err.message, 'error'); }
}

async function banUser(id, banned) {
  if (!confirm(`${banned ? 'แบน' : 'ปลดแบน'}?`)) return;
  try { await api('/admin/users/ban', { method: 'POST', body: { userId: id, banned } }); toast('สำเร็จ'); loadAdmin(); }
  catch (err) { toast(err.message, 'error'); }
}

async function createCode(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/admin/codes/create', { method: 'POST', body: {
      code: fd.get('code') || null,
      type: fd.get('type'),
      value: Number(fd.get('value')),
      pkgId: fd.get('pkgId') || null
    }});
    toast('สร้างโค้ด ' + data.code.code + ' แล้ว!');
    e.target.reset();
    loadAdmin();
  } catch (err) { toast(err.message, 'error'); }
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab')) {
    const tab = e.target.dataset.tab;
    document.querySelectorAll('.admin-tabs .tab').forEach(t => t.classList.toggle('active', t === e.target));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
  }
});

const animateCount = (el) => {
  const target = Number(el.dataset.count);
  const duration = 2000;
  const step = target / (duration / 16);
  let cur = 0;
  const t = setInterval(() => {
    cur += step;
    if (cur >= target) { cur = target; clearInterval(t); }
    el.textContent = Math.floor(cur).toLocaleString();
  }, 16);
};
const counterObs = new IntersectionObserver((entries) => {
  entries.forEach(en => {
    if (en.isIntersecting) { animateCount(en.target); counterObs.unobserve(en.target); }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.stat-num').forEach(el => counterObs.observe(el));

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (href.length > 1) {
      const el = document.querySelector(href);
      if (el) {
        e.preventDefault();
        const page = a.dataset.page;
        if (page) showPage(page);
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 200);
      }
    }
  });
});

updateNav();
