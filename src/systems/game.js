// Game orchestrator: clock, needs, economy, save/load, all player actions.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { clamp, lerp, smooth, fmtMoney, fmtClock } from '../core/util.js';
import { GROCERY, BURGER, RECIPES, UPGRADES } from './data.js';
import { Market } from './market.js';
import { zoneAt } from './zones.js';
import * as P from '../ui/panels.js';
import { APT_Y } from '../world/consts.js';

const SAVE_KEY = 'floor48.save.v1', SET_KEY = 'floor48.settings';
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const defaultSettings = () => ({ quality: 'auto', res: 1, dyn: true, fov: 74, fps: false, sens: 1, vMaster: 0.85, vMusic: 0.55, vSfx: 0.9, vAmb: 0.85, timeSpeed: 2 });
export function loadSettings() { try { return { ...defaultSettings(), ...JSON.parse(localStorage.getItem(SET_KEY) || '{}') }; } catch (e) { return defaultSettings(); } }

const defaultState = () => ({
  v: 1, day: 1, cash: 1800, hunger: 72, energy: 88, pantry: {}, meals: [], basket: {}, bags: null, upgrades: {}, goals: {}, startWorth: 1800,
  slept: false, pay: 150, flags: {}, stats: { meals: 0, cooked: 0, trades: 0 },
});

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);          // ui, audio, player, world (apt, elevator, lobby, shops, street, traffic, people, weatherSys, upgrades), post, atmo
    this.settings = loadSettings();
    this.state = defaultState();
    this.market = new Market();
    G.market = this.market;
    this.paused = false; this.busy = false;
    this.acc = 0; this.hudAcc = 0; this.saveAcc = 0; this.viewTime = 0;
    this.weatherMode = 'auto';
    this.zone = { name: 'apartment', indoor: true };
    this.needsAlert = { hungry: false, tired: false };
    G.game = this;
    this.market.cash = 0;
  }

  // ------------------------------------------------------------------ persistence
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  save(verbose = false) {
    try {
      const S = this.state, P_ = this.player;
      const data = { state: S, market: this.market.serialize(), hour: G.time.hour, day: S.day, pos: { x: P_.pos.x, y: P_.pos.y, z: P_.pos.z, yaw: P_.yaw, level: P_.level }, lights: Object.fromEntries(Object.entries(this.world.apt.groups).map(([k, g]) => [k, g.on])), ts: Date.now() };
      data.goals = this.ui.goalsDone;
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (verbose) this.toast('Game saved.');
    } catch (e) { if (verbose) this.toast('Could not save (storage unavailable).'); }
  }
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d) return false;
      this.state = { ...defaultState(), ...d.state };
      this.market.restore(d.market);
      G.time.hour = d.hour; G.time.day = this.state.day;
      this.ui.goalsDone = d.goals || {}; this.ui.renderGoals();
      if (d.lights) for (const [k, v] of Object.entries(d.lights)) this.world.apt.groups[k]?.set(v);
      this.applyUpgrades();
      if (d.pos) { this.player.teleport(d.pos.x, d.pos.y, d.pos.z, d.pos.yaw, d.pos.level); }
      return true;
    } catch (e) { console.warn('load failed', e); return false; }
  }
  newGame() {
    this.state = defaultState();
    this.market = new Market(); G.market = this.market;
    G.time.hour = 6.75; G.time.day = 1;
    this.ui.goalsDone = {}; this.ui.renderGoals();
    // wake up in bed
    this.player.teleport(-46.2, APT_Y, 25.0, Math.PI / 2 + 0.2, 1);
    this.player.pitch = 0.05;
    this.applyUpgrades();
    this.world.apt.setAllLights(false);
    this.world.apt.curtainState.target = 0;
  }
  saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }
  applySettings() {
    const s = this.settings;
    this.player.sens = s.sens; this.player.fov = s.fov;
    const a = this.audio; a.setVolume('master', s.vMaster); a.vol.music = s.vMusic; a.setVolume('sfx', s.vSfx); a.setVolume('amb', s.vAmb);
    G.time.speed = s.timeSpeed;
    this.setRes?.(s.res, s.dyn);
    this.ui.perf(s.fps ? ' ' : '');
    this.saveSettings();
  }
  applyQualityRestart() { this.save(false); try { sessionStorage.setItem('floor48.continue', '1'); } catch (e) { /* ignore */ } location.reload(); }
  setWeatherMode(m) { this.weatherMode = m; this.world.weatherSys.force(m); }
  setTimeOfDay(h) { G.time.hour = h; }

  toast(msg, ms) { this.ui.toast(msg, ms); }

  // ------------------------------------------------------------------ clock & needs
  advanceTime(minutes, opts = {}) {
    let left = minutes;
    while (left > 0) {
      const step = Math.min(5, left); left -= step;
      G.time.hour += step / 60;
      if (G.time.hour >= 24) { G.time.hour -= 24; this.newDay(); }
      const S = this.state;
      const sleeping = !!opts.sleeping;
      S.hunger = clamp(S.hunger - (sleeping ? 2.2 : 6.2) * step / 60, 0, 100);
      S.energy = clamp(S.energy + (sleeping ? 11 : -(S.hunger < 8 ? 6.5 : 4.4)) * step / 60, 0, 100);
      this.market.advance(step, G.time.hour, S.day);
    }
  }
  newDay() {
    const S = this.state; S.day++; G.time.day = S.day; S.cash += S.pay; this._payToday = (this._payToday || 0) + S.pay; S.dayStartWorth = S.cash + this.market.equity();
  }

  update(dt) {
    const S = this.state;
    if (this.paused) return;
    // ---- time ----
    const mins = dt * G.time.speed;
    if (!this.busy) {
      this.advanceTime(mins);
    }
    G.time.day = S.day;
    // ---- zone ----
    const p = this.player.pos;
    this.zone = zoneAt(p.x, p.y, p.z, this.player.level, this.world.shops);
    G.indoor = this.zone.indoor && this.zone.name !== 'apartment' || (this.zone.name === 'apartment');
    // ---- passing out ----
    if (S.energy <= 0.5 && !this.busy && !this.ui.modalOpen) this.passOut();
    // ---- alerts ----
    if (S.hunger < 20 && !this.needsAlert.hungry) { this.needsAlert.hungry = true; this.toast('Your stomach is growling. Time to eat.'); this.audio.growl?.(); }
    if (S.hunger > 30) this.needsAlert.hungry = false;
    if (S.energy < 20 && !this.needsAlert.tired) { this.needsAlert.tired = true; this.toast('You\'re exhausted. A coffee or some sleep would help.'); this.audio.yawn?.(); }
    if (S.energy > 35) this.needsAlert.tired = false;
    // ---- screen feel ----
    const fx = this.post.fx;
    const hungry = 1 - smooth(6, 30, S.hunger), tired = 1 - smooth(6, 30, S.energy);
    const t = Math.min(1, dt * 2);
    fx.sat = lerp(fx.sat, 1 - hungry * 0.32 - tired * 0.15, t);
    fx.vig = lerp(fx.vig, 0.26 + tired * 0.32 + hungry * 0.08, t);
    // ---- HUD (4 Hz) ----
    this.hudAcc += dt;
    if (this.hudAcc > 0.25) {
      this.hudAcc = 0;
      const m = this.market, eqPos = m.equity() - m.cash;
      const W = G.weather;
      const label = { apartment: 'Unit 4801 · Floor 48', balcony: 'Balcony · Floor 48', hall: 'Floor 48 corridor', elevator: 'Elevator', lobby: 'Meridian Tower lobby', burger: 'Big Stack Burgers', grocery: 'FreshMart', park: 'Central Green', street: 'Meridian Avenue' }[this.zone.name] || '';
      const carry = S.bags ? `Carrying groceries (${Object.values(S.bags).reduce((a, b) => a + b, 0)} items)` : Object.keys(S.basket).length ? `Basket: ${Object.values(S.basket).reduce((a, b) => a + b, 0)} items` : '';
      this.ui.hud({ hour: G.time.hour, day: S.day, cash: S.cash, portfolio: eqPos, hunger: S.hunger, energy: S.energy, rain: W.rain, storm: W.storm, night: G.u.uNight.value, cloud: W.cloud, zoneLabel: label, carry });
    }
    // ---- goals ----
    if (!this.ui.goalsDone.window && this.zone.name === 'apartment' && p.z < 25.5) {
      const yaw = this.player.yaw; const facing = Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw))) < 0.9;
      this.viewTime = facing ? this.viewTime + dt : 0;
      if (this.viewTime > 2.2) this.ui.completeGoal('window');
    }
    // ---- autosave ----
    this.saveAcc += dt; if (this.saveAcc > 120) { this.saveAcc = 0; this.save(false); }
  }

  // ------------------------------------------------------------------ helpers
  async doFade(msg, minutes, effect, opts = {}) {
    if (this.busy) return;
    this.busy = true; this.player.lock++;
    await this.ui.fade(msg, 650);
    if (minutes) this.advanceTime(minutes, opts);
    if (effect) effect();
    await new Promise((r) => setTimeout(r, opts.hold ?? 500));
    await this.ui.unfade(800);
    this.player.lock = Math.max(0, this.player.lock - 1); this.busy = false;
  }
  applyFood(h, e) { const S = this.state; S.hunger = clamp(S.hunger + h, 0, 100); S.energy = clamp(S.energy + e, 0, 100); }
  spend(n) { this.state.cash = Math.round((this.state.cash - n) * 100) / 100; }

  // ------------------------------------------------------------------ apartment actions
  sit(pose) {
    if (pose.kind === 'sofa') pose = { ...pose, y: APT_Y + 1.06 }; if (pose.kind === 'chair') pose = { ...pose, y: APT_Y + 1.1 };
    if (pose.kind === 'desk') pose = { ...pose, y: APT_Y + 1.16 };
    this.player.sitDown(pose);
    this.audio.click?.();
    if (pose.kind === 'sofa') this.toast('Kick back. Press E (or move) to get up.', 2600);
  }
  openMarket() { this.ui.completeGoal('market'); P.openMarket(this); }
  openFridge() { P.openFridge(this); }
  openCook() { P.openCook(this); }
  openSleep() { P.openSleep(this); }
  drinkWater() { this.audio.water?.(1.6); this.toast('Cold, clean water.'); this.applyFood(1, 1); }
  makeCoffee() {
    const S = this.state;
    if (!(S.pantry.coffee > 0) && !(S.coffeeCups > 0)) { this.toast('Out of coffee beans. FreshMart sells them (breakfast aisle).'); return; }
    if (!(S.coffeeCups > 0)) { S.pantry.coffee--; if (S.pantry.coffee <= 0) delete S.pantry.coffee; S.coffeeCups = 8; }
    S.coffeeCups--;
    const big = S.upgrades.espresso;
    this.audio.coffee?.();
    this.doFade(big ? 'Pulling a shot...' : 'Brewing coffee...', 6, () => { this.applyFood(1, big ? 34 : 22); this.toast(big ? 'A proper espresso. Energy up.' : 'Fresh coffee. Energy up.'); }, { hold: 700 });
  }
  reheat() { if (this.state.meals.length) this.openFridge(); else this.toast('No leftovers to reheat.'); }
  freshen() { this.audio.water?.(1.6); this.doFade('Freshening up...', 6, () => { this.applyFood(0, 3); this.toast('Feeling fresher.'); }); }
  shower() { this.audio.water?.(3); this.doFade('Taking a hot shower...', 20, () => { this.applyFood(0, 7); this.toast('Hot water, clear head.'); }, { hold: 900 }); }
  readBook() {
    const q = ['You reread a chapter on compound interest. Patience, it turns out, is a strategy.', 'A dog-eared novel about a lighthouse keeper. You lose half an hour to it.', 'A coffee-table book of city photography. You recognise a corner two blocks away.', 'A biography of a legendary investor. Mostly it says: sleep well, eat well.'];
    this.doFade('Reading...', 30, () => { this.applyFood(0, -2); this.toast(q[Math.floor(Math.random() * q.length)], 5000); });
  }
  waterPlant() { this.audio.water?.(1.2); this.toast('The monstera looks pleased.'); }
  telescope() { this.doFade('Stargazing...', 20, () => { this.toast(G.u.uNight.value > 0.5 ? 'You find the moon\'s craters and a blinking satellite.' : 'You follow a ferry across the bay and count the bridges.', 5000); }); }
  checkMail() {
    const m = ['Junk mail: "You may already be a winner (of a timeshare)."', 'A postcard from an old friend. It made you smile.', 'A utility statement. Paid automatically, as always.', 'A flyer for the new noodle bar on the corner.', 'Nothing today but a pizza coupon.'];
    this.toast(m[(this.state.day + Math.floor(G_time())) % m.length], 4500);
  }
  jukebox() { this.audio.toggleJuke?.(); }

  // ------------------------------------------------------------------ sleep
  async sleep(mode) {
    if (this.busy) return;
    const S = this.state; const h = G.time.hour;
    let hours;
    if (mode === 'night') { hours = ((7 - h) + 24) % 24; if (hours < 0.5) hours += 24; }
    else hours = +mode;
    const startWorth = this.market.equity() - this.market.cash;
    const startDay = S.day; this._payToday = 0;
    this.busy = true; this.player.lock++;
    await this.ui.fade('Sleeping...', 1100);
    this.audio.setMuted?.(true);
    // simulate in 15-minute chunks so the market and weather evolve
    let left = hours * 60;
    while (left > 0) { const s = Math.min(15, left); this.advanceTime(s, { sleeping: true }); this.world.weatherSys.update(s * 0.6, this.camera, this.player); left -= s; }
    this.audio.setMuted?.(false);
    this.atmo.update(0.1, 0, this.camera.position);
    await new Promise((r) => setTimeout(r, 700));
    await this.ui.unfade(1200);
    this.player.lock = Math.max(0, this.player.lock - 1); this.busy = false;
    if (mode === 'night') {
      this.save(false);
      const W = G.weather;
      const info = { day: S.day, pay: this._payToday || 0, pl: (this.market.equity() - this.market.cash) - startWorth, cash: S.cash, worth: S.cash + this.market.equity() - this.market.cash, weather: W.target > 0.3 ? 'rain expected' : 'a clear morning', note: S.hunger < 40 ? 'Your stomach is empty. Breakfast first?' : 'You slept well.' };
      P.showSummary(this, info);
    } else this.toast(`You woke up around ${fmtClock(G.time.hour)}.`);
  }
  async passOut() {
    if (this.busy) return; this.busy = true; this.player.lock++;
    this.player.standUp?.();
    await this.ui.fade('You passed out from exhaustion...', 1200);
    this.busy = false; this.player.lock = Math.max(0, this.player.lock - 1);
    // wake up in bed at 9:00
    const h = G.time.hour; const hours = ((9 - h) + 24) % 24;
    this.player.teleport(-46.2, APT_Y, 25.0, Math.PI / 2, 1);
    this.busy = true; this.player.lock++;
    this.advanceTime(hours * 60, { sleeping: true });
    this.state.hunger = Math.min(this.state.hunger, 35);
    await new Promise((r) => setTimeout(r, 900));
    await this.ui.unfade(1200);
    this.busy = false; this.player.lock = Math.max(0, this.player.lock - 1);
    this.toast('You woke up in bed, a little groggy. Take it easier today.', 5000);
  }

  // ------------------------------------------------------------------ food
  cook(id) {
    const r = RECIPES.find((x) => x.id === id), S = this.state;
    for (const [k, n] of Object.entries(r.needs)) if ((S.pantry[k] || 0) < n) { this.toast('Missing ingredients.'); return; }
    for (const [k, n] of Object.entries(r.needs)) { S.pantry[k] -= n; if (S.pantry[k] <= 0) delete S.pantry[k]; }
    this.audio.sizzle?.(Math.min(4, r.minutes / 6));
    this.doFade(`Cooking ${r.name.toLowerCase()}...`, r.minutes, () => { this.applyFood(r.hunger, r.energy); S.stats.cooked++; this.audio.eat?.(); this.toast(`${r.name}: delicious. +${r.hunger} food`); this.ui.completeGoal('cook'); }, { hold: 900 });
  }
  eatPantry(id) {
    const g = GROCERY.find((x) => x.id === id), S = this.state;
    if (!g.eat || !(S.pantry[id] > 0)) return;
    S.pantry[id]--; if (S.pantry[id] <= 0) delete S.pantry[id];
    this.applyFood(g.eat[0], g.eat[1]); this.audio.eat?.(); this.toast(`Ate ${g.name.toLowerCase()}. +${g.eat[0]} food`);
  }
  eatMeal(i) {
    const S = this.state; const m = S.meals[i]; if (!m) return;
    S.meals.splice(i, 1);
    this.doFade('Reheating leftovers...', 8, () => { this.applyFood(Math.round(m.hunger * 0.9), m.energy); this.audio.eat?.(); this.toast(`Reheated ${m.name}: still good.`); });
  }
  storeGroceries() {
    const S = this.state; if (!S.bags) return;
    for (const [id, n] of Object.entries(S.bags)) S.pantry[id] = (S.pantry[id] || 0) + n;
    S.bags = null; this.audio.click?.(); this.toast('Groceries put away.'); this.ui.completeGoal('groceries'); this.refreshBasketVisual?.();
  }

  // ------------------------------------------------------------------ diner
  openBurger() { P.openBurger(this); }
  orderBurger(items, total, mode) {
    const S = this.state;
    this.spend(total); this.audio.cash?.();
    const hunger = items.reduce((s, i) => s + i.hunger * i.n, 0), energy = items.reduce((s, i) => s + i.energy * i.n, 0);
    const name = items.map((i) => (i.n > 1 ? `${i.n}× ` : '') + i.name).join(', ');
    if (mode === 'here') {
      this.doFade('Enjoying your meal...', 24, () => { this.applyFood(hunger, energy); this.audio.eat?.(); S.stats.meals++; this.toast(`${name}. +${hunger} food`, 4200); this.ui.completeGoal('lunch'); }, { hold: 1200 });
    } else {
      S.meals.push({ name: name.length > 46 ? name.slice(0, 44) + '…' : name, hunger, energy });
      this.toast(`Takeaway packed: ${name}. It's in your fridge tray.`, 4200); this.ui.completeGoal('lunch');
    }
  }
  jukeboxPlay() { this.audio.toggleJuke?.(); }

  // ------------------------------------------------------------------ grocery
  openGrocery(cat) { P.openGrocery(this, cat); }
  checkout() { P.openCheckout(this); }
  leaveBlocked() { return Object.keys(this.state.basket).length > 0; }
  payGroceries(total) {
    const S = this.state;
    this.spend(total); this.audio.cash?.();
    S.bags = S.bags || {};
    for (const [id, n] of Object.entries(S.basket)) S.bags[id] = (S.bags[id] || 0) + n;
    S.basket = {};
    this.toast(`Paid ${fmtMoney(total)}. The cashier hands you two paper bags.`, 4200);
    this.refreshBasketVisual?.();
  }

  // ------------------------------------------------------------------ market
  trade(sym, qty, side) {
    const S = this.state, m = this.market;
    if (!m.isOpen(G.time.hour)) { this.toast('The market is closed.'); return; }
    if (side === 'buy') {
      const r = m.buy(sym, qty, S.cash);
      if (!r.ok) { this.toast(r.msg); return; }
      S.cash = Math.round((S.cash - r.cost) * 100) / 100; this.toast(`Bought ${qty} ${sym} @ ${r.px.toFixed(2)}`, 2200);
    } else {
      const r = m.sell(sym, qty);
      if (!r.ok) { this.toast(r.msg); return; }
      S.cash = Math.round((S.cash + r.proceeds) * 100) / 100; this.toast(`Sold ${qty} ${sym} @ ${r.px.toFixed(2)}`, 2200);
    }
    S.stats.trades++; this.audio.click?.();
  }
  buyUpgrade(id) {
    const u = UPGRADES.find((x) => x.id === id), S = this.state;
    if (S.upgrades[id] || S.cash < u.price) return;
    S.cash -= u.price; S.upgrades[id] = true; this.applyUpgrades(); this.audio.cash?.();
    this.toast(`Bought: ${u.name}.`); this.ui.completeGoal('upgrade');
  }
  applyUpgrades() { for (const u of UPGRADES) this.world.upgrades?.set(u.id, !!this.state.upgrades[u.id]); }
  onTerminalClosed() { /* hook */ }
}

const G_time = () => G.time.hour;
