// NazzGab Bikes storefront.
//
// The browser keeps the basket locally and NEVER calculates money: it sends the
// basket to the API and displays whatever the COBOL backend returns.
// If there is no API (GitHub Pages, or index.html opened directly) it shows a
// labelled browser-only preview with checkout disabled.

const peso = cents => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100);
const $ = id => document.getElementById(id);
const STORE_KEY = 'nazzgab-bikes-basket';

// Used ONLY by the browser-only preview, when the API is not reachable.
// (The real catalogue lives in server.js.)  [id, name, category, priceCents, stock]
const PREVIEW_ROWS = [
  ['roadster-pro', 'Roadster Pro 700c', 'Road', 3850000, 8],
  ['aero-carbon-r9', 'Aero Carbon R9', 'Road', 8990000, 3],
  ['trailblazer-29', 'Trailblazer 29er', 'Mountain', 4290000, 6],
  ['summit-full-sus', 'Summit Full-Sus 27.5', 'Mountain', 7650000, 4],
  ['cityline-commuter', 'Cityline Commuter', 'City', 1890000, 12],
  ['foldie-compact', 'Foldie Compact 20in', 'City', 2350000, 9],
  ['voltride-e-city', 'Voltride E-City', 'Electric', 6990000, 5],
  ['e-trail-mid-drive', 'E-Trail Mid-Drive', 'Electric', 12490000, 2],
  ['aero-helmet', 'Aero Helmet', 'Gear', 285000, 25],
  ['led-light-set', 'LED Light Set (F+R)', 'Gear', 125000, 40],
  ['u-lock', 'Heavy-Duty U-Lock', 'Gear', 165000, 30],
  ['padded-gloves', 'Padded Gloves', 'Gear', 89000, 35],
  ['inner-tube-700c', 'Inner Tube 700c', 'Parts', 28000, 90],
  ['chain-lube', 'Chain Lube 120ml', 'Parts', 42000, 60],
  ['floor-pump', 'Floor Pump w/ Gauge', 'Parts', 148000, 20],
  ['disc-brake-pads', 'Disc Brake Pads', 'Parts', 75000, 45],
];

const state = {
  products: [],
  preview: false,
  category: 'All',
  search: '',
  sort: 'featured',
  cart: new Map(),     // id -> quantity in the basket
  pending: new Map(),  // id -> quantity chosen on the product card
  promo: '',
  quote: null,         // last good answer from COBOL
  error: null,
};

const SORTS = {
  'price-asc': (a, b) => a.priceCents - b.priceCents,
  'price-desc': (a, b) => b.priceCents - a.priceCents,
  name: (a, b) => a.name.localeCompare(b.name),
};

// ---------- tiny DOM helper -------------------------------------------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) el.append(kid instanceof Node ? kid : document.createTextNode(kid));
  return el;
}

// ---------- basket kept in this browser (survives a page refresh) --------
function saveBasket() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ items: [...state.cart], promo: state.promo })); } catch { /* storage may be blocked */ }
}

function restoreBasket() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved) return;
    for (const [id, qty] of saved.items || []) {
      if (state.products.some(p => p.id === id) && Number.isInteger(qty) && qty > 0) state.cart.set(id, qty);
    }
    state.promo = typeof saved.promo === 'string' ? saved.promo.slice(0, 12) : '';
    $('promo').value = state.promo;
  } catch { /* ignore a corrupted or blocked store */ }
}

let toastTimer;
function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------- artwork (simple original bike drawings) ---------------------
const ART = {
  Road:     { bg: '#dfe9e3', c: '#1f5c46', wheel: 2.5 },
  Mountain: { bg: '#f3e1d2', c: '#b4501a', wheel: 5 },
  City:     { bg: '#e6e2f1', c: '#4b3f8f', wheel: 3.5 },
  Electric: { bg: '#fbefc9', c: '#a87500', wheel: 3.5 },
};

function bikeSvg(cat) {
  const a = ART[cat];
  if (cat === 'Gear') {
    return `<svg viewBox="0 0 120 80"><path d="M25 52a35 35 0 0 1 70 0z" fill="#e8590c"/>
      <path d="M25 52h70" stroke="#1c2b25" stroke-width="4" stroke-linecap="round"/>
      <path d="M45 30l6 22M60 24v28M75 30l-6 22" stroke="#fff" stroke-width="3" opacity=".7"/>
      <rect x="40" y="56" width="40" height="5" rx="2.5" fill="#1c2b25"/></svg>`;
  }
  if (cat === 'Parts') {
    return `<svg viewBox="0 0 120 80"><circle cx="60" cy="40" r="22" fill="none" stroke="#1c2b25" stroke-width="9" stroke-dasharray="7 4.4"/>
      <circle cx="60" cy="40" r="15" fill="#1f5c46"/><circle cx="60" cy="40" r="6" fill="#f5efe3"/></svg>`;
  }
  const w = a.wheel;
  const extra = cat === 'Electric' ? `<rect x="52" y="28" width="16" height="9" rx="2" fill="#e8590c"/>`
              : cat === 'City' ? `<rect x="14" y="26" width="14" height="10" rx="2" fill="none" stroke="${a.c}" stroke-width="2.5"/>` : '';
  const bars = cat === 'Road' ? `<path d="M80 22h8q4 0 4 5" fill="none" stroke="${a.c}" stroke-width="3" stroke-linecap="round"/>`
                              : `<path d="M80 22h10" stroke="${a.c}" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 120 80">
    <circle cx="28" cy="52" r="20" fill="none" stroke="#1c2b25" stroke-width="${w}"/>
    <circle cx="92" cy="52" r="20" fill="none" stroke="#1c2b25" stroke-width="${w}"/>
    <path d="M28 52L48 28h30L92 52M48 28L60 52h-32M60 52L78 28" fill="none" stroke="${a.c}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M44 24h10" stroke="#1c2b25" stroke-width="4" stroke-linecap="round"/>
    <path d="M78 28L80 22" stroke="${a.c}" stroke-width="3.5" stroke-linecap="round"/>
    ${bars}${extra}</svg>`;
}

// ---------- API (relative URLs so it also works from a sub-path) ----------
async function api(path, body) {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  let data;
  try { data = await res.json(); } catch { throw new Error('The server did not return JSON.'); }
  return { ok: res.ok, data };
}

function setMode(preview) {
  state.preview = preview;
  $('banner').hidden = !preview;
  $('reset').hidden = preview;
  if (preview) setPill('Preview mode', 'warn');
}

function setPill(text, kind) {
  const pill = $('pill');
  pill.textContent = text;
  pill.className = 'pill ' + (kind || '');
}

// GET /api/status -> server.js asks the COBOL program to answer "STATUS".
async function refreshStatus() {
  try {
    const { ok, data } = await api('api/status');
    if (ok && data.cobolConnected) { setPill('COBOL connected', 'good'); $('status').hidden = true; return; }
    setPill('COBOL not connected', 'bad');
    $('status').hidden = false;
    $('status').textContent = (data.error || 'The COBOL program is not available.') + ' ' + (data.help || '');
  } catch {
    setPill('API unreachable', 'bad');
  }
}

// GET /api/products -> catalogue + live stock from server.js.
async function loadProducts() {
  try {
    const { ok, data } = await api('api/products');
    if (!ok || !data.products) throw new Error('No API');
    state.products = data.products;
    setMode(false);
    refreshStatus();
  } catch {
    state.products = PREVIEW_ROWS.map(([id, name, category, priceCents, stock]) => ({ id, name, category, priceCents, stock }));
    setMode(true);
  }
  restoreBasket();
  renderChips();
  renderGrid();
  renderCart();
  if (!state.preview && state.cart.size) requestQuote();
}

// POST /api/quote -> COBOL prices the basket; nothing is changed.
let quoteSeq = 0;
async function requestQuote() {
  if (state.preview || state.cart.size === 0) {
    state.quote = null; state.error = null; renderCart(); return;
  }
  const seq = ++quoteSeq;
  const items = [...state.cart].map(([id, quantity]) => ({ id, quantity }));
  let result;
  try { result = await api('api/quote', { items, promo: state.promo }); }
  catch (e) { result = { ok: false, data: { error: 'Cannot reach the server.' } }; }
  if (seq !== quoteSeq) return; // a newer request superseded this one
  if (result.ok) { state.quote = result.data; state.error = null; }
  else { state.quote = null; state.error = result.data.error; }
  renderCart();
}

// POST /api/checkout -> COBOL validates and prices; Node then deducts stock.
async function checkout() {
  const btn = $('checkout');
  btn.disabled = true; btn.textContent = 'Processing…';
  const items = [...state.cart].map(([id, quantity]) => ({ id, quantity }));
  let result;
  try { result = await api('api/checkout', { items, promo: state.promo }); }
  catch (e) { result = { ok: false, data: { error: 'Cannot reach the server.' } }; }
  btn.textContent = 'Place order';
  if (!result.ok) {
    state.error = result.data.error; state.quote = null;
    if (result.data.code === 'E06') await refreshProducts(); // stock changed under us
    renderCart();
    return;
  }
  showReceipt(result.data);
  state.products = result.data.products;
  state.cart.clear(); state.promo = ''; $('promo').value = '';
  state.quote = null; state.error = null;
  saveBasket();
  renderGrid(); renderCart();
}

async function refreshProducts() {
  const { ok, data } = await api('api/products');
  if (ok) { state.products = data.products; renderGrid(); }
}

// POST /api/reset -> server.js restores the starting stock.
async function resetStock() {
  const { ok, data } = await api('api/reset', {});
  if (!ok) return;
  state.products = data.products;
  renderGrid();
  toast('Stock restored to starting levels');
  requestQuote();
}

// ---------- rendering -------------------------------------------------------
function renderChips() {
  const cats = ['All', ...new Set(state.products.map(p => p.category))];
  $('chips').replaceChildren(...cats.map(c =>
    h('button', { class: 'chip' + (c === state.category ? ' active' : ''), role: 'tab',
      onclick: () => { state.category = c; renderChips(); renderGrid(); } }, c)));
}

function renderGrid() {
  const q = state.search.trim().toLowerCase();
  const list = state.products.filter(p =>
    (state.category === 'All' || p.category === state.category) &&
    (!q || p.name.toLowerCase().includes(q)));
  if (SORTS[state.sort]) list.sort(SORTS[state.sort]);
  if (!list.length) {
    $('grid').replaceChildren(h('p', { class: 'empty' }, 'No products match your search.'));
    return;
  }
  $('grid').replaceChildren(...list.map(productCard));
}

function productCard(p) {
  const out = p.stock === 0;
  const low = p.stock > 0 && p.stock <= 3;
  const maxQty = Math.max(1, Math.min(p.stock, 50));
  const input = h('input', { type: 'number', min: 1, max: maxQty, value: state.pending.get(p.id) || 1,
    'aria-label': 'Quantity for ' + p.name, disabled: out });
  const clamp = v => Math.max(1, Math.min(maxQty, Math.floor(Number(v)) || 1));
  const set = v => { input.value = clamp(v); state.pending.set(p.id, Number(input.value)); };
  input.addEventListener('change', () => set(input.value));

  const art = h('div', { class: 'art', style: `background:${(ART[p.category] || { bg: '#ece6d6' }).bg}` });
  art.innerHTML = bikeSvg(p.category);

  return h('article', { class: 'card' },
    art,
    h('div', { class: 'info' },
      h('span', { class: 'tag' }, p.category),
      h('h3', {}, p.name),
      h('div', { class: 'price' }, peso(p.priceCents)),
      h('div', { class: 'stock' + (out ? ' out' : low ? ' low' : '') },
        out ? 'Sold out' : low ? `Only ${p.stock} left` : `${p.stock} in stock`),
      h('div', { class: 'buy' },
        h('div', { class: 'qty' },
          h('button', { type: 'button', 'aria-label': 'Decrease', disabled: out, onclick: () => set(Number(input.value) - 1) }, '−'),
          input,
          h('button', { type: 'button', 'aria-label': 'Increase', disabled: out, onclick: () => set(Number(input.value) + 1) }, '+')),
        h('button', { class: 'btn', disabled: out, onclick: () => addToCart(p, clamp(input.value)) }, 'Add'))));
}

function addToCart(p, qty) {
  state.cart.set(p.id, (state.cart.get(p.id) || 0) + qty);
  toast(`Added ${qty} × ${p.name}`);
  saveBasket();
  requestQuote(); renderCart();
}

function setCartQty(id, qty) {
  if (!Number.isFinite(qty) || qty < 1) state.cart.delete(id);
  else state.cart.set(id, Math.floor(qty));
  saveBasket();
  requestQuote(); renderCart();
}

function renderCart() {
  const lines = $('cartLines');
  const find = id => state.products.find(p => p.id === id) || { name: id, priceCents: 0 };
  const cobolLine = id => state.quote && state.quote.items.find(l => l.id === id);

  const count = [...state.cart.values()].reduce((a, b) => a + b, 0);
  $('cartCount').textContent = count;
  $('cartCount').hidden = count === 0;

  $('promoRow').hidden = state.cart.size === 0 || state.preview;
  $('cartError').hidden = !state.error;
  $('cartError').textContent = state.error || '';
  $('checkout').disabled = !(state.quote && !state.error) || state.preview;

  if (state.cart.size === 0) {
    lines.replaceChildren(h('p', { class: 'empty' }, 'Your cart is empty. Add something shiny.'));
    $('summary').hidden = true;
    return;
  }

  lines.replaceChildren(...[...state.cart].map(([id, qty]) => {
    const cl = cobolLine(id);
    const input = h('input', { type: 'number', min: 1, value: qty, 'aria-label': 'Quantity for ' + find(id).name });
    input.addEventListener('change', () => setCartQty(id, Number(input.value)));
    return h('div', { class: 'line' },
      h('div', {},
        h('div', { class: 'name' }, find(id).name),
        h('div', { class: 'sub' }, peso(find(id).priceCents) + ' each')),
      h('div', {},
        h('div', { class: 'tot' }, cl ? peso(cl.lineTotalCents) : (state.preview ? '' : '…')),
        cl && cl.discountCents > 0 ? h('div', { class: 'disc' }, 'bulk saving −' + peso(cl.discountCents)) : ''),
      h('div', { class: 'ctrl' },
        h('div', { class: 'qty' },
          h('button', { type: 'button', 'aria-label': 'Decrease', onclick: () => setCartQty(id, qty - 1) }, '−'),
          input,
          h('button', { type: 'button', 'aria-label': 'Increase', onclick: () => setCartQty(id, qty + 1) }, '+'))),
      h('div', {}, h('button', { class: 'remove', onclick: () => setCartQty(id, 0) }, 'Remove')));
  }));

  const s = state.quote && state.quote.summary;
  $('summary').hidden = !s;
  if (s) {
    const rows = [['Subtotal', peso(s.subtotalCents)]];
    if (s.promoDiscountCents > 0) rows.push([`Promo (${state.promo.toUpperCase()})`, '−' + peso(s.promoDiscountCents)]);
    rows.push(['VAT (12%)', peso(s.vatCents)]);
    rows.push(['Shipping', s.shippingCents === 0 ? h('span', { class: 'free' }, 'FREE') : peso(s.shippingCents)]);
    $('summary').replaceChildren(
      ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
      h('dt', { class: 'grand' }, 'Total'), h('dd', { class: 'grand' }, peso(state.quote.totalCents)));
  }
}

function showReceipt(data) {
  const s = data.summary;
  const rows = data.items.map(l =>
    h('tr', {}, h('td', {}, `${l.quantity} × ${l.name}`), h('td', {}, peso(l.lineTotalCents))));
  const extra = [['Subtotal', peso(s.subtotalCents)]];
  if (s.promoDiscountCents > 0) extra.push(['Promo discount', '−' + peso(s.promoDiscountCents)]);
  extra.push(['VAT (12%)', peso(s.vatCents)], ['Shipping', s.shippingCents === 0 ? 'FREE' : peso(s.shippingCents)]);
  $('receiptBody').replaceChildren(
    h('h2', {}, 'Thanks for riding with us!'),
    h('div', { class: 'oid' }, 'Order ' + data.orderId),
    h('table', {},
      ...rows,
      ...extra.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v))),
      h('tr', { class: 'total' }, h('td', {}, 'Total paid'), h('td', {}, peso(data.totalCents)))));
  $('receipt').showModal();
}

// ---------- wiring --------------------------------------------------------
$('search').addEventListener('input', e => { state.search = e.target.value; renderGrid(); });
$('sort').addEventListener('change', e => { state.sort = e.target.value; renderGrid(); });

let promoTimer;
function setPromo(code) {
  state.promo = code.trim();
  saveBasket();
  clearTimeout(promoTimer);
  promoTimer = setTimeout(requestQuote, 350);
}
$('promo').addEventListener('input', e => setPromo(e.target.value));
document.querySelectorAll('.hint').forEach(b => b.addEventListener('click', () => {
  $('promo').value = b.dataset.code;
  setPromo(b.dataset.code);
}));

$('checkout').addEventListener('click', checkout);
$('reset').addEventListener('click', resetStock);

loadProducts();
