// DOM user interface: HUD, prompts, toasts, goals, fade, loading/title screens, modal panels.
import { G } from '../core/G.js';
import { fmtClock, fmtMoney, clamp } from '../core/util.js';
import { GOALS } from '../systems/data.js';

const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };

export class UI {
  constructor(root) {
    this.root = root;
    this.modalOpen = false; this.started = false; this.paused = false;
    this.onClose = null; this.closable = true;
    root.innerHTML = `
      <div id="hud" class="hidden">
        <div id="cross"></div>
        <div id="prompt"><kbd>E</kbd><span></span></div>
        <div id="top"><div id="clock">7:00<small>AM</small></div><div id="dayline"></div><div id="loc"></div></div>
        <div id="goals"><h6>Getting settled</h6><div id="goalList"></div></div>
        <div id="money"><div class="cash"></div><div class="eq"></div></div>
        <div id="needs">
          <div class="bar" id="bHunger"><span>Hunger</span><i><b style="width:70%"></b></i></div>
          <div class="bar" id="bEnergy"><span>Energy</span><i><b style="width:85%"></b></i></div>
        </div>
        <div id="carry"></div>
        <div id="toasts"></div>
        <div id="perf"></div>
      </div>
      <div id="modal"></div>
      <div id="fade"><div class="msg"></div></div>
      <div id="title" class="gone"></div>
      <div id="loading"><h2>Floor 48</h2><div class="lbar"><b></b></div><p>Building the city...</p></div>`;
    this.el = {
      hud: root.querySelector('#hud'), cross: root.querySelector('#cross'), prompt: root.querySelector('#prompt'), promptTxt: root.querySelector('#prompt span'),
      clock: root.querySelector('#clock'), dayline: root.querySelector('#dayline'), loc: root.querySelector('#loc'),
      goals: root.querySelector('#goals'), goalList: root.querySelector('#goalList'), cash: root.querySelector('#money .cash'), eq: root.querySelector('#money .eq'),
      hunger: root.querySelector('#bHunger'), energy: root.querySelector('#bEnergy'), carry: root.querySelector('#carry'), toasts: root.querySelector('#toasts'),
      perf: root.querySelector('#perf'), modal: root.querySelector('#modal'), fade: root.querySelector('#fade'), fadeMsg: root.querySelector('#fade .msg'),
      title: root.querySelector('#title'), loading: root.querySelector('#loading'), lbar: root.querySelector('.lbar b'), lmsg: root.querySelector('#loading p'),
    };
    this.el.modal.addEventListener('mousedown', (e) => { if (e.target === this.el.modal && this.closable && this.onBackdrop) this.close(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.modalOpen && this.closable) { this.close(); e.preventDefault(); }
      if (e.code === 'Escape' && !this.modalOpen && this.started && !this.paused && G.player?.dragLook) this.showPause();
    });
    this.lastPrompt = null;
    this.goalsDone = {};
    this.renderGoals();
    G.ui = this;
  }

  // ---------- loading / title ----------
  setLoading(p, msg) { this.el.lbar.style.width = `${Math.round(p * 100)}%`; if (msg) this.el.lmsg.textContent = msg; }
  hideLoading() { this.el.loading.classList.add('gone'); setTimeout(() => (this.el.loading.style.display = 'none'), 900); }

  showTitle({ hasSave, onStart, onContinue, onSettings }) {
    const t = this.el.title; t.classList.remove('gone');
    t.innerHTML = `
      <h1>FLOOR <span>48</span></h1>
      <div class="tag">a quiet life above the city</div>
      <div class="menu">
        ${hasSave ? '<button class="btn pri" data-a="cont">Continue</button><button class="btn" data-a="new">New game</button>' : '<button class="btn pri" data-a="new">Start</button>'}
        <button class="btn" data-a="set">Settings</button>
        <button class="btn" data-a="keys">Controls</button>
      </div>
      <div class="foot">${G.gpu ? `${G.gpu.renderer.replace(/ANGLE \(|\)/g, '').slice(0, 70)} · ${G.q.name} preset` : ''}</div>`;
    t.onclick = (e) => {
      const a = e.target.dataset?.a; if (!a) return;
      if (a === 'new') onStart(); else if (a === 'cont') onContinue(); else if (a === 'set') onSettings(); else if (a === 'keys') this.showControls(true);
    };
  }
  hideTitle() { this.el.title.classList.add('gone'); this.el.hud.classList.remove('hidden'); }

  // ---------- HUD ----------
  setPrompt(text, hot) {
    if (text === this.lastPrompt && (!!hot) === this._hot) return;
    this.lastPrompt = text; this._hot = !!hot;
    if (text) { this.el.promptTxt.textContent = text; this.el.prompt.classList.add('on'); this.el.cross.classList.add('hot'); }
    else { this.el.prompt.classList.remove('on'); this.el.cross.classList.remove('hot'); }
  }
  toast(msg, ms = 3400) {
    const d = $(`<div class="toast">${msg}</div>`);
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.removeChild(this.el.toasts.firstChild);
    setTimeout(() => d.classList.add('out'), ms); setTimeout(() => d.remove(), ms + 600);
  }
  hud(s) {
    const e = this.el;
    const hh = Math.floor(s.hour) % 24, mm = Math.floor((s.hour - Math.floor(s.hour)) * 60);
    const clock = fmtClock(s.hour); const [time, ap] = [clock.slice(0, -3), clock.slice(-2)];
    e.clock.innerHTML = `${time}<small>${ap}</small>`;
    const wx = s.rain > 0.5 ? (s.storm > 0.5 ? 'Thunderstorm' : 'Rain') : s.rain > 0.1 ? 'Drizzle' : s.night > 0.6 ? 'Clear night' : s.cloud > 0.55 ? 'Cloudy' : 'Clear';
    e.dayline.textContent = `Day ${s.day} · ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(s.day - 1) % 7]} · ${wx}`;
    e.loc.textContent = s.zoneLabel;
    e.cash.textContent = fmtMoney(s.cash, 2);
    e.eq.textContent = `Portfolio ${fmtMoney(s.portfolio, 0)}${s.market ? '' : ''}`;
    const setBar = (el, v) => { el.querySelector('b').style.width = `${clamp(v, 0, 100)}%`; el.classList.toggle('low', v < 22); };
    setBar(e.hunger, s.hunger); setBar(e.energy, s.energy);
    if (s.carry) { e.carry.style.display = 'block'; e.carry.textContent = s.carry; } else e.carry.style.display = 'none';
  }
  renderGoals() {
    this.el.goalList.innerHTML = GOALS.map((g) => `<div class="${this.goalsDone[g.id] ? 'done' : ''}"><span class="dot"></span>${g.text}</div>`).join('');
    const all = GOALS.every((g) => this.goalsDone[g.id]);
    this.el.goals.classList.toggle('hide', all && this.goalsHide);
  }
  completeGoal(id) { if (this.goalsDone[id]) return; this.goalsDone[id] = true; this.renderGoals(); this.toast('✓ ' + GOALS.find((g) => g.id === id).text, 2600); if (GOALS.every((g) => this.goalsDone[g.id])) setTimeout(() => { this.goalsHide = true; this.renderGoals(); this.toast('You\'re all settled in. The city is yours.', 4500); }, 3500); }
  perf(text) { this.el.perf.style.display = text ? 'block' : 'none'; if (text) this.el.perf.textContent = text; }

  // ---------- fade ----------
  fade(msg = '', ms = 600) { this.el.fadeMsg.textContent = msg; this.el.fade.style.transition = `opacity ${ms / 1000}s`; this.el.fade.classList.add('on'); return new Promise((r) => setTimeout(r, ms)); }
  unfade(ms = 700) { this.el.fade.style.transition = `opacity ${ms / 1000}s`; this.el.fade.classList.remove('on'); return new Promise((r) => setTimeout(r, ms)); }

  // ---------- modal ----------
  open(html, { cls = '', closable = true, onClose = null, onMount = null, backdrop = true } = {}) {
    this.modalOpen = true; this.closable = closable; this.onClose = onClose; this.onBackdrop = backdrop;
    G.player?.releaseLock?.();
    const m = this.el.modal; m.innerHTML = `<div class="panel ${cls}">${html}</div>`; m.classList.add('on');
    this.panel = m.firstElementChild;
    if (onMount) onMount(this.panel);
    return this.panel;
  }
  close(relock = true) {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    this.el.modal.classList.remove('on'); this.el.modal.innerHTML = '';
    const cb = this.onClose; this.onClose = null;
    if (cb) cb();
    if (relock && this.started && !this.paused) G.player?.requestLock?.();
  }
  on(sel, ev, fn) { this.panel?.querySelectorAll(sel).forEach((n) => n.addEventListener(ev, fn)); }

  // ---------- generic panels ----------
  showControls(fromTitle = false) {
    this.open(`
      <h2>Controls</h2><div class="sub">Keyboard and mouse. A gamepad isn't supported yet.</div>
      <div class="keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Move</span>
        <span><kbd>Mouse</kbd></span><span>Look around (click the window to capture the mouse)</span>
        <span><kbd>Shift</kbd></span><span>Sprint</span>
        <span><kbd>C</kbd></span><span>Crouch</span>
        <span><kbd>E</kbd></span><span>Interact / use / sit / stand</span>
        <span><kbd>Esc</kbd></span><span>Pause menu, settings, save</span>
        <span><kbd>M</kbd></span><span>Mute audio</span>
        <span><kbd>F3</kbd></span><span>Performance overlay</span>
        <span><kbd>Tab</kbd></span><span>Show / hide the goals list</span>
        <span><kbd>F9</kbd></span><span>Photo mode (hide the HUD)</span>
      </div>
      <div class="row" style="margin-top:20px"><div class="grow"></div><button class="btn pri" data-x="ok">Got it</button></div>`,
      { onMount: (p) => p.querySelector('[data-x=ok]').addEventListener('click', () => { this.close(!fromTitle); }) });
  }
}
