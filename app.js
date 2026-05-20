/* ═══════════════════════════════════════════════
   BAGERI UTAN GLUTEN — app.js
   ═══════════════════════════════════════════════ */

// ── GOOGLE SHEETS API ──────────────────────────
const API = 'https://script.google.com/macros/s/AKfycbx200ubifZjIn-L31kHtFiWDjglTHTP0-ecYCfRFTgb9wXnnRleUL2LQYtBFk5K5nz7/exec';

async function apiGet(action) {
  const r = await fetch(`${API}?action=${action}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'api error');
  return j.data;
}
async function apiPost(body) {
  const r = await fetch(API, { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'api error');
  return j;
}
async function sheetsPost(body) {
  try { await apiPost(body); } catch (e) { console.warn('Sheets save failed:', e); }
}

// ── DEFAULTS ───────────────────────────────────
const DEFAULTS = {
  password: null,
  bakeryName: 'Bageri utan gluten',
  products: [
    { id: 1, name: 'Bullar',    price: 15, salePrice: 0, stock: 20, ingredients: 'Surdeg på durramjöl & ekologiskt glutenfritt havremjöl. Fullkornsrismjöl, teffmjöl, bovetemjöl, majsstärkelse, potatismjöl. Toppas med vallmofrön.' },
    { id: 2, name: 'Ostbullar', price: 15, salePrice: 0, stock: 20, ingredients: 'Surdeg på durramjöl & ekologiskt glutenfritt havremjöl. Fullkornsrismjöl, teffmjöl, bovetemjöl, majsstärkelse, potatismjöl. Toppas med ost.' },
    { id: 3, name: 'Bröd',      price: 65, salePrice: 0, stock: 10, ingredients: 'Surdeg på fullkornsrismjöl & bovetemjöl. Fullkornsrismjöl, ekologiskt glutenfritt havremjöl, bovetemjöl, majsstärkelse, potatismjöl.' },
  ]
};

const DEFAULT_CAMPAIGNS = [
  {
    id: 1,
    title: 'Studentbullar, glutenfria 4-pack',
    description: 'Bakat från grunden med naturligt glutenfria råvaror. Perfekt för alla på festen, oavsett kostrestriktion.',
    deadline: '⏰ Sista beställning: 2 juni · Upphämtning 4–5 juni',
    expiresDate: '2026-06-05',
    active: true,
    options: [
      { key: 'fresh',  label: 'Färska',    price: 60, desc: 'Hämtas på plats' },
      { key: 'frozen', label: 'Frysta ❄️', price: 50, desc: 'Billigare, baka i förväg' }
    ]
  }
];

// ── STATE ──────────────────────────────────────
let products     = DEFAULTS.products;
let orders       = [];
let password     = DEFAULTS.password;
let bakeryName   = DEFAULTS.bakeryName;
let cart         = {};
let campaigns    = [];
let campaignState = {};
let vacationData = { closed: false, title: 'Semesterstängt', msg: 'Vi är tillbaka snart!' };
let isAdminMode  = false;

// ── LOCAL STORAGE ──────────────────────────────
function lsave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function lload(k, d) { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch { return d; } }

// ── LOADER ─────────────────────────────────────
function showLoader(on) {
  let el = document.getElementById('page-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'page-loader';
    el.style.cssText = 'position:fixed;inset:0;background:var(--cream);display:flex;align-items:center;justify-content:center;z-index:999;flex-direction:column;gap:0.75rem;font-family:DM Sans,sans-serif;color:var(--muted);font-size:0.9rem;';
    el.innerHTML = '<span style="font-size:2.5rem">🥐</span><span>Laddar...</span>';
    document.body.appendChild(el);
  }
  el.style.display = on ? 'flex' : 'none';
}

// ── LOAD FROM SHEETS ───────────────────────────
async function loadFromSheets() {
  showLoader(true);
  try {
    const [prods, settings, camps] = await Promise.all([
      apiGet('getProducts'),
      apiGet('getSettings'),
      apiGet('getCampaigns')
    ]);
    if (prods && prods.length) {
      products = prods.map(p => ({ ...p, id: Number(p.id), price: Number(p.price), salePrice: Number(p.salePrice) || 0, stock: Number(p.stock) }));
      lsave('bak_products', products);
    }
    if (settings) {
      if (settings.bakeryName) { bakeryName = settings.bakeryName; lsave('bak_name', bakeryName); }
      if (settings.password)   { password   = settings.password;   lsave('bak_password', password); }
      if (settings.vacation)   {
        try { vacationData = JSON.parse(settings.vacation); lsave('bak_vacation', vacationData); } catch {}
      }
    }
    if (camps && camps.length) {
      campaigns = camps.map(c => ({ ...c, id: Number(c.id), active: c.active === true || c.active === 'TRUE', options: typeof c.options === 'string' ? JSON.parse(c.options) : (c.options || []) }));
      lsave('bak_campaigns', campaigns);
    } else {
      campaigns = lload('bak_campaigns', DEFAULT_CAMPAIGNS);
    }
  } catch (e) {
    console.warn('Sheets ej nåbart, använder cache:', e);
    products     = lload('bak_products', DEFAULTS.products);
    password     = lload('bak_password', null);
    bakeryName   = lload('bak_name',     DEFAULTS.bakeryName);
    campaigns    = lload('bak_campaigns', DEFAULT_CAMPAIGNS);
    vacationData = lload('bak_vacation',  { closed: false, title: 'Semesterstängt', msg: 'Vi är tillbaka snart!' });
  }
  document.getElementById('bakery-name').textContent = bakeryName;
  applyVacation();
  renderProducts();
  updateSubmitBtn();
  renderInlineCampaigns();
  loadAboutPhoto();
  showLoader(false);
}

// ── VIEWS ──────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showAdminLogin() {
  showView('view-admin-login');
  document.getElementById('admin-pw').value = '';
  document.getElementById('login-error').textContent = '';
}
function doAdminLogin() {
  if (!password) { document.getElementById('login-error').textContent = 'Lösenord ej laddat ännu. Försök igen om en stund.'; return; }
  if (document.getElementById('admin-pw').value === password) {
    showView('view-admin');
    renderAdminOrders();
    renderAdminProducts();
    renderSettings();
    setPhotoAdminMode(true);
  } else {
    document.getElementById('login-error').textContent = 'Fel lösenord. Försök igen.';
  }
}
function adminLogout() {
  showView('view-customer');
  setPhotoAdminMode(false);
}
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-content').forEach(c => c.style.display = 'none');
  document.getElementById('tab-' + tab).style.display = 'block';
  btn.classList.add('active');
  if (tab === 'orders')    renderAdminOrders();
  if (tab === 'products')  renderAdminProducts();
  if (tab === 'campaigns') renderAdminCampaigns();
  if (tab === 'settings')  renderSettings();
}

// ── CUSTOMER TABS ──────────────────────────────
function switchCustomerTab(tab, btn) {
  document.querySelectorAll('.customer-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.customer-tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('ctab-' + tab).classList.add('active');
  document.querySelectorAll('.customer-tab-btn').forEach(b => {
    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + tab + "'")) b.classList.add('active');
  });
  if (tab === 'bageriet') renderInlineCampaigns();
}

// ── VACATION / CLOSED ──────────────────────────
function applyVacation() {
  const banner  = document.getElementById('closed-banner');
  const titleEl = document.getElementById('closed-title');
  const msgEl   = document.getElementById('closed-msg');
  const btn     = document.getElementById('submit-btn');
  if (!banner) return;
  if (vacationData.closed) {
    banner.classList.add('show');
    if (titleEl) titleEl.textContent = vacationData.title || 'Semesterstängt';
    if (msgEl)   msgEl.textContent   = vacationData.msg   || '';
    if (btn) { btn.disabled = true; btn.innerHTML = '🏖 Stängt just nu'; }
  } else {
    banner.classList.remove('show');
    updateSubmitBtn();
    if (btn) btn.innerHTML = '🍞 Skicka beställning';
  }
}
async function saveVacation() {
  const closed = document.getElementById('vacation-toggle')?.checked || false;
  const title  = document.getElementById('vacation-title')?.value.trim() || 'Semesterstängt';
  const msg    = document.getElementById('vacation-msg')?.value.trim()   || '';
  vacationData = { closed, title, msg };
  lsave('bak_vacation', vacationData);
  await sheetsPost({ action: 'saveSettings', settings: { bakeryName, password, vacation: JSON.stringify(vacationData) } });
  applyVacation();
}
function renderVacationSettings() {
  const toggle = document.getElementById('vacation-toggle');
  const titleI = document.getElementById('vacation-title');
  const msgI   = document.getElementById('vacation-msg');
  if (toggle) toggle.checked   = vacationData.closed || false;
  if (titleI) titleI.value     = vacationData.title  || 'Semesterstängt';
  if (msgI)   msgI.value       = vacationData.msg    || '';
}

// ── ABOUT PHOTO ────────────────────────────────
function setPhotoAdminMode(on) {
  isAdminMode = on;
  const wrap    = document.getElementById('about-photo-wrap');
  const ph      = document.getElementById('about-photo-placeholder');
  const overlay = document.getElementById('about-photo-overlay');
  if (!wrap) return;
  if (on) {
    wrap.style.cursor = 'pointer';
    wrap.onclick = () => document.getElementById('about-photo-input').click();
    if (ph) ph.classList.add('admin-visible');
    if (overlay) overlay.style.display = 'flex';
  } else {
    wrap.style.cursor = 'default';
    wrap.onclick = null;
    if (ph) ph.classList.remove('admin-visible');
    if (overlay) overlay.style.display = 'none';
  }
}
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    lsave('bak_about_photo', e.target.result);
    applyAboutPhoto(e.target.result);
  };
  reader.readAsDataURL(file);
}
function applyAboutPhoto(dataUrl) {
  const img = document.getElementById('about-photo-img');
  const ph  = document.getElementById('about-photo-placeholder');
  if (!img) return;
  img.src = dataUrl;
  img.style.display = 'block';
  if (ph) ph.style.display = 'none';
}
function loadAboutPhoto() {
  const saved = lload('bak_about_photo', null);
  if (saved) applyAboutPhoto(saved);
}

// ── PRODUCTS ───────────────────────────────────
function renderProducts() {
  const grid = document.getElementById('products-grid');
  // Filter out virtual campaign products (negative IDs)
  const visibleProducts = products.filter(p => p.id > 0);
  if (!visibleProducts.length) { grid.innerHTML = '<p style="color:var(--muted);font-style:italic">Inga produkter tillgängliga just nu.</p>'; return; }
  grid.innerHTML = visibleProducts.map(p => {
    const qty     = cart[p.id] || 0;
    const soldOut = p.stock <= 0;
    const hasSale = p.salePrice && p.salePrice > 0 && p.salePrice < p.price;
    const priceHtml = hasSale
      ? `<span class="product-price-original">${p.price} kr</span><span class="product-price-sale">${p.salePrice} kr/st</span><span class="sale-badge">Rea</span>`
      : `${p.price} kr/st`;
    const hasIngredients = p.ingredients && p.ingredients.trim();
    return `<div class="product-card${soldOut ? ' sold-out' : ''}">
      <div class="product-card-main">
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <div class="product-price">${priceHtml}</div>
          ${!soldOut ? `<div class="product-stock">Kvar: ${p.stock - qty} st</div>` : ''}
        </div>
        ${soldOut ? '<span class="sold-out-badge">Slutsålt</span>' : `<div class="qty-control">
          <button class="qty-btn" onclick="changeQty(${p.id},-1)" ${qty === 0 ? 'disabled' : ''}>−</button>
          <span class="qty-num">${qty}</span>
          <button class="qty-btn" onclick="changeQty(${p.id},1)" ${qty >= p.stock ? 'disabled' : ''}>+</button>
        </div>`}
      </div>
      ${hasIngredients ? `
        <button class="ingredients-toggle" onclick="toggleIngredients(this)" aria-expanded="false">
          🌾 Ingredienser <span class="arrow">▼</span>
        </button>
        <div class="ingredients-body">${p.ingredients.trim()}</div>` : ''}
    </div>`;
  }).join('');
}

function toggleIngredients(btn) {
  btn.classList.toggle('open');
  const body = btn.nextElementSibling;
  body.classList.toggle('open');
  btn.setAttribute('aria-expanded', body.classList.contains('open'));
}

function changeQty(id, delta) {
  const p = products.find(x => x.id === id); if (!p) return;
  const next = Math.max(0, Math.min(p.stock, (cart[id] || 0) + delta));
  if (next === 0) delete cart[id]; else cart[id] = next;
  renderProducts(); renderSummary(); updateSubmitBtn();
  if (Object.keys(cart).length > 0) document.getElementById('err-cart').classList.remove('show');
}

function activePrice(p) { return (p.salePrice && p.salePrice > 0 && p.salePrice < p.price) ? p.salePrice : p.price; }

function renderSummary() {
  const el = document.getElementById('order-summary');
  const items = Object.entries(cart);
  if (!items.length) { el.innerHTML = '<p class="empty-cart">Du har inte valt något ännu.</p>'; return; }
  let total = 0;
  const lines = items.map(([id, qty]) => {
    const p = products.find(x => x.id == id), sub = activePrice(p) * qty; total += sub;
    return `<div class="summary-line"><span>${p.name} × ${qty}</span><span>${sub} kr</span></div>`;
  }).join('');
  el.innerHTML = `<div>${lines}<div class="summary-line summary-total"><span>Totalt</span><span>${total} kr</span></div></div>`;
}

function cartTotal() { return Object.entries(cart).reduce((s, [id, qty]) => { const p = products.find(x => x.id == id); return s + (p ? activePrice(p) * qty : 0); }, 0); }
function updateSubmitBtn() { const btn = document.getElementById('submit-btn'); if (btn && !vacationData.closed) btn.disabled = Object.keys(cart).length === 0; }

// ── VALIDATION ─────────────────────────────────
function clearFieldError(fieldId, errId) {
  document.getElementById(fieldId)?.classList.remove('error');
  document.getElementById(errId)?.classList.remove('show');
}
function validateForm() {
  let valid = true;
  const name       = document.getElementById('cust-name').value.trim();
  const phone      = document.getElementById('cust-phone').value.trim();
  const pickupWish = document.getElementById('pickup-wish').value.trim();
  if (!name)       { document.getElementById('cust-name').classList.add('error');   document.getElementById('err-name').classList.add('show');   valid = false; }
  if (!phone)      { document.getElementById('cust-phone').classList.add('error');  document.getElementById('err-phone').classList.add('show');  valid = false; }
  if (!pickupWish) { document.getElementById('pickup-wish').classList.add('error'); document.getElementById('err-pickup').classList.add('show'); valid = false; }
  if (!Object.keys(cart).length) { document.getElementById('err-cart').classList.add('show'); valid = false; }
  return valid;
}

// ── TELEGRAM ───────────────────────────────────
const TG_TOKEN = '8512071845:AAE2tMBb1DVefpKKBAS0OZmhV9Th2S1i6RM';
const TG_CHAT  = '8730354737';
function sendTelegram(msg) {
  fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' })
  }).catch(() => {});
}

// ── SUBMIT ORDER ───────────────────────────────
let lastOrder = {};
function submitOrder() {
  if (!validateForm()) return;
  const name       = document.getElementById('cust-name').value.trim();
  const phone      = document.getElementById('cust-phone').value.trim();
  const pickupWish = document.getElementById('pickup-wish').value.trim();
  const note       = document.getElementById('cust-note').value.trim();
  const items      = Object.entries(cart).map(([id, qty]) => { const p = products.find(x => x.id == id); return { id: p.id, name: p.name, qty, price: activePrice(p) }; });
  const total      = items.reduce((s, i) => s + i.qty * i.price, 0);
  const order      = { id: Date.now(), name, phone, pickupWish, note, items, total, createdAt: new Date().toLocaleString('sv-SE') };
  lastOrder        = { name, phone, pickupWish, note, items, total };

  items.forEach(i => { const p = products.find(x => x.id === i.id); if (p) p.stock -= i.qty; });
  lsave('bak_products', products);
  sheetsPost({ action: 'saveOrder', order });
  sheetsPost({ action: 'saveProducts', products });
  orders = lload('bak_orders', []); orders.unshift(order); lsave('bak_orders', orders);

  const itemLines = items.map(i => `  🍞 ${i.name} × ${i.qty} — ${i.qty * i.price} kr`).join('\n');
  const noteLine  = note ? `\n💬 ${note}` : '';
  sendTelegram(`🛒 <b>Ny beställning!</b>\n👤 ${name}\n📞 ${phone}\n📅 ${pickupWish}\n\n${itemLines}\n\n💰 <b>Totalt: ${total} kr</b>${noteLine}`);

  document.getElementById('order-form-wrap').style.display = 'none';
  document.getElementById('success-box').style.display = 'block';
  document.getElementById('success-msg').textContent = `${name}, din beställning är mottagen! Vi återkommer för att bekräfta upphämtningstid.`;
  document.getElementById('success-swish-line').textContent = `${total} kr · +46 76-877 86 76`;
}

function resetOrder() {
  cart = {};
  renderProducts(); renderSummary(); updateSubmitBtn();
  ['cust-name','cust-phone','cust-note','pickup-wish'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['err-name','err-phone','err-pickup','err-cart'].forEach(id => document.getElementById(id)?.classList.remove('show'));
  ['cust-name','cust-phone','pickup-wish'].forEach(id => document.getElementById(id)?.classList.remove('error'));
  document.getElementById('order-form-wrap').style.display = 'block';
  document.getElementById('success-box').style.display = 'none';
}

function shareOrder() {
  const o = lastOrder;
  const itemLines = o.items.map(i => `${i.name} × ${i.qty} — ${i.qty * i.price} kr`).join('\n');
  const text = `🥐 Beställning – Bageri utan gluten\n\n${o.name}\n📅 Önskad tid: ${o.pickupWish}\n📍 Narcissgatan 32, 256 61 Helsingborg\n\n${itemLines}\n\n💰 Totalt: ${o.total} kr\nSwisha till: +46 76-877 86 76`;
  if (navigator.share) {
    navigator.share({ title: 'Beställningsbekräftelse', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => alert('Bekräftelsen kopierades!')).catch(() => alert('Kunde inte dela.'));
  }
}

// ── FREE ORDER (Önskemål-fliken) ───────────────
function submitFreeOrder() {
  const name  = document.getElementById('fr-name').value.trim();
  const phone = document.getElementById('fr-phone').value.trim();
  const wish  = document.getElementById('fr-wish').value.trim();
  if (!name || !phone || !wish) { alert('Fyll i namn, telefon och ditt önskemål.'); return; }
  sendTelegram(`💌 <b>Fri förfrågan!</b>\n👤 ${name}\n📞 ${phone}\n\n📝 ${wish}`);
  document.getElementById('free-order-form').style.display   = 'none';
  document.getElementById('free-order-success').style.display = 'block';
}
function resetFreeOrder() {
  ['fr-name','fr-phone','fr-wish'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('free-order-form').style.display   = 'block';
  document.getElementById('free-order-success').style.display = 'none';
}

// ── INLINE CAMPAIGNS (Bageriet-fliken) ─────────
function isCampaignExpired(c) {
  if (!c.expiresDate) return false;
  return new Date(c.expiresDate + 'T23:59:59') < new Date();
}

// ── INLINE CAMPAIGNS (Bageriet-fliken) ─────────
// Lägger kampanjprodukten direkt i varukorgen
// och använder det vanliga beställningsformuläret

function renderInlineCampaigns() {
  const container = document.getElementById('inline-campaigns-container');
  if (!container) return;
  const active = campaigns.filter(c => c.active && !isCampaignExpired(c));
  if (!active.length) { container.innerHTML = ''; return; }

  container.innerHTML = active.map(c => {
    const state  = campaignState[c.id] || { selectedOption: c.options[0]?.key, qty: 1 };
    campaignState[c.id] = state;
    const selOpt = c.options.find(o => o.key === state.selectedOption) || c.options[0];
    const total  = (selOpt?.price || 0) * state.qty;

    return `<div class="campaign-card" id="icamp-${c.id}">
      <div class="campaign-card-header" onclick="toggleCampaignCard(${c.id})">
        <div class="campaign-card-left">
          <span class="campaign-card-emoji">🎓</span>
          <div class="campaign-card-info">
            <h4>${c.title}</h4>
            <p>${c.deadline || 'Specialerbjudande'}</p>
          </div>
        </div>
        <span class="campaign-card-chevron">▼</span>
      </div>
      <div class="campaign-card-body">
        ${c.description ? `<p style="font-size:0.88rem;color:var(--caramel-light);margin:0.75rem 0 1rem">${c.description}</p>` : ''}
        <div class="price-options">
          ${c.options.map(opt => `
            <div class="price-option ${opt.key === state.selectedOption ? 'selected' : ''}"
                 onclick="selectInlineOption(${c.id},'${opt.key}')">
              <div class="price-option-label">${opt.label}</div>
              <div class="price-option-price">${opt.price} kr</div>
              <div class="price-option-desc">${opt.desc}</div>
            </div>`).join('')}
        </div>
        <div class="special-qty">
          <label>Antal 4-pack:</label>
          <div class="qty-control">
            <button class="qty-btn" onclick="changeInlineQty(${c.id},-1)">−</button>
            <span class="qty-num" id="icqty-${c.id}">${state.qty}</span>
            <button class="qty-btn" onclick="changeInlineQty(${c.id},1)">+</button>
          </div>
          <span id="ictotal-${c.id}" style="font-weight:700;color:var(--crust);margin-left:0.5rem">${total} kr</span>
        </div>
        <button class="btn-bread" style="margin-top:0.75rem" onclick="addCampaignToCart(${c.id})">
          + Lägg till i beställning
        </button>
        <p style="font-size:0.78rem;color:var(--muted);margin-top:0.5rem;text-align:center">Fyll sedan i dina uppgifter nedan och skicka beställningen som vanligt.</p>
      </div>
    </div>`;
  }).join('');
}

function toggleCampaignCard(cid) {
  document.getElementById('icamp-' + cid)?.classList.toggle('open');
}

function selectInlineOption(cid, optKey) {
  if (!campaignState[cid]) campaignState[cid] = { selectedOption: optKey, qty: 1 };
  campaignState[cid].selectedOption = optKey;
  renderInlineCampaigns();
  document.getElementById('icamp-' + cid)?.classList.add('open');
}

function changeInlineQty(cid, delta) {
  if (!campaignState[cid]) campaignState[cid] = { selectedOption: null, qty: 1 };
  campaignState[cid].qty = Math.max(1, (campaignState[cid].qty || 1) + delta);
  const c   = campaigns.find(x => x.id === cid);
  const opt = c?.options.find(o => o.key === campaignState[cid].selectedOption) || c?.options[0];
  const el  = document.getElementById('icqty-' + cid);   if (el) el.textContent = campaignState[cid].qty;
  const tel = document.getElementById('ictotal-' + cid); if (tel) tel.textContent = ((opt?.price || 0) * campaignState[cid].qty) + ' kr';
}

function addCampaignToCart(cid) {
  const c = campaigns.find(x => x.id === cid); if (!c) return;
  const state = campaignState[cid] || { selectedOption: c.options[0]?.key, qty: 1 };
  const opt   = c.options.find(o => o.key === state.selectedOption) || c.options[0];

  // Add as a virtual product in cart using negative ID to avoid collision
  const virtualId = -cid;
  const virtualProduct = {
    id:    virtualId,
    name:  `${c.title} (${opt.label})`,
    price: opt.price,
    salePrice: 0,
    stock: 999,
    ingredients: ''
  };

  // Add/update in products list temporarily
  const existing = products.find(p => p.id === virtualId);
  if (!existing) products.push(virtualProduct);
  else { existing.name = virtualProduct.name; existing.price = virtualProduct.price; }

  cart[virtualId] = state.qty;
  renderProducts();
  renderSummary();
  updateSubmitBtn();

  // Show confirmation in card and close it
  const card = document.getElementById('icamp-' + cid);
  if (card) {
    card.classList.remove('open');
    const info = card.querySelector('.campaign-card-info p');
    if (info) info.textContent = `✓ Tillagd i beställningen (${state.qty} st)`;
  }

  // Scroll to order form
  document.getElementById('order-form-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── ADMIN ORDERS ───────────────────────────────
async function renderAdminOrders() {
  const el = document.getElementById('orders-list');
  el.innerHTML = '<p style="color:var(--muted);font-style:italic;padding:1rem 0">Laddar beställningar...</p>';
  try { orders = await apiGet('getOrders'); } catch (e) { orders = lload('bak_orders', []); }
  if (!orders.length) { el.innerHTML = '<div class="no-orders">Inga beställningar än.</div>'; return; }
  el.innerHTML = orders.map(o => `
    <div class="order-card" id="order-${o.id}">
      <div class="order-card-header">
        <div><div class="order-customer">${o.name}</div><div class="order-meta">📞 ${o.phone} · Beställd ${o.createdAt}</div></div>
        <span class="order-time-badge">📅 ${o.pickupWish || '–'}</span>
      </div>
      <div class="order-items">${o.items.map(i => `<span>${i.name} × ${i.qty}</span>`).join('')}</div>
      <div class="order-total">Totalt: ${o.total} kr</div>
      ${o.note ? `<div class="order-note">💬 ${o.note}</div>` : ''}
    </div>`).join('');
}
function clearAllOrders() {
  if (!confirm('Rensa alla beställningar?')) return;
  orders = []; lsave('bak_orders', []); renderAdminOrders();
}

// ── ADMIN PRODUCTS ─────────────────────────────
function renderAdminProducts() {
  document.getElementById('products-manage-list').innerHTML = products.map(p => `
    <div class="product-manage-card">
      <div class="product-manage-row">
        <div class="form-group"><label>Namn</label><input type="text" id="pname-${p.id}" value="${p.name}" oninput="markDirty()"></div>
        <div class="form-group sm"><label>Pris (kr)</label><input type="number" id="pprice-${p.id}" value="${p.price}" min="0" oninput="markDirty()"></div>
        <div class="form-group sm"><label>Reapris (kr)</label><input type="number" id="psaleprice-${p.id}" value="${p.salePrice || ''}" min="0" placeholder="–" oninput="markDirty()"></div>
        <div class="form-group sm"><label>Lager</label><input type="number" id="pstock-${p.id}" value="${p.stock}" min="0" oninput="markDirty()"></div>
        <button class="btn-danger" onclick="removeProduct(${p.id})">Ta bort</button>
      </div>
      <div class="form-group" style="margin-top:0.75rem;margin-bottom:0">
        <label>Ingredienser <span style="font-weight:300;text-transform:none;letter-spacing:0">(fällbar lista)</span></label>
        <textarea id="pingredients-${p.id}" rows="3" placeholder="T.ex. Surdeg på fullkornsrismjöl…" oninput="markDirty()">${p.ingredients || ''}</textarea>
      </div>
      ${p.salePrice && p.salePrice > 0 && p.salePrice < p.price ? `<p style="font-size:0.78rem;color:var(--berry);margin-top:0.5rem">🏷 Rea aktiv: ${p.salePrice} kr (ordinarie ${p.price} kr)</p>` : ''}
    </div>`).join('');
  document.getElementById('unsaved-banner').classList.remove('show');
}
function markDirty() { document.getElementById('unsaved-banner').classList.add('show'); }
function addProductRow() { const id = Date.now(); products.push({ id, name: '', price: 0, salePrice: 0, stock: 0, ingredients: '' }); renderAdminProducts(); markDirty(); document.getElementById('pname-' + id)?.focus(); }
function removeProduct(id) { if (!confirm('Ta bort produkten?')) return; products = products.filter(p => p.id !== id); renderAdminProducts(); markDirty(); }
async function saveProducts() {
  products = products.map(p => {
    const name          = document.getElementById('pname-'       + p.id)?.value.trim() || p.name;
    const price         = parseInt(document.getElementById('pprice-'      + p.id)?.value) || 0;
    const salePriceRaw  = document.getElementById('psaleprice-'  + p.id)?.value;
    const salePrice     = salePriceRaw !== '' && salePriceRaw !== undefined ? parseInt(salePriceRaw) || 0 : 0;
    const stock         = parseInt(document.getElementById('pstock-'      + p.id)?.value) || 0;
    const ingredients   = document.getElementById('pingredients-'+ p.id)?.value.trim() || '';
    return { id: p.id, name, price, salePrice, stock, ingredients };
  }).filter(p => p.name);
  lsave('bak_products', products);
  await sheetsPost({ action: 'saveProducts', products });
  renderProducts(); renderAdminProducts();
  const c = document.getElementById('save-confirm'); c.classList.add('show'); setTimeout(() => c.classList.remove('show'), 2500);
}

// ── ADMIN CAMPAIGNS ────────────────────────────
function renderAdminCampaigns() {
  const list = document.getElementById('campaigns-manage-list');
  if (!campaigns.length) { list.innerHTML = '<p style="color:var(--muted);font-style:italic;margin-bottom:1rem">Inga kampanjer ännu.</p>'; return; }
  list.innerHTML = campaigns.map(c => {
    const expired = isCampaignExpired(c);
    return `<div class="campaign-manage-card">
      <div class="campaign-row">
        <div class="form-group" style="flex:2;min-width:200px"><label>Titel</label><input type="text" id="ctitle-${c.id}" value="${c.title}" oninput="markCampaignsDirty()"></div>
        <div class="form-group"><label>Slutdatum</label><input type="date" id="cexpires-${c.id}" value="${c.expiresDate || ''}" oninput="markCampaignsDirty()"></div>
        <div class="form-group" style="max-width:90px"><label>Aktiv</label>
          <select id="cactive-${c.id}" oninput="markCampaignsDirty()">
            <option value="true"  ${c.active ? 'selected' : ''}>Ja</option>
            <option value="false" ${!c.active ? 'selected' : ''}>Nej</option>
          </select>
        </div>
        <button class="btn-danger" onclick="removeCampaign(${c.id})">Ta bort</button>
      </div>
      <div class="form-group" style="margin-top:0.75rem"><label>Beskrivning</label><textarea id="cdesc-${c.id}" rows="2" oninput="markCampaignsDirty()">${c.description || ''}</textarea></div>
      <div class="form-group"><label>Deadlinetext (visas för kund)</label><input type="text" id="cdeadline-${c.id}" value="${c.deadline || ''}" placeholder="T.ex. ⏰ Sista beställning: 2 juni" oninput="markCampaignsDirty()"></div>
      <div style="margin-top:0.75rem">
        <label style="display:block;font-size:0.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem">Prisalternativ</label>
        ${c.options.map((o, i) => `<div style="display:flex;gap:0.5rem;margin-bottom:0.4rem;flex-wrap:wrap">
          <input style="flex:0.5;min-width:80px"  type="text"   placeholder="nyckel"     value="${o.key}"   id="cokey-${c.id}-${i}"   oninput="markCampaignsDirty()">
          <input style="flex:1;min-width:100px"   type="text"   placeholder="Etikett"    value="${o.label}" id="colabel-${c.id}-${i}" oninput="markCampaignsDirty()">
          <input style="flex:0.5;min-width:70px"  type="number" placeholder="Pris"       value="${o.price}" id="coprice-${c.id}-${i}" oninput="markCampaignsDirty()">
          <input style="flex:1;min-width:120px"   type="text"   placeholder="Beskrivning" value="${o.desc}" id="codesc-${c.id}-${i}"  oninput="markCampaignsDirty()">
        </div>`).join('')}
      </div>
      ${expired ? '<p class="campaign-expired-note">⚠ Slutdatum passerat, döljs för kunder</p>' : '<p class="campaign-active-note">✓ Aktiv och synlig för kunder</p>'}
    </div>`;
  }).join('');
  document.getElementById('unsaved-campaigns-banner').classList.remove('show');
}
function markCampaignsDirty() { document.getElementById('unsaved-campaigns-banner').classList.add('show'); }
function addCampaignRow() {
  const id = Date.now();
  campaigns.push({ id, title: 'Ny kampanj', description: '', deadline: '', expiresDate: '', active: true, options: [{ key: 'option1', label: 'Alternativ 1', price: 0, desc: '' }, { key: 'option2', label: 'Alternativ 2', price: 0, desc: '' }] });
  renderAdminCampaigns(); markCampaignsDirty();
}
function removeCampaign(id) { if (!confirm('Ta bort kampanjen?')) return; campaigns = campaigns.filter(c => c.id !== id); renderAdminCampaigns(); markCampaignsDirty(); }
function saveCampaigns() {
  campaigns = campaigns.map(c => ({
    id:          c.id,
    title:       document.getElementById('ctitle-'   + c.id)?.value.trim()   || c.title,
    description: document.getElementById('cdesc-'    + c.id)?.value.trim()   || '',
    deadline:    document.getElementById('cdeadline-'+ c.id)?.value.trim()   || '',
    expiresDate: document.getElementById('cexpires-' + c.id)?.value          || '',
    active:      document.getElementById('cactive-'  + c.id)?.value === 'true',
    options:     c.options.map((o, i) => ({
      key:   document.getElementById(`cokey-${c.id}-${i}`)?.value.trim()   || o.key,
      label: document.getElementById(`colabel-${c.id}-${i}`)?.value.trim() || o.label,
      price: parseInt(document.getElementById(`coprice-${c.id}-${i}`)?.value) || 0,
      desc:  document.getElementById(`codesc-${c.id}-${i}`)?.value.trim()  || ''
    }))
  }));
  lsave('bak_campaigns', campaigns);
  sheetsPost({ action: 'saveCampaigns', campaigns });
  renderAdminCampaigns();
  const c = document.getElementById('save-campaigns-confirm'); c.classList.add('show'); setTimeout(() => c.classList.remove('show'), 2500);
}

// ── ADMIN SETTINGS ─────────────────────────────
function renderSettings() {
  document.getElementById('bakery-name-input').value = bakeryName;
  renderVacationSettings();
}
async function saveBakeryName() {
  bakeryName = document.getElementById('bakery-name-input').value.trim() || DEFAULTS.bakeryName;
  lsave('bak_name', bakeryName);
  document.getElementById('bakery-name').textContent = bakeryName;
  await saveSettingsToSheets();
  showMsg('msg-name', '✓ Sparat');
}
async function saveSettingsToSheets() {
  await sheetsPost({ action: 'saveSettings', settings: { bakeryName, password, vacation: JSON.stringify(vacationData) } });
}
function showMsg(id, text) { const el = document.getElementById(id); if (!el) return; el.textContent = text; el.style.display = 'inline'; setTimeout(() => el.style.display = 'none', 2500); }
async function changePassword() {
  const pw  = document.getElementById('new-pw').value;
  const msg = document.getElementById('pw-msg');
  if (pw.length < 4) { msg.textContent = 'Lösenordet måste vara minst 4 tecken.'; msg.style.color = 'var(--danger)'; return; }
  password = pw; lsave('bak_password', pw);
  await saveSettingsToSheets();
  document.getElementById('new-pw').value = '';
  msg.textContent = '✓ Lösenord sparat!'; msg.style.color = 'var(--success)';
  setTimeout(() => msg.textContent = '', 3000);
}

// ── BACKUP & RESTORE ───────────────────────────
function exportSettings() {
  const data = { version: 1, exportedAt: new Date().toLocaleString('sv-SE'), bakeryName, products, campaigns, password };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `bageri-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}
async function importSettings(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version || !data.products) throw new Error('Ogiltig fil');
      if (!confirm('Återställ alla inställningar från backupfilen?')) return;
      if (data.bakeryName) { bakeryName = data.bakeryName; lsave('bak_name', bakeryName); document.getElementById('bakery-name').textContent = bakeryName; }
      if (data.products)   { products   = data.products;   lsave('bak_products', products); await sheetsPost({ action: 'saveProducts', products }); renderProducts(); }
      if (data.campaigns)  { campaigns  = data.campaigns;  lsave('bak_campaigns', campaigns); }
      if (data.password)   { password   = data.password;   lsave('bak_password', password); }
      await saveSettingsToSheets();
      renderSettings();
      const msg = document.getElementById('import-msg');
      msg.textContent = `✓ Återställd från backup (${data.exportedAt})`; msg.style.color = 'var(--success)'; msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 4000);
    } catch (err) {
      const msg = document.getElementById('import-msg');
      msg.textContent = '✗ Kunde inte läsa filen.'; msg.style.color = 'var(--danger)'; msg.style.display = 'block';
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ── INIT ───────────────────────────────────────
loadFromSheets();
