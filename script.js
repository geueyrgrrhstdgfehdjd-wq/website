const state = {
  token: null, user: null, settings: null,
  currentPkg: null, currentEditPkg: null,
  refreshInterval: null, chart: null,
  selectedOrders: new Set()
};

(async function init() {
  try {
    const res = await fetch('/api/auto-login', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('hp_token', data.token);
      localStorage.setItem('hp_user', JSON.stringify(data.user));
      showAutoLoginBanner(data.user.username, data.session.device);
      updateNav();
      startAutoRefresh();
    }
  } catch (e) {}
  await loadSettings();
  loadAnnouncements();
})();

function startAutoRefresh() {
  if (state.refreshInterval) clearInterval(state.refreshInterval);
  state.refreshInterval = setInterval(async () => {
    if (!state.token) return;
    try {
      const res = await fetch('/api/refresh', { method: 'POST', credentials: 'include', headers: { 'Authorization': 'Bearer ' + state.token } });
      if (res.ok) {
        const d = await res.json();
        state.token = d.token;
        localStorage.setItem('hp_token', d.token);
      } else forceLogout();
    } catch (e) {}
  }, 10 * 60 * 1000);
}

function forceLogout() {
  state.token = null; state.user = null;
  localStorage.removeItem('hp_token');
  localStorage.removeItem('hp_user');
  if (state.refreshInterval) clearInterval(state.refreshInterval);
  updateNav(); showHome();
}

function showAutoLoginBanner(name, device) {
  document.getElementById('autoLoginName').textContent = name;
  document.getElementById('autoLoginDevice').textContent = device;
  const b = document.getElementById('autoLoginBanner');
  b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 5000);
}

async function api(p, o = {}) {
  const h = { 'Content-Type': 'application/json', ...(o.headers || {}) };
  if (state.token) h['Authorization'] = 'Bearer ' + state.token;
  const r = await fetch('/api' + p, { method: o.method || 'GET', headers: h, credentials: 'include', body: o.body ? JSON.stringify(o.body) : undefined });
  if (r.status === 401 && state.token) {
    try {
      const rr = await fetch('/api/refresh', { method: 'POST', credentials: 'include', headers: { 'Authorization': 'Bearer ' + state.token } });
      if (rr.ok) { state.token = (await rr.json()).token; return api(p, o); }
    } catch (e) {}
    forceLogout();
    throw new Error('หมดเซสชั่น');
  }
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Error');
  return d;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function openModal(n) { document.getElementById(n + 'Modal').classList.add('show'); }
function closeModal(n) { document.getElementById(n + 'Modal').classList.remove('show'); }
function switchModal(a, b) { closeModal(a); setTimeout(() => openModal(b), 200); }

async function loadSettings() {
  const s = await api('/settings');
  state.settings = s;
  applySettings(s);
  renderPackages(s.packages);
  renderContact(s.site.contact);
  renderMarquee(s.content.marquee);
}

function applySettings(s) {
  document.title = s.site.name + ' • Pro Shop';
  document.getElementById('logoIcon').textContent = s.site.logo || '🔥';
  document.getElementById('logoName').textContent = s.site.name.split(' ')[0];
  document.getElementById('heroTitle1').textContent = s.content.heroTitle1;
  document.getElementById('heroTitle2').textContent = s.content.heroTitle2;
  document.getElementById('heroSub').textContent = s.content.heroSub;
  document.documentElement.style.setProperty('--primary', s.theme.primary);
  document.documentElement.style.setProperty('--accent', s.theme.accent);
  const rgb = hexToRgb(s.theme.primary);
  if (rgb) document.documentElement.style.setProperty('--primary-rgb', `${rgb.r},${rgb.g},${rgb.b}`);
}

function hexToRgb(h) { const m = h.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i); return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null; }

function renderPackages(packages) {
  const sorted = Object.values(packages).filter(p => p.enabled !== false).sort((a, b) => (a.order || 99) - (b.order || 99));
  document.getElementById('packageGrid').innerHTML = sorted.map(p => `
    <div class="pkg ${p.featured ? 'popular' : ''}">
      ${p.featured ? '<span class="pkg-badge">🔥 HOT</span>' : ''}
      <div class="pkg-image"><span>${p.image || '🎁'}</span></div>
      <div class="pkg-body">
        ${p.tag ? `<span class="pkg-tag">${p.tag}</span>` : ''}
        <h3 class="pkg-name">${p.name}</h3>
        <div class="pkg-price">${p.oldPrice ? `<span class="price-old">฿${p.oldPrice.toLocaleString()}</span>` : ''}<span class="price-num">฿${p.price.toLocaleString()}</span></div>
        <div class="pkg-meta">⏱️ ${p.days >= 99999 ? 'ตลอดชีพ' : p.days + ' วัน'}</div>
        <button class="pkg-btn" onclick="buyPkg('${p.id}')">🛒 สั่งซื้อ</button>
      </div>
    </div>
  `).join('');
}

function renderContact(c) {
  document.getElementById('contactGrid').innerHTML = `
    <a href="https://${c.discord}" target="_blank" class="contact-card"><div class="contact-icon">💬</div><h3>Discord</h3><span class="contact-link">${c.discord}</span></a>
    <a href="https://line.me/ti/p/~${c.line.replace('@', '')}" target="_blank" class="contact-card"><div class="contact-icon">📱</div><h3>LINE</h3><span class="contact-link">${c.line}</span></a>
    <a href="mailto:${c.email}" class="contact-card"><div class="contact-icon">📧</div><h3>Email</h3><span class="contact-link">${c.email}</span></a>
  `;
}

function renderMarquee(items) {
  const all = [...items, ...items];
  document.getElementById('marqueeTrack').innerHTML = all.map(i => `<span>${i}</span>`).join('');
}

async function loadAnnouncements() {
  try {
    const anns = await api('/announcements');
    document.getElementById('announcements').innerHTML = anns.map(a => `
      <div class="announcement ${a.type}">
        <strong>📢 ${a.title}</strong>
        <p>${a.message}</p>
      </div>
    `).join('');
  } catch (e) {}
}

function updateNav() {
  const l = !!state.token;
  document.getElementById('navActions').style.display = l ? 'none' : 'flex';
  document.getElementById('navUser').style.display = l ? 'flex' : 'none';
  if (l && state.user) {
    document.getElementById('navUsername').textContent = state.user.username;
    if (state.user.role === 'admin') document.getElementById('navAdmin').style.display = 'block';
  }
}

function showPage(n) {
  if (n === 'admin' && (!state.user || state.user.role !== 'admin')) { toast('ต้องเป็นแอดมิน', 'error'); return; }
  if ((n === 'dashboard' || n === 'admin') && !state.token) { openModal('login'); return; }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + n).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelectorAll('#navMenu a').forEach(a => a.classList.toggle('active', a.dataset.page === n));
  if (n === 'dashboard') loadDashboard();
  if (n === 'admin') loadAdmin();
}
function showHome() { showPage('home'); }

async function handleRegister(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const d = await api('/register', { method: 'POST', body: {
      username: fd.get('username'), email: fd.get('email'), password: fd.get('password'),
      rememberMe: fd.get('rememberMe') === 'on'
    }});
    state.token = d.token; state.user = d.user;
    localStorage.setItem('hp_token', d.token);
    localStorage.setItem('hp_user', JSON.stringify(d.user));
    updateNav(); closeModal('register'); toast('สมัครสำเร็จ!'); startAutoRefresh(); showPage('dashboard');
  } catch (err) { toast(err.message, 'error'); }
}
async function handleLogin(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const d = await api('/login', { method: 'POST', body: {
      username: fd.get('username'), password: fd.get('password'),
      rememberMe: fd.get('rememberMe') === 'on'
    }});
    state.token = d.token; state.user = d.user;
    localStorage.setItem('hp_token', d.token);
    localStorage.setItem('hp_user', JSON.stringify(d.user));
    updateNav(); closeModal('login'); toast('เข้าสู่ระบบสำเร็จ'); startAutoRefresh(); showPage('dashboard');
  } catch (err) { toast(err.message, 'error'); }
}
async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch (e) {}
  forceLogout(); toast('ออกจากระบบ');
}

function buyPkg(id) {
  if (!state.token) { openModal('login'); return; }
  state.currentPkg = id;
  const p = state.settings.packages[id];
  document.getElementById('buyPkgName').textContent = p.name;
  document.getElementById('buyPkgPrice').textContent = '฿' + p.price.toLocaleString();
  const pay = state.settings.payments || {};
  const opts = [];
  if (pay.truemoney?.enabled) opts.push('<option value="truemoney">TrueMoney: ' + pay.truemoney.wallet + '</option>');
  if (pay.promptpay?.enabled) opts.push('<option value="promptpay">พร้อมเพย์: ' + pay.promptpay.id + '</option>');
  if (pay.bank?.enabled) opts.push('<option value="bank">' + pay.bank.bank + ': ' + pay.bank.account + '</option>');
  if (pay.usdt?.enabled) opts.push('<option value="usdt">USDT: ' + pay.usdt.address + '</option>');
  document.getElementById('buyMethodSelect').innerHTML = opts.join('');
  openModal('buy');
}
async function handleBuy(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/orders/create', { method: 'POST', body: { pkgId: state.currentPkg, method: fd.get('method'), slip: fd.get('slip') } });
    closeModal('buy'); toast('ส่งออเดอร์แล้ว');
  } catch (e) { toast(e.message, 'error'); }
}
async function handleRedeem(e) {
  e.preventDefault();
  try {
    await api('/redeem', { method: 'POST', body: { code: new FormData(e.target).get('code') } });
    closeModal('redeem'); toast('ใช้โค้ดสำเร็จ');
  } catch (e) { toast(e.message, 'error'); }
}

async function loadDashboard() {
  if (!state.token) return;
  try {
    const me = await api('/me');
    state.user = { ...state.user, ...me };
    document.getElementById('dashUsername').textContent = me.username;
    document.getElementById('dashPkg').textContent = me.activePkg ? me.activePkg.toUpperCase() : 'ยังไม่มี';
    document.getElementById('dashExpire').textContent = me.expiresAt ? new Date(me.expiresAt).toLocaleString('th-TH') : '-';
    document.getElementById('dashCredits').textContent = me.credits || 0;
    const orders = await api('/orders/my');
    document.getElementById('dashOrders').textContent = orders.length;
    document.getElementById('orderList').innerHTML = orders.length ? orders.slice(0, 10).map(o => `
      <div class="order-item">
        <div><strong>${o.pkgName}</strong><span class="order-id">${o.id}</span></div>
        <div>฿${o.amount}</div>
        <div class="status status-${o.status}">${o.status}</div>
      </div>
    `).join('') : '<p style="text-align:center;color:var(--text-muted);">ยังไม่มีออเดอร์</p>';
    const msgs = await api('/my/messages');
    document.getElementById('messageList').innerHTML = msgs.length ? msgs.slice(0, 10).map(m => `
      <div class="message-item ${m.read ? '' : 'unread'}">
        <strong>${m.title}</strong>
        <p>${m.message}</p>
        <small>${new Date(m.createdAt).toLocaleString('th-TH')}</small>
      </div>
    `).join('') : '<p style="text-align:center;color:var(--text-muted);">ไม่มีข้อความ</p>';
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAdmin() {
  if (!state.token || state.user?.role !== 'admin') return;
  try {
    const stats = await api('/admin/stats');
    document.getElementById('sUsers').textContent = stats.totalUsers;
    document.getElementById('sTodayOrders').textContent = stats.todayOrders;
    document.getElementById('sPending').textContent = stats.pendingOrders;
    document.getElementById('sTodayRev').textContent = '฿' + stats.todayRevenue.toLocaleString();
    document.getElementById('sMonthRev').textContent = '฿' + stats.monthRevenue.toLocaleString();
    document.getElementById('sTotalRev').textContent = '฿' + stats.totalRevenue.toLocaleString();
    document.getElementById('sOnline').textContent = stats.onlineUsers;
    document.getElementById('sActive').textContent = stats.activeUsers;
    drawChart(stats.chart7days);
    loadAdminOrders();
    loadAdminUsers();
    loadPackagesAdmin();
    loadCodes();
    loadAnnouncementsAdmin();
    loadMessagesAdmin();
    loadPaymentsSettings();
    loadCustomizeSettings();
    loadLogs();
  } catch (e) { toast(e.message, 'error'); }
}

function drawChart(data) {
  const canvas = document.getElementById('salesChart');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 48;
  canvas.height = 200;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const bw = canvas.width / data.length;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  data.forEach((d, i) => {
    const h = (d.revenue / max) * (canvas.height - 40);
    const x = i * bw + bw * 0.15;
    const w = bw * 0.7;
    const y = canvas.height - h - 20;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#ff5722');
    grad.addColorStop(1, '#ff9800');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Kanit';
    ctx.textAlign = 'center';
    ctx.fillText('฿' + d.revenue, x + w/2, y - 5);
    ctx.fillStyle = '#9a9aa8';
    ctx.font = '10px Kanit';
    ctx.fillText(d.date, x + w/2, canvas.height - 5);
    ctx.fillText(d.orders + ' orders', x + w/2, canvas.height - 18);
  });
}

async function loadAdminOrders() {
  const search = document.getElementById('orderSearch')?.value || '';
  const status = document.getElementById('orderFilter')?.value || 'all';
  try {
    const d = await api(`/admin/orders?status=${status}&search=${search}&limit=200`);
    document.getElementById('adminOrderList').innerHTML = d.orders.length ? d.orders.map(o => `
      <div class="order-item admin ${state.selectedOrders.has(o.id) ? 'selected' : ''}">
        <div>
          <input type="checkbox" ${state.selectedOrders.has(o.id) ? 'checked' : ''} onchange="toggleSelectOrder('${o.id}', this.checked)">
          <strong>${o.pkgName}</strong> <span class="order-id">${o.id}</span>
          <br><small>@${o.username} • ${new Date(o.createdAt).toLocaleString('th-TH')}</small>
        </div>
        <div>฿${o.amount}</div>
        <div class="status status-${o.status}">${o.status}</div>
        <div class="admin-actions">
          ${o.status === 'pending' ? `<button class="btn-approve" onclick="approveOrder('${o.id}')">✓</button><button class="btn-reject" onclick="rejectOrder('${o.id}')">✗</button>` : '✓'}
        </div>
      </div>
    `).join('') : '<p style="text-align:center;color:var(--text-muted);">ไม่มีออเดอร์</p>';
  } catch (e) {}
}

function toggleSelectOrder(id, checked) {
  if (checked) state.selectedOrders.add(id);
  else state.selectedOrders.delete(id);
  loadAdminOrders();
}

async function bulkApproveOrders() {
  if (state.selectedOrders.size === 0) { toast('เลือกออเดอร์ก่อน', 'error'); return; }
  if (!confirm('อนุมัติ ' + state.selectedOrders.size + ' ออเดอร์?')) return;
  try {
    const d = await api('/admin/orders/bulk-approve', { method: 'POST', body: { ids: Array.from(state.selectedOrders) } });
    toast('อนุมัติ ' + d.count + ' ออเดอร์');
    state.selectedOrders.clear();
    loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function approveOrder(id) {
  if (!confirm('อนุมัติ ' + id + '?')) return;
  try { await api('/admin/orders/approve', { method: 'POST', body: { orderId: id } }); toast('อนุมัติแล้ว'); loadAdmin(); }
  catch (e) { toast(e.message, 'error'); }
}
async function rejectOrder(id) {
  const r = prompt('เหตุผล:');
  if (r === null) return;
  try { await api('/admin/orders/reject', { method: 'POST', body: { orderId: id, reason: r } }); toast('ปฏิเสธแล้ว'); loadAdmin(); }
  catch (e) { toast(e.message, 'error'); }
}

async function loadAdminUsers() {
  const search = document.getElementById('userSearch')?.value || '';
  const role = document.getElementById('userRoleFilter')?.value || 'all';
  try {
    const d = await api(`/admin/users?search=${search}&role=${role}&limit=200`);
    document.getElementById('adminUserList').innerHTML = d.users.map(u => `
      <div class="user-item">
        <div class="user-info">
          <strong>${u.username}</strong>
          ${u.role === 'admin' ? '<span class="badge-admin">ADMIN</span>' : ''}
          ${u.banned ? '<span class="badge-banned">BAN</span>' : ''}
          <br><small>${u.email} • IP: ${u.ip || '-'}</small>
        </div>
        <div>💰 ${u.credits || 0}</div>
        <div class="admin-actions">
          <button class="btn-redeem" onclick="openUserAction('${u.id}')">⚙️</button>
          ${u.role !== 'admin' ? `<button class="btn-${u.banned ? 'approve' : 'reject'}" onclick="banUser('${u.id}', ${!u.banned})">${u.banned ? 'ปลด' : 'แบน'}</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {}
}

function openUserAction(uid) {
  document.getElementById('userActionContent').innerHTML = `
    <div class="form-group"><label>เติม/ลด เครดิต</label>
      <input type="number" id="creditsAmount" placeholder="จำนวน">
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="btn-approve" onclick="adjustCredits('${uid}', 'add')">+ เติม</button>
        <button class="btn-reject" onclick="adjustCredits('${uid}', 'remove')">- ลด</button>
        <button class="btn-redeem" onclick="adjustCredits('${uid}', 'set')">ตั้งค่า</button>
      </div>
    </div>
    <div class="form-group"><label>ให้แพ็คเกจ</label>
      <select id="giftPkg">
        <option value="daily">DAILY</option>
        <option value="weekly">WEEKLY</option>
        <option value="monthly">MONTHLY</option>
        <option value="season">SEASON</option>
        <option value="lifetime">LIFETIME</option>
      </select>
      <button class="btn-primary" onclick="giftPackage('${uid}')" style="margin-top:8px;">🎁 ให้แพ็คเกจ</button>
    </div>
  `;
  openModal('userAction');
}

async function adjustCredits(uid, action) {
  const amount = document.getElementById('creditsAmount').value;
  if (!amount) { toast('ใส่จำนวน', 'error'); return; }
  try {
    await api('/admin/users/credits', { method: 'POST', body: { userId: uid, amount: Number(amount), action } });
    toast('สำเร็จ'); closeModal('userAction'); loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function giftPackage(uid) {
  const pkgId = document.getElementById('giftPkg').value;
  try {
    await api('/admin/users/give-package', { method: 'POST', body: { userId: uid, pkgId } });
    toast('ให้แพ็คเกจแล้ว'); closeModal('userAction'); loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function banUser(uid, banned) {
  if (!confirm((banned ? 'แบน' : 'ปลดแบน') + '?')) return;
  try { await api('/admin/users/ban', { method: 'POST', body: { userId: uid, banned } }); toast('สำเร็จ'); loadAdmin(); }
  catch (e) { toast(e.message, 'error'); }
}

async function loadPackagesAdmin() {
  const pkgs = Object.values(state.settings.packages).sort((a, b) => (a.order || 99) - (b.order || 99));
  document.getElementById('packageEditor').innerHTML = pkgs.map(p => `
    <div class="pkg-edit-row">
      <div class="pkg-edit-icon">${p.image || '🎁'}</div>
      <div class="pkg-edit-info">
        <strong>${p.name}</strong>
        <span>฿${p.price.toLocaleString()} ${p.oldPrice ? `<del>฿${p.oldPrice.toLocaleString()}</del>` : ''}</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn-approve" onclick="openPkgEdit('${p.id}')">✏️</button>
        <button class="btn-reject" onclick="deletePkg('${p.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openPkgCreate() {
  state.currentEditPkg = null;
  document.getElementById('editPkgId').textContent = 'ใหม่';
  document.getElementById('editPkgIdInput').value = '';
  document.getElementById('editPkgIdInput').disabled = false;
  ['editName', 'editPrice', 'editOldPrice', 'editDays', 'editImage', 'editTag'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('editFeatured').checked = false;
  openModal('editPkg');
}

function openPkgEdit(id) {
  const p = state.settings.packages[id];
  state.currentEditPkg = id;
  document.getElementById('editPkgId').textContent = id;
  document.getElementById('editPkgIdInput').value = id;
  document.getElementById('editPkgIdInput').disabled = true;
  document.getElementById('editName').value = p.name;
  document.getElementById('editPrice').value = p.price;
  document.getElementById('editOldPrice').value = p.oldPrice || '';
  document.getElementById('editDays').value = p.days;
  document.getElementById('editImage').value = p.image || '';
  document.getElementById('editTag').value = p.tag || '';
  document.getElementById('editFeatured').checked = !!p.featured;
  openModal('editPkg');
}

async function savePkgEdit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/admin/packages', { method: 'POST', body: {
      id: fd.get('id'), name: fd.get('name'), price: Number(fd.get('price')),
      oldPrice: Number(fd.get('oldPrice')) || null, days: Number(fd.get('days')),
      image: fd.get('image'), tag: fd.get('tag'),
      featured: fd.get('featured') === 'on', enabled: true
    }});
    closeModal('editPkg'); await loadSettings(); toast('บันทึกแล้ว'); loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function deletePkg(id) {
  if (!confirm('ลบแพ็คเกจ ' + id + '?')) return;
  try { await api('/admin/packages/' + id, { method: 'DELETE' }); await loadSettings(); toast('ลบแล้ว'); loadAdmin(); }
  catch (e) { toast(e.message, 'error'); }
}

async function loadCodes() {
  const codes = await api('/admin/codes');
  document.getElementById('adminCodeList').innerHTML = codes.map(c => `
    <div class="code-item">
      <code>${c.code}</code>
      <span>${c.type} ${c.type === 'credits' ? '฿' + c.value : c.pkgId}</span>
      <span>ใช้ ${c.used || 0}/${c.maxUse}</span>
      <button class="btn-reject" onclick="deleteCode('${c.id}')">🗑️</button>
    </div>
  `).join('') || '<p>ยังไม่มีโค้ด</p>';
}

async function createCode(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const d = await api('/admin/codes/create', { method: 'POST', body: {
      code: fd.get('code') || null, type: fd.get('type'),
      value: Number(fd.get('value')), maxUse: Number(fd.get('maxUse')),
      pkgId: fd.get('pkgId') || null
    }});
    toast('สร้างโค้ด ' + d.code.code); e.target.reset(); loadCodes();
  } catch (e) { toast(e.message, 'error'); }
}

async function bulkCodes(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const d = await api('/admin/codes/bulk', { method: 'POST', body: {
      count: Number(fd.get('count')), type: fd.get('type'),
      value: Number(fd.get('value')), maxUse: Number(fd.get('maxUse')),
      pkgId: fd.get('pkgId') || null
    }});
    toast('สร้าง ' + d.codes.length + ' โค้ด!'); e.target.reset(); loadCodes();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteCode(id) {
  if (!confirm('ลบโค้ด?')) return;
  await api('/admin/codes/' + id, { method: 'DELETE' });
  loadCodes();
}

async function loadAnnouncementsAdmin() {
  const anns = await api('/admin/announcements');
  document.getElementById('adminAnnList').innerHTML = anns.map(a => `
    <div class="announcement-manage ${a.type} ${a.active ? '' : 'inactive'}">
      <strong>${a.active ? '🟢' : '🔴'} ${a.title}</strong>
      <p>${a.message}</p>
      <small>${new Date(a.createdAt).toLocaleString('th-TH')}</small>
      <div class="admin-actions">
        <button class="btn-redeem" onclick="toggleAnn('${a.id}')">${a.active ? 'ปิด' : 'เปิด'}</button>
        <button class="btn-reject" onclick="deleteAnn('${a.id}')">🗑️</button>
      </div>
    </div>
  `).join('') || '<p>ยังไม่มีประกาศ</p>';
}

async function createAnnouncement(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/admin/announcements', { method: 'POST', body: {
      title: fd.get('title'), type: fd.get('type'), message: fd.get('message')
    }});
    toast('ประกาศแล้ว'); e.target.reset(); loadAnnouncementsAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleAnn(id) {
  await api('/admin/announcements/' + id + '/toggle', { method: 'POST' });
  loadAnnouncementsAdmin();
}

async function deleteAnn(id) {
  if (!confirm('ลบประกาศ?')) return;
  await api('/admin/announcements/' + id, { method: 'DELETE' });
  loadAnnouncementsAdmin();
}

async function loadMessagesAdmin() {
  const msgs = await api('/admin/messages');
  const users = await api('/admin/users?limit=1000');
  document.getElementById('msgUserSelect').innerHTML = '<option value="">-เลือกผู้ใช้-</option>' +
    users.users.map(u => `<option value="${u.id}">${u.username} (${u.email})</option>`).join('');
  document.getElementById('adminMsgList').innerHTML = msgs.slice(0, 50).map(m => `
    <div class="message-manage">
      <strong>${m.title}</strong>
      <p>${m.message}</p>
      <small>→ User: ${m.userId} • ${new Date(m.createdAt).toLocaleString('th-TH')}</small>
    </div>
  `).join('') || '<p>ยังไม่มีข้อความ</p>';
}

async function sendMessage(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (!fd.get('userId')) { toast('เลือกผู้ใช้', 'error'); return; }
  try {
    await api('/admin/messages/send', { method: 'POST', body: {
      userId: fd.get('userId'), title: fd.get('title'), message: fd.get('message')
    }});
    toast('ส่งข้อความแล้ว'); e.target.reset(); loadMessagesAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

function loadPaymentsSettings() {
  const p = state.settings.payments || {};
  document.getElementById('setTrueWallet').value = p.truemoney?.wallet || '';
  document.getElementById('setPromptId').value = p.promptpay?.id || '';
  document.getElementById('setPromptName').value = p.promptpay?.name || '';
  document.getElementById('setBankName').value = p.bank?.bank || '';
  document.getElementById('setBankAcc').value = p.bank?.account || '';
  document.getElementById('setBankHolder').value = p.bank?.name || '';
  document.getElementById('setUsdt').value = p.usdt?.address || '';
}

async function savePayments(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/admin/settings', { method: 'POST', body: {
      payments: {
        truemoney: { enabled: true, wallet: fd.get('truemoney.wallet') },
        promptpay: { enabled: true, id: fd.get('promptpay.id'), name: fd.get('promptpay.name') },
        bank: { enabled: true, bank: fd.get('bank.bank'), account: fd.get('bank.account'), name: fd.get('bank.name') },
        usdt: { enabled: true, address: fd.get('usdt.address'), network: 'TRC20' }
      }
    }});
    await loadSettings(); toast('บันทึกการชำระเงิน');
  } catch (e) { toast(e.message, 'error'); }
}

function loadCustomizeSettings() {
  const s = state.settings;
  document.getElementById('setSiteName').value = s.site.name;
  document.getElementById('setSiteLogo').value = s.site.logo;
  document.getElementById('setSiteDesc').value = s.site.description;
  document.getElementById('setHero1').value = s.content.heroTitle1;
  document.getElementById('setHero2').value = s.content.heroTitle2;
  document.getElementById('setHeroSub').value = s.content.heroSub;
  document.getElementById('setPrimary').value = s.theme.primary;
  document.getElementById('setAccent').value = s.theme.accent;
  document.getElementById('setDiscord').value = s.site.contact.discord;
  document.getElementById('setLine').value = s.site.contact.line;
  document.getElementById('setEmail').value = s.site.contact.email;
}

async function saveSettings(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/admin/settings', { method: 'POST', body: {
      site: {
        name: fd.get('site.name'), logo: fd.get('site.logo'),
        description: fd.get('site.description'),
        contact: {
          discord: fd.get('site.contact.discord'),
          line: fd.get('site.contact.line'),
          email: fd.get('site.contact.email')
        }
      },
      content: {
        heroTitle1: fd.get('content.heroTitle1'),
        heroTitle2: fd.get('content.heroTitle2'),
        heroSub: fd.get('content.heroSub')
      },
      theme: { primary: fd.get('theme.primary'), accent: fd.get('theme.accent') }
    }});
    await loadSettings(); toast('บันทึกแล้ว');
  } catch (e) { toast(e.message, 'error'); }
}

async function loadLogs() {
  const type = document.getElementById('logTypeFilter')?.value || 'all';
  const logs = await api('/admin/logs?type=' + type);
  document.getElementById('adminLogList').innerHTML = logs.map(l => `
    <div class="log-item log-${l.type}">
      <span class="log-time">${new Date(l.timestamp).toLocaleString('th-TH')}</span>
      <span class="log-type">${l.type}</span>
      <span>${l.message}</span>
    </div>
  `).join('') || '<p>ไม่มี log</p>';
}

async function backupSystem() {
  const d = await api('/admin/system/backup', { method: 'POST' });
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'backup-' + Date.now() + '.json'; a.click();
  toast('Backup สำเร็จ');
}

async function clearCache() {
  await api('/admin/system/clear-cache', { method: 'POST' });
  toast('ล้าง cache แล้ว');
}

async function systemInfo() {
  const d = await api('/admin/system/info');
  document.getElementById('systemInfo').innerHTML = `<pre>${JSON.stringify(d, null, 2)}</pre>`;
}

function exportCSV(type) {
  if (!state.token) return;
  fetch('/api/admin/export/' + type, {
    headers: { 'Authorization': 'Bearer ' + state.token },
    credentials: 'include'
  }).then(r => r.blob()).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = type + '-' + Date.now() + '.csv'; a.click();
    toast('Export สำเร็จ');
  });
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab')) {
    const t = e.target.dataset.tab;
    document.querySelectorAll('.admin-tabs .tab').forEach(x => x.classList.toggle('active', x === e.target));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + t).classList.add('active');
  }
});

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const h = a.getAttribute('href');
    if (h.length > 1 && document.querySelector(h)) {
      e.preventDefault();
      const p = a.dataset.page;
      if (p) showPage(p);
    }
  });
});
