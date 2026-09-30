// Game panels: trading terminal, diner menu, grocery, fridge, cooking, sleep, settings, pause, summary.
import { G } from '../core/G.js';
import { fmtMoney, fmtClock, clamp } from '../core/util.js';
import { CATS, GROCERY, BURGER, RECIPES, UPGRADES } from '../systems/data.js';

const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
const pct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;

// =====================================================================================================
// TRADING TERMINAL
// =====================================================================================================
export function openMarket(game) {
  const ui = G.ui, mk = game.market, S = game.state;
  let sel = mk.tickers[0].sym, tab = 'market', qty = 1, timer = null;
  const html = () => {
    const open = mk.isOpen(G.time.hour);
    const tk = mk.T(sel), pos = mk.pos[sel];
    return `
    <div class="head">
      <b>MERIDIAN MARKETS</b>
      <span class="chip ${open ? 'open' : 'closed'}">${open ? 'MARKET OPEN' : 'MARKET CLOSED · opens 9:30 AM'}</span>
      <span class="chip">${fmtClock(G.time.hour)}</span>
      <div class="grow"></div>
      <div class="tabs" style="margin:0">
        <button class="tab ${tab === 'market' ? 'on' : ''}" data-tab="market">Markets</button>
        <button class="tab ${tab === 'port' ? 'on' : ''}" data-tab="port">Portfolio</button>
        <button class="tab ${tab === 'shop' ? 'on' : ''}" data-tab="shop">Home shop</button>
      </div>
      <button class="btn small" data-x="close">Close <kbd>Esc</kbd></button>
    </div>
    ${tab === 'market' ? `
    <div class="body">
      <div class="col">
        <h3 style="margin-top:0">Watchlist</h3>
        <table><tr><th>Symbol</th><th>Last</th><th>Day</th></tr>
        ${mk.tickers.map((t) => `<tr class="hoverable ${t.sym === sel ? 'sel' : ''}" data-sym="${t.sym}"><td><b>${t.sym}</b><br><span style="color:var(--dim);font-size:11px">${t.name}</span></td><td>${t.price.toFixed(2)}</td><td class="${t.chg >= 0 ? 'up' : 'down'}">${pct(t.chg)}</td></tr>`).join('')}
        </table>
      </div>
      <div class="col">
        <div class="row" style="margin-bottom:8px"><div><div class="big" style="font-size:30px">${tk.sym} <span style="font-size:22px">${tk.price.toFixed(2)}</span></div><div style="color:var(--dim);font-size:13px">${tk.name} · ${tk.sector}</div></div>
          <div class="grow"></div><div style="text-align:right"><div class="${tk.chg >= 0 ? 'up' : 'down'}" style="font-size:20px;font-weight:700">${pct(tk.chg)}</div><div style="color:var(--dim);font-size:12px">since the open</div></div></div>
        <canvas id="chart" width="1000" height="270"></canvas>
        <h3 style="margin-top:12px">News wire</h3>
        <div style="font-size:13px;line-height:1.55;color:#c9d6e2;max-height:84px;overflow:hidden">${mk.headlines.slice(-4).reverse().map((h, i) => `<div style="opacity:${1 - i * 0.2}">• ${h}</div>`).join('')}</div>
      </div>
      <div class="col">
        <h3 style="margin-top:0">Order ticket</h3>
        <div class="card" style="margin-bottom:10px"><div style="color:var(--dim);font-size:12px">Buying power</div><div class="price" style="font-size:20px">${fmtMoney(S.cash)}</div>
        <div style="color:var(--dim);font-size:12px;margin-top:6px">Position: <b style="color:#fff">${pos ? pos.shares : 0}</b> sh ${pos && pos.shares ? `@ ${pos.avg.toFixed(2)}` : ''}</div></div>
        <input type="number" id="qty" min="1" value="${qty}" style="width:100%;margin-bottom:8px">
        <div class="row" style="gap:6px;margin-bottom:10px"><button class="btn small grow" data-q="1">1</button><button class="btn small grow" data-q="5">5</button><button class="btn small grow" data-q="25">25</button><button class="btn small grow" data-q="max">Max</button></div>
        <div style="font-size:12.5px;color:var(--dim);margin-bottom:10px">Est. total <b style="color:#fff" id="est">${fmtMoney(tk.price * qty * 1.0008)}</b></div>
        <div class="row"><button class="btn buy grow" data-o="buy" ${open ? '' : 'disabled'}>Buy</button><button class="btn sell grow" data-o="sell" ${open && pos && pos.shares ? '' : 'disabled'}>Sell</button></div>
        <div style="font-size:12px;color:var(--dim);margin-top:10px;line-height:1.5">${open ? 'Market orders fill instantly at the current price plus a tiny spread.' : 'Orders only fill while the market is open (9:30 AM – 4:00 PM).'}</div>
      </div>
    </div>` : ''}
    ${tab === 'port' ? `<div class="body" style="grid-template-columns:1fr"><div class="col" style="border:0">
      <div class="summary" style="grid-template-columns:repeat(4,1fr)">
        <div class="card">Cash<b>${fmtMoney(S.cash)}</b></div><div class="card">Invested<b>${fmtMoney(mk.equity() - mk.cash)}</b></div>
        <div class="card">Net worth<b>${fmtMoney(S.cash + mk.equity() - mk.cash)}</b></div><div class="card">Since start<b class="${S.cash + mk.equity() - S.startWorth >= 0 ? 'up' : 'down'}">${fmtMoney(S.cash + mk.equity() - mk.cash - S.startWorth)}</b></div></div>
      <h3>Positions</h3>
      ${mk.holdings().length ? `<table><tr><th>Symbol</th><th>Shares</th><th>Avg cost</th><th>Last</th><th>Value</th><th>P/L</th><th></th></tr>${mk.holdings().map((h) => `<tr><td><b>${h.sym}</b></td><td>${h.shares}</td><td>${h.avg.toFixed(2)}</td><td>${h.price.toFixed(2)}</td><td>${fmtMoney(h.value)}</td><td class="${h.pl >= 0 ? 'up' : 'down'}">${fmtMoney(h.pl)}</td><td><button class="btn small sell" data-sellall="${h.sym}">Sell all</button></td></tr>`).join('')}</table>` : '<div class="sub">No positions yet. Pick a stock on the Markets tab and place a small order.</div>'}
      <h3>Recent trades</h3>
      ${mk.trades.length ? `<table><tr><th>Side</th><th>Symbol</th><th>Shares</th><th>Price</th></tr>${mk.trades.slice(-8).reverse().map((t) => `<tr><td class="${t.side === 'buy' ? 'up' : 'down'}">${t.side.toUpperCase()}</td><td>${t.sym}</td><td>${t.n}</td><td>${t.px.toFixed(2)}</td></tr>`).join('')}</table>` : '<div class="sub">Nothing yet.</div>'}
    </div></div>` : ''}
    ${tab === 'shop' ? `<div class="body" style="grid-template-columns:1fr"><div class="col" style="border:0">
      <h3 style="margin-top:0">Make the apartment yours</h3><div class="sub">Purchases show up in the apartment right away.</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
      ${UPGRADES.map((u) => { const own = S.upgrades[u.id]; return `<div class="card"><div class="row"><h4 class="grow">${u.name}</h4><span class="price">${fmtMoney(u.price, 0)}</span></div><p>${u.desc}</p><div style="margin-top:10px"><button class="btn ${own ? '' : 'pri'} small" data-up="${u.id}" ${own || S.cash < u.price ? 'disabled' : ''}>${own ? 'Owned ✓' : S.cash < u.price ? 'Not enough cash' : 'Buy'}</button></div></div>`; }).join('')}
      </div></div></div>` : ''}
    <div class="ticker"><span>${mk.headlines.slice(-8).join('   ·   ')}</span></div>`;
  };
  const draw = () => {
    const cv = ui.panel?.querySelector('#chart'); if (!cv) return;
    const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    const tk = mk.T(sel);
    const cand = tk.hist.slice(-70).concat(tk.cur ? [{ o: tk.cur.o, h: tk.cur.h, l: tk.cur.l, c: tk.cur.c }] : []);
    ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, w, h);
    let lo = 1e9, hi = -1e9; for (const c of cand) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
    const pos = mk.pos[sel]; if (pos && pos.shares) { lo = Math.min(lo, pos.avg); hi = Math.max(hi, pos.avg); }
    const pad = (hi - lo) * 0.08 + 0.01; lo -= pad; hi += pad;
    const px = 12, py = 14, pw = w - 84, ph = h - 32;
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.fillStyle = '#66788a'; ctx.font = '12px ui-monospace,Consolas,monospace';
    for (let i = 0; i <= 5; i++) { const y = py + (ph * i) / 5; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke(); ctx.fillText((hi - ((hi - lo) * i) / 5).toFixed(2), px + pw + 8, y + 4); }
    const cw = pw / Math.max(cand.length, 1), Y = (v) => py + ph - ((v - lo) / (hi - lo)) * ph;
    cand.forEach((c, i) => { const x = px + i * cw + cw / 2, up = c.c >= c.o; ctx.strokeStyle = ctx.fillStyle = up ? '#37d67a' : '#ff5c72'; ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke(); ctx.fillRect(x - cw * 0.34, Math.min(Y(c.o), Y(c.c)), cw * 0.68, Math.max(1.5, Math.abs(Y(c.o) - Y(c.c)))); });
    if (pos && pos.shares) { ctx.setLineDash([6, 5]); ctx.strokeStyle = '#ffb454'; ctx.beginPath(); ctx.moveTo(px, Y(pos.avg)); ctx.lineTo(px + pw, Y(pos.avg)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#ffb454'; ctx.fillText('cost ' + pos.avg.toFixed(2), px + 6, Y(pos.avg) - 5); }
    const last = tk.price; ctx.fillStyle = '#4fd1c5'; ctx.fillRect(px + pw, Y(last) - 9, 66, 18); ctx.fillStyle = '#04201d'; ctx.font = 'bold 12px ui-monospace,Consolas,monospace'; ctx.fillText(last.toFixed(2), px + pw + 6, Y(last) + 4);
  };
  const bind = (p) => {
    p.querySelector('[data-x=close]')?.addEventListener('click', () => ui.close());
    $$(p, '[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
    $$(p, '[data-sym]').forEach((r) => r.addEventListener('click', () => { sel = r.dataset.sym; render(); }));
    const q = p.querySelector('#qty');
    if (q) {
      q.addEventListener('input', () => { qty = Math.max(1, Math.floor(+q.value || 1)); p.querySelector('#est').textContent = fmtMoney(mk.T(sel).price * qty * 1.0008); });
      $$(p, '[data-q]').forEach((b) => b.addEventListener('click', () => { qty = b.dataset.q === 'max' ? Math.max(1, Math.floor(S.cash / (mk.T(sel).price * 1.0008))) : +b.dataset.q; render(); }));
      $$(p, '[data-o]').forEach((b) => b.addEventListener('click', () => { game.trade(sel, qty, b.dataset.o); render(); }));
    }
    $$(p, '[data-sellall]').forEach((b) => b.addEventListener('click', () => { const s = b.dataset.sellall; game.trade(s, mk.pos[s].shares, 'sell'); render(); }));
    $$(p, '[data-up]').forEach((b) => b.addEventListener('click', () => { game.buyUpgrade(b.dataset.up); render(); }));
  };
  const render = () => { const p = ui.panel; p.innerHTML = html(); bind(p); draw(); };
  ui.open(html(), { cls: 'term', onClose: () => { clearInterval(timer); game.onTerminalClosed?.(); }, onMount: (p) => { bind(p); draw(); } });
  timer = setInterval(() => { if (!ui.modalOpen) return clearInterval(timer); draw(); if (tab === 'market') { const rows = $$(ui.panel, '[data-sym]'); rows.forEach((r) => { const t = mk.T(r.dataset.sym); r.children[1].textContent = t.price.toFixed(2); r.children[2].textContent = pct(t.chg); r.children[2].className = t.chg >= 0 ? 'up' : 'down'; }); } }, 500);
  game.audio?.type?.();
}

// =====================================================================================================
// BURGER
// =====================================================================================================
export function openBurger(game) {
  const ui = G.ui, S = game.state;
  const cart = {};
  const total = () => BURGER.reduce((s, b) => s + (cart[b.id] || 0) * b.price, 0);
  const html = () => `
    <h2>Big Stack Burgers</h2><div class="sub">Order at the counter. You have <b class="price">${fmtMoney(S.cash)}</b>.</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(270px,1fr));max-height:52vh;overflow:auto;padding-right:6px">
      ${BURGER.map((b) => `<div class="card"><div class="row"><h4 class="grow">${b.name}</h4><span class="price">${fmtMoney(b.price)}</span></div><p>${b.desc}</p>
        <div class="row" style="margin-top:8px"><span style="font-size:12px;color:var(--dim)">+${b.hunger} food${b.energy ? ` · +${b.energy} energy` : ''}</span><div class="grow"></div>
        <span class="qty"><button data-m="${b.id}">−</button><span>${cart[b.id] || 0}</span><button data-p="${b.id}">+</button></span></div></div>`).join('')}
    </div>
    <div class="row" style="margin-top:16px"><div class="grow"><b style="font-size:18px">Total ${fmtMoney(total())}</b></div>
      <button class="btn" data-x="close">Never mind</button>
      <button class="btn" data-go="take" ${total() && total() <= S.cash ? '' : 'disabled'}>Take away</button>
      <button class="btn pri" data-go="here" ${total() && total() <= S.cash ? '' : 'disabled'}>Eat here</button></div>`;
  const bind = (p) => {
    p.querySelector('[data-x=close]').addEventListener('click', () => ui.close());
    $$(p, '[data-p]').forEach((b) => b.addEventListener('click', () => { cart[b.dataset.p] = (cart[b.dataset.p] || 0) + 1; render(); }));
    $$(p, '[data-m]').forEach((b) => b.addEventListener('click', () => { cart[b.dataset.m] = Math.max(0, (cart[b.dataset.m] || 0) - 1); render(); }));
    $$(p, '[data-go]').forEach((b) => b.addEventListener('click', () => { const t = total(); if (t > S.cash) return; const items = BURGER.filter((x) => cart[x.id]).map((x) => ({ ...x, n: cart[x.id] })); ui.close(false); game.orderBurger(items, t, b.dataset.go); }));
  };
  const render = () => { ui.panel.innerHTML = html(); bind(ui.panel); };
  ui.open(html(), { cls: '', onMount: bind });
}

// =====================================================================================================
// GROCERY
// =====================================================================================================
export function openGrocery(game, cat) {
  const ui = G.ui, S = game.state;
  let cur = cat || 'produce';
  const basketTotal = () => Object.entries(S.basket).reduce((s, [id, n]) => s + n * GROCERY.find((g) => g.id === id).price, 0);
  const html = () => `
    <h2>FreshMart</h2><div class="sub">${CATS[cur].blurb} You have <b class="price">${fmtMoney(S.cash)}</b>.</div>
    <div class="tabs">${Object.entries(CATS).map(([k, v]) => `<button class="tab ${k === cur ? 'on' : ''}" data-cat="${k}">${v.name}</button>`).join('')}</div>
    <div class="row" style="align-items:flex-start;gap:20px">
      <div class="grid grow" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">
        ${GROCERY.filter((g) => g.cat === cur).map((g) => `<div class="card"><h4>${g.name}</h4><p>${g.eat ? `Ready to eat · +${g.eat[0]} food${g.eat[1] ? ` +${g.eat[1]} energy` : ''}` : 'Cooking ingredient'}</p>
          <div class="row" style="margin-top:8px"><span class="price">${fmtMoney(g.price)}</span><div class="grow"></div><span class="qty"><button data-m="${g.id}">−</button><span>${S.basket[g.id] || 0}</span><button data-p="${g.id}">+</button></span></div></div>`).join('')}
      </div>
      <div style="width:250px;flex:none"><div class="card"><h4>Your basket</h4>
        ${Object.keys(S.basket).length ? Object.entries(S.basket).map(([id, n]) => `<div class="row" style="font-size:13px;margin-top:5px"><span class="grow">${n}× ${GROCERY.find((g) => g.id === id).name}</span><span>${fmtMoney(n * GROCERY.find((g) => g.id === id).price)}</span></div>`).join('') : '<p style="margin-top:6px">Empty</p>'}
        <div class="row" style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><b class="grow">Total</b><b class="price">${fmtMoney(basketTotal())}</b></div>
        <p style="margin-top:8px">Pay at the register near the entrance (<kbd>E</kbd>) to take it home.</p></div></div>
    </div>
    <div class="row" style="margin-top:16px"><div class="grow"></div><button class="btn pri" data-x="close">Done</button></div>`;
  const bind = (p) => {
    p.querySelector('[data-x=close]').addEventListener('click', () => ui.close());
    $$(p, '[data-cat]').forEach((b) => b.addEventListener('click', () => { cur = b.dataset.cat; render(); }));
    $$(p, '[data-p]').forEach((b) => b.addEventListener('click', () => { S.basket[b.dataset.p] = (S.basket[b.dataset.p] || 0) + 1; game.audio?.click?.(); render(); }));
    $$(p, '[data-m]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.m; S.basket[id] = (S.basket[id] || 0) - 1; if (S.basket[id] <= 0) delete S.basket[id]; game.audio?.click?.(); render(); }));
  };
  const render = () => { ui.panel.innerHTML = html(); bind(ui.panel); };
  ui.open(html(), { cls: '', onMount: bind, onClose: () => game.refreshBasketVisual?.() });
}

export function openCheckout(game) {
  const ui = G.ui, S = game.state;
  const total = Object.entries(S.basket).reduce((s, [id, n]) => s + n * GROCERY.find((g) => g.id === id).price, 0);
  const count = Object.values(S.basket).reduce((a, b) => a + b, 0);
  if (!count) { ui.toast('Your basket is empty. Browse the aisles first.'); return; }
  ui.open(`<h2>Checkout</h2><div class="sub">Lane 2 · "Paper or plastic? …paper, obviously."</div>
    <div class="card">${Object.entries(S.basket).map(([id, n]) => `<div class="row" style="font-size:14px;margin:3px 0"><span class="grow">${n}× ${GROCERY.find((g) => g.id === id).name}</span><span>${fmtMoney(n * GROCERY.find((g) => g.id === id).price)}</span></div>`).join('')}
    <div class="row" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px"><b class="grow">Total</b><b class="price" style="font-size:20px">${fmtMoney(total)}</b></div></div>
    <div class="row" style="margin-top:16px"><div class="grow"></div><button class="btn" data-x="close">Not yet</button><button class="btn pri" data-pay ${total <= S.cash ? '' : 'disabled'}>${total <= S.cash ? 'Pay' : 'Not enough cash'}</button></div>`,
    { onMount: (p) => { p.querySelector('[data-x=close]').addEventListener('click', () => ui.close()); p.querySelector('[data-pay]').addEventListener('click', () => { ui.close(false); game.payGroceries(total); }); } });
}

// =====================================================================================================
// FRIDGE + COOKING
// =====================================================================================================
export function openFridge(game) {
  const ui = G.ui, S = game.state;
  const carrying = S.bags && Object.keys(S.bags).length;
  const html = () => `
    <h2>Fridge & pantry</h2><div class="sub">${carrying ? 'You\'re carrying grocery bags.' : 'Everything you\'ve stored at home.'}</div>
    ${carrying ? `<div class="card" style="margin-bottom:12px"><div class="row"><div class="grow"><h4>Groceries in your arms</h4><p>${Object.entries(S.bags).map(([id, n]) => `${n}× ${GROCERY.find((g) => g.id === id).name}`).join(', ')}</p></div><button class="btn pri" data-store>Put everything away</button></div></div>` : ''}
    <h3>Stored</h3>
    ${Object.keys(S.pantry).length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${Object.entries(S.pantry).map(([id, n]) => { const g = GROCERY.find((x) => x.id === id); return `<div class="card"><div class="row"><h4 class="grow">${g.name}</h4><b>×${n}</b></div><p>${g.eat ? `Eat now: +${g.eat[0]} food${g.eat[1] ? `, +${g.eat[1]} energy` : ''}` : 'Cooking ingredient'}</p>${g.eat ? `<div style="margin-top:8px"><button class="btn small" data-eat="${id}">Eat one</button></div>` : ''}</div>`; }).join('')}</div>` : '<div class="sub">The fridge is looking a little lonely. Time to go shopping.</div>'}
    ${S.meals.length ? `<h3>Leftover takeout</h3><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${S.meals.map((m, i) => `<div class="card"><h4>${m.name}</h4><p>+${Math.round(m.hunger * 0.9)} food · reheated</p><div style="margin-top:8px"><button class="btn small" data-meal="${i}">Eat</button></div></div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:16px"><div class="grow"></div><button class="btn pri" data-x="close">Close</button></div>`;
  const bind = (p) => {
    p.querySelector('[data-x=close]').addEventListener('click', () => ui.close());
    p.querySelector('[data-store]')?.addEventListener('click', () => { game.storeGroceries(); render(); });
    $$(p, '[data-eat]').forEach((b) => b.addEventListener('click', () => { game.eatPantry(b.dataset.eat); render(); }));
    $$(p, '[data-meal]').forEach((b) => b.addEventListener('click', () => { ui.close(false); game.eatMeal(+b.dataset.meal); }));
  };
  const render = () => { ui.panel.innerHTML = html(); bind(ui.panel); };
  ui.open(html(), { onMount: bind });
  game.audio?.click?.();
}

export function openCook(game) {
  const ui = G.ui, S = game.state;
  const html = () => `
    <h2>Cook something</h2><div class="sub">Pick a recipe. Cooking takes a little while, and dinner tastes better than takeout.</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr));max-height:56vh;overflow:auto;padding-right:6px">
    ${RECIPES.map((r) => { const ok = Object.entries(r.needs).every(([id, n]) => (S.pantry[id] || 0) >= n); return `<div class="card" style="${ok ? '' : 'opacity:.7'}"><div class="row"><h4 class="grow">${r.name}</h4><span style="font-size:12px;color:var(--dim)">${r.minutes} min</span></div><p>${r.desc}</p>
      <div style="font-size:12.5px;margin:8px 0">${Object.entries(r.needs).map(([id, n]) => { const have = S.pantry[id] || 0; return `<span class="chip" style="${have >= n ? 'color:#8ff0b6' : 'color:#ff9aa9'}">${n}× ${GROCERY.find((g) => g.id === id).name.split(' ')[0]} (${have})</span>`; }).join(' ')}</div>
      <div class="row"><span style="font-size:12px;color:var(--dim)">+${r.hunger} food · +${r.energy} energy</span><div class="grow"></div><button class="btn pri small" data-cook="${r.id}" ${ok ? '' : 'disabled'}>Cook</button></div></div>`; }).join('')}
    </div>
    <div class="row" style="margin-top:16px"><div class="grow"></div><button class="btn" data-x="close">Close</button></div>`;
  ui.open(html(), { onMount: (p) => { p.querySelector('[data-x=close]').addEventListener('click', () => ui.close()); $$(p, '[data-cook]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.cook; ui.close(false); game.cook(id); })); } });
}

// =====================================================================================================
// SLEEP + SUMMARY
// =====================================================================================================
export function openSleep(game) {
  const ui = G.ui, S = game.state, h = G.time.hour;
  const tired = S.energy < 60;
  ui.open(`<h2>Bed</h2><div class="sub">${tired ? 'You could definitely use some rest.' : 'You\'re not especially tired, but a nap never hurts.'} It's ${fmtClock(h)}.</div>
    <div class="grid" style="gap:10px;min-width:min(420px,80vw)">
      <button class="btn pri" data-s="night">Sleep until morning (7:00 AM)</button>
      <button class="btn" data-s="1">Take a 1-hour nap</button>
      <button class="btn" data-s="3">Sleep for 3 hours</button>
      <button class="btn" data-x="close">Not now</button></div>`,
    { onMount: (p) => { p.querySelector('[data-x=close]').addEventListener('click', () => ui.close()); $$(p, '[data-s]').forEach((b) => b.addEventListener('click', () => { ui.close(false); game.sleep(b.dataset.s); })); } });
}

export function showSummary(game, info) {
  const ui = G.ui;
  ui.open(`<h2>Good morning</h2><div class="sub">Day ${info.day} · ${fmtClock(G.time.hour)} · ${info.weather}</div>
    <div class="summary"><div class="card">Consulting retainer<b class="up">+${fmtMoney(info.pay)}</b></div><div class="card">Portfolio overnight<b class="${info.pl >= 0 ? 'up' : 'down'}">${info.pl >= 0 ? '+' : ''}${fmtMoney(info.pl)}</b></div>
    <div class="card">Cash<b>${fmtMoney(info.cash)}</b></div><div class="card">Net worth<b>${fmtMoney(info.worth)}</b></div></div>
    <div class="sub">${info.note}</div>
    <div class="row"><div class="grow"></div><button class="btn pri" data-x="go">Start the day</button></div>`,
    { closable: false, onMount: (p) => p.querySelector('[data-x=go]').addEventListener('click', () => ui.close()) });
}

// =====================================================================================================
// SETTINGS + PAUSE
// =====================================================================================================
export function openSettings(game, fromTitle = false) {
  const ui = G.ui, st = game.settings;
  const opt = (k, v, l) => `<option value="${k}" ${st[v.key] === k ? 'selected' : ''}>${l}</option>`;
  ui.open(`
    <h2>Settings</h2><div class="sub">GPU: ${G.gpu?.renderer?.replace(/ANGLE \(|\)/g, '').slice(0, 64) || 'unknown'} · detected tier: <b>${G.gpu?.tier}</b>${G.gpu?.software ? ' (software renderer — no GPU found!)' : ''}</div>
    <h3>Graphics</h3>
    <div class="grid" style="grid-template-columns:200px 1fr;align-items:center;gap:10px 16px">
      <span>Quality preset</span><select id="s-q">${['auto', 'low', 'medium', 'high', 'ultra'].map((k) => `<option value="${k}" ${st.quality === k ? 'selected' : ''}>${k === 'auto' ? `Auto (${G.gpu?.tier})` : k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select>
      <span>Render resolution <b id="v-res">${Math.round(st.res * 100)}%</b></span><input type="range" id="s-res" min="50" max="100" value="${Math.round(st.res * 100)}">
      <span>Dynamic resolution</span><select id="s-dyn"><option value="1" ${st.dyn ? 'selected' : ''}>On (keeps 60 fps)</option><option value="0" ${!st.dyn ? 'selected' : ''}>Off</option></select>
      <span>Field of view <b id="v-fov">${st.fov}°</b></span><input type="range" id="s-fov" min="60" max="100" value="${st.fov}">
      <span>Show FPS overlay</span><select id="s-fps"><option value="0" ${!st.fps ? 'selected' : ''}>Off</option><option value="1" ${st.fps ? 'selected' : ''}>On</option></select>
    </div>
    <div class="sub" style="margin-top:8px">Changing the quality preset restarts the renderer (your game is saved first).</div>
    <h3>Controls & audio</h3>
    <div class="grid" style="grid-template-columns:200px 1fr;align-items:center;gap:10px 16px">
      <span>Mouse sensitivity <b id="v-sens">${st.sens.toFixed(1)}</b></span><input type="range" id="s-sens" min="3" max="25" value="${Math.round(st.sens * 10)}">
      <span>Master volume</span><input type="range" id="s-vm" min="0" max="100" value="${Math.round(st.vMaster * 100)}">
      <span>Music</span><input type="range" id="s-vmu" min="0" max="100" value="${Math.round(st.vMusic * 100)}">
      <span>Effects</span><input type="range" id="s-vs" min="0" max="100" value="${Math.round(st.vSfx * 100)}">
      <span>Ambience</span><input type="range" id="s-va" min="0" max="100" value="${Math.round(st.vAmb * 100)}">
    </div>
    <h3>World</h3>
    <div class="grid" style="grid-template-columns:200px 1fr;align-items:center;gap:10px 16px">
      <span>Time speed</span><select id="s-ts"><option value="1" ${st.timeSpeed === 1 ? 'selected' : ''}>Relaxed (1 game minute / second)</option><option value="2" ${st.timeSpeed === 2 ? 'selected' : ''}>Normal (2 min / second)</option><option value="4" ${st.timeSpeed === 4 ? 'selected' : ''}>Fast (4 min / second)</option></select>
      <span>Weather</span><select id="s-wx"><option value="auto">Automatic</option><option value="clear">Always clear</option><option value="rain">Rain</option><option value="storm">Thunderstorm</option></select>
      <span>Time of day <b id="v-tod">${fmtClock(G.time.hour)}</b></span><input type="range" id="s-tod" min="0" max="1439" value="${Math.round(G.time.hour * 60)}">
    </div>
    <div class="row" style="margin-top:20px"><div class="grow"></div><button class="btn pri" data-x="ok">Done</button></div>`,
    { onMount: (p) => {
      const $ = (s) => p.querySelector(s);
      $('#s-wx').value = game.weatherMode || 'auto';
      $('#s-q').addEventListener('change', (e) => { st.quality = e.target.value; game.saveSettings(); game.applyQualityRestart(); });
      $('#s-res').addEventListener('input', (e) => { st.res = e.target.value / 100; $('#v-res').textContent = e.target.value + '%'; game.applySettings(); });
      $('#s-dyn').addEventListener('change', (e) => { st.dyn = e.target.value === '1'; game.applySettings(); });
      $('#s-fov').addEventListener('input', (e) => { st.fov = +e.target.value; $('#v-fov').textContent = st.fov + '°'; game.applySettings(); });
      $('#s-fps').addEventListener('change', (e) => { st.fps = e.target.value === '1'; game.applySettings(); });
      $('#s-sens').addEventListener('input', (e) => { st.sens = e.target.value / 10; $('#v-sens').textContent = st.sens.toFixed(1); game.applySettings(); });
      for (const [id, k] of [['#s-vm', 'vMaster'], ['#s-vmu', 'vMusic'], ['#s-vs', 'vSfx'], ['#s-va', 'vAmb']]) $(id).addEventListener('input', (e) => { st[k] = e.target.value / 100; game.applySettings(); });
      $('#s-ts').addEventListener('change', (e) => { st.timeSpeed = +e.target.value; game.applySettings(); });
      $('#s-wx').addEventListener('change', (e) => { game.setWeatherMode(e.target.value); });
      $('#s-tod').addEventListener('input', (e) => { game.setTimeOfDay(e.target.value / 60); $('#v-tod').textContent = fmtClock(G.time.hour); });
      $('[data-x=ok]').addEventListener('click', () => { game.saveSettings(); ui.close(!fromTitle); });
    } });
}

export function showPause(game) {
  const ui = G.ui;
  ui.paused = true; game.paused = true;
  ui.open(`<h2>Paused</h2><div class="sub">Day ${game.state.day} · ${fmtClock(G.time.hour)}</div>
    <div class="grid" style="gap:10px;min-width:min(340px,80vw)">
      <button class="btn pri" data-a="resume">Resume</button>
      <button class="btn" data-a="settings">Settings</button>
      <button class="btn" data-a="controls">Controls</button>
      <button class="btn" data-a="save">Save game</button>
      <button class="btn" data-a="exit">Save & quit to title</button></div>`,
    { closable: true, onClose: () => { ui.paused = false; game.paused = false; },
      onMount: (p) => p.addEventListener('click', (e) => {
        const a = e.target.dataset?.a; if (!a) return;
        if (a === 'resume') ui.close(); else if (a === 'settings') { ui.paused = false; game.paused = false; ui.close(false); openSettings(game); ui.onClose = () => { ui.paused = false; game.paused = false; }; }
        else if (a === 'controls') { ui.close(false); ui.showControls(false); }
        else if (a === 'save') { game.save(true); }
        else if (a === 'exit') { game.save(true); location.reload(); }
      }) });
}
