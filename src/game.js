import { TAU, clamp, lerp, rand, randInt, pick, segRectT, segCircleT, pathRoundRect } from './util.js';
import { WORLD, TEAM_COLOR, TEAM_DARK, MATCH_TIME, TARGET_SCORE, buildLevel, makeStaticCanvas } from './level.js';
import { MAX_HP, Player, Bot, drawOperator } from './entities.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';

const ALLY_NAMES = ['SABRE', 'ECHO'];
const ENEMY_NAMES = ['VIPER', 'GHOST', 'RAVEN', 'COBRA', 'JACKAL', 'WRAITH'];

const $ = (id) => document.getElementById(id);
const setText = (el, v) => {
  if (el && el.__v !== v) {
    el.textContent = v;
    el.__v = v;
  }
};
const setHTML = (el, v) => {
  if (el && el.__v !== v) {
    el.innerHTML = v;
    el.__v = v;
  }
};
const setWidth = (el, v) => {
  if (el && el.__w !== v) {
    el.style.width = v;
    el.__w = v;
  }
};

export class Game {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.input = new Input(canvas);
    this.sfx = new Sfx();
    this.level = buildLevel();
    this.staticCanvas = makeStaticCanvas(this.level);
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.dpr = 1;
    this.state = 'menu';
    this.elapsed = 0;
    this.startGrace = 0;
    this.camera = { x: WORLD.w / 2, y: WORLD.h / 2, shake: 0 };
    this.hud = {
      startScreen: $('startScreen'),
      endScreen: $('endScreen'),
      pauseScreen: $('pauseScreen'),
      blueScore: $('blueScore'),
      tanScore: $('tanScore'),
      timer: $('timer'),
      killfeed: $('killfeed'),
      healthFill: $('healthFill'),
      staminaFill: $('staminaFill'),
      statusText: $('statusText'),
      magCount: $('magCount'),
      reserveCount: $('reserveCount'),
      reloadFill: $('reloadFill'),
      centerText: $('centerText'),
      toast: $('toast'),
      hint: $('hint'),
      hurt: $('hurt'),
      endTitle: $('endTitle'),
      endSub: $('endSub'),
      endScore: $('endScore'),
    };
    this.reset();
    this.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
  }

  resize(w, h, dpr) {
    this.viewW = w;
    this.viewH = h;
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  screenToWorld(sx, sy) {
    return { x: sx - this.viewW / 2 + this.camera.x, y: sy - this.viewH / 2 + this.camera.y };
  }

  reset() {
    this.bullets = [];
    this.particles = [];
    this.texts = [];
    this.entities = [];
    this.score = { blue: 0, tan: 0 };
    this.timeLeft = MATCH_TIME;
    this.elapsed = 0;
    this.matchOver = false;
    this.hurtFlash = 0;
    this.hitMarker = 0;
    this.startGrace = 0;
    this.camera.shake = 0;

    const bs = this.level.blueSpawns;
    const ts = this.level.tanSpawns;
    this.player = new Player(this, bs[2].x, bs[2].y);
    this.entities.push(this.player);
    for (let i = 0; i < 2; i++) {
      const s = bs[i];
      this.entities.push(new Bot(this, ALLY_NAMES[i], 'blue', s.x, s.y));
    }
    for (let i = 0; i < 3; i++) {
      const s = ts[i];
      this.entities.push(new Bot(this, ENEMY_NAMES[i], 'tan', s.x, s.y));
    }
    this.pickups = this.level.pickups.map((p, i) => ({ ...p, id: i, taken: false, timer: 0 }));
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.updateHud();
  }

  deploy() {
    this.sfx.init();
    this.reset();
    this.state = 'playing';
    this.startGrace = 0.35;
    this.hud.startScreen.classList.add('hidden');
    this.hud.endScreen.classList.add('hidden');
    this.hud.pauseScreen.classList.add('hidden');
    this.hud.hint.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hud.hint.classList.remove('show'), 9000);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.firing = false;
    this.hud.pauseScreen.classList.remove('hidden');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.firing = false;
    this.startGrace = 0.2;
    this.hud.pauseScreen.classList.add('hidden');
  }

  handleKeys() {
    if (this.input.consume('KeyM')) {
      const muted = this.sfx.toggleMute();
      this.toast(muted ? 'AUDIO MUTED' : 'AUDIO ON');
    }
    if (this.state === 'menu') {
      if (this.input.consume('Enter') || this.input.consume('Space')) this.deploy();
    } else if (this.state === 'over') {
      if (this.input.consume('Enter')) this.deploy();
    } else if (this.state === 'playing') {
      if (this.input.consume('Escape')) this.pause();
    } else if (this.state === 'paused') {
      if (this.input.consume('Escape') || this.input.consume('Enter')) this.resume();
    }
  }

  update(dt) {
    this.handleKeys();
    if (this.state === 'playing') {
      this.startGrace = Math.max(0, this.startGrace - dt);
      this.elapsed += dt;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.updateEntities(dt);
      this.updateBullets(dt);
      this.updatePickups(dt);
      this.updateEffects(dt);
      this.updateCamera(dt);
      this.updateHud();
      if (this.timeLeft <= 0) this.endMatch();
    } else if (this.state === 'over') {
      this.updateEffects(dt * 0.5);
      this.updateCamera(dt);
    }
    this.input.endFrame();
  }

  updateEntities(dt) {
    for (const e of this.entities) {
      if (e.dead) {
        if (this.state === 'playing' && this.elapsed >= e.respawnAt) this.respawn(e);
      } else {
        e.update(dt);
      }
    }
    this.separateEntities();
  }

  separateEntities() {
    const list = this.entities.filter((e) => e.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d >= min) continue;
        if (d < 0.001) {
          a.x -= 0.5;
          b.x += 0.5;
          continue;
        }
        const push = (min - d) / 2;
        dx /= d;
        dy /= d;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }

  respawn(e) {
    const spawns = e.team === 'blue' ? this.level.blueSpawns : this.level.tanSpawns;
    const s = pick(spawns);
    e.x = s.x + rand(-12, 12);
    e.y = s.y + rand(-8, 8);
    e.hp = MAX_HP;
    e.dead = false;
    e.hitFlash = 0;
    e.sinceDamage = 0;
    e.spawnProtect = 1.4;
    e.aim = e.team === 'blue' ? -Math.PI / 2 : Math.PI / 2;
    e.target = null;
    e.waypoint = null;
    e.waypointTimer = 0;
    if (e.mag !== undefined) e.mag = e.magSize;
    if (e.reloading !== undefined) e.reloading = 0;
    if (e === this.player) {
      e.reserve = 150;
      e.reloadT = 0;
      e.stamina = 100;
      e.spreadHeat = 0;
      this.hitMarker = 0;
    }
    for (let i = 0; i < 10; i++) {
      this.particles.push({ x: e.x, y: e.y, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.5, maxLife: 0.5, size: rand(2, 5), color: 'rgba(200, 190, 160, 0.55)', drag: 2.5 });
    }
  }

  shoot(shooter, opts = {}) {
    const spread = opts.spread ?? 0.03;
    const dmg = opts.dmg ?? 30;
    const speed = opts.speed ?? 1250;
    const a = shooter.aim + rand(-spread, spread);
    const mx = shooter.x + Math.cos(a) * 22;
    const my = shooter.y + Math.sin(a) * 22;
    this.bullets.push({
      x: mx,
      y: my,
      px: mx,
      py: my,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.9,
      dmg,
      team: shooter.team,
      from: shooter,
      player: opts.fromPlayer === true,
    });
    shooter.muzzle = 0.055;
    for (let i = 0; i < 2; i++) {
      this.particles.push({ x: mx, y: my, vx: Math.cos(a) * rand(30, 90) + rand(-20, 20), vy: Math.sin(a) * rand(30, 90) + rand(-20, 20), life: 0.24, maxLife: 0.24, size: rand(1.5, 3), color: 'rgba(255, 240, 210, 0.8)', drag: 4 });
    }
    const dp = Math.hypot(shooter.x - this.player.x, shooter.y - this.player.y);
    const vol = clamp(1 - dp / 1200, 0.08, 1) * (opts.fromPlayer ? 0.55 : 0.42);
    this.sfx.shoot({ vol, pan: clamp((shooter.x - this.player.x) / 700, -1, 1), enemy: !opts.fromPlayer });
  }

  updateBullets(dt) {
    const obstacles = this.level.obstacles;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.px = b.x;
      b.py = b.y;
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      let bestT = 1.0001;
      let hitEnt = null;
      for (const o of obstacles) {
        const t = segRectT(b.x, b.y, nx, ny, o);
        if (t < bestT) {
          bestT = t;
          hitEnt = null;
        }
      }
      for (const e of this.entities) {
        if (!e.alive || e.team === b.team) continue;
        const t = segCircleT(b.x, b.y, nx, ny, e.x, e.y, e.r + 1);
        if (t < bestT) {
          bestT = t;
          hitEnt = e;
        }
      }
      if (bestT <= 1) {
        const hx = b.x + (nx - b.x) * bestT;
        const hy = b.y + (ny - b.y) * bestT;
        if (hitEnt) this.hitEntity(hitEnt, b, hx, hy);
        else this.hitCover(hx, hy, b);
        this.bullets.splice(i, 1);
        continue;
      }
      b.x = nx;
      b.y = ny;
      if (b.life <= 0 || b.x < -40 || b.y < -40 || b.x > WORLD.w + 40 || b.y > WORLD.h + 40) {
        this.bullets.splice(i, 1);
      }
    }
  }

  hitEntity(e, b, x, y) {
    const damaged = e.takeDamage(b.dmg, b.from);
    if (!damaged) {
      this.hitCover(x, y, b);
      return;
    }
    const col = e.team === 'blue' ? 'rgba(120, 180, 255, 0.9)' : 'rgba(255, 150, 90, 0.9)';
    for (let i = 0; i < 6; i++) {
      this.particles.push({ x, y, vx: rand(-120, 120), vy: rand(-120, 120), life: rand(0.15, 0.35), maxLife: 0.35, size: rand(1, 2.6), color: col, drag: 3 });
    }
    if (b.from === this.player) {
      this.hitMarker = 0.3;
      this.sfx.hit({ vol: e.alive ? 0.3 : 0.42 });
    } else if (e === this.player) {
      this.hurtFlash = Math.min(1, this.hurtFlash + 0.45);
      this.camera.shake = Math.max(this.camera.shake, 5);
      this.sfx.hurt({ vol: 0.5 });
    }
  }

  hitCover(x, y, b) {
    for (let i = 0; i < 4; i++) {
      this.particles.push({ x, y, vx: rand(-90, 90), vy: rand(-90, 90), life: 0.3, maxLife: 0.3, size: rand(1, 2.4), color: 'rgba(240, 225, 190, 0.9)', drag: 3 });
    }
    if (Math.random() < 0.35) {
      this.sfx.impact({ vol: 0.1, pan: clamp((x - this.player.x) / 700, -1, 1) });
    }
  }

  updatePickups(dt) {
    for (const p of this.pickups) {
      if (p.taken) {
        p.timer -= dt;
        if (p.timer <= 0) p.taken = false;
        continue;
      }
      for (const e of this.entities) {
        if (!e.alive || Math.hypot(e.x - p.x, e.y - p.y) > 26) continue;
        let used = false;
        if (p.type === 'ammo') {
          if (e === this.player && e.reserve < 240) {
            e.reserve = Math.min(240, e.reserve + 90);
            used = true;
          }
        } else if (e.hp < MAX_HP) {
          e.hp = Math.min(MAX_HP, e.hp + 45);
          used = true;
        }
        if (used) {
          p.taken = true;
          p.timer = 18;
          this.sfx.pickup();
          for (let i = 0; i < 8; i++) {
            this.particles.push({ x: p.x, y: p.y, vx: rand(-70, 70), vy: rand(-70, 70), life: 0.5, maxLife: 0.5, size: rand(1.5, 3.2), color: p.type === 'ammo' ? 'rgba(255, 214, 120, 0.9)' : 'rgba(130, 240, 170, 0.9)', drag: 3 });
          }
          if (e === this.player) this.toast(p.type === 'ammo' ? 'AMMO +90' : 'PATCHED UP +45');
        }
        break;
      }
    }
  }

  updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const drag = 1 - Math.min(0.95, (p.drag || 3) * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 4);
    this.camera.shake = Math.max(0, this.camera.shake - dt * 55);
  }

  updateCamera(dt) {
    const p = this.player;
    let lx = 0;
    let ly = 0;
    if (!p.dead) {
      const target = this.screenToWorld(this.input.mouse.x, this.input.mouse.y);
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const lead = Math.min(d, 340) * 0.34;
      lx = (dx / d) * lead;
      ly = (dy / d) * lead;
    }
    const k = 1 - Math.exp(-7 * dt);
    this.camera.x = lerp(this.camera.x, p.x + lx, k);
    this.camera.y = lerp(this.camera.y, p.y + ly, k);
    const hw = this.viewW / 2;
    const hh = this.viewH / 2;
    this.camera.x = WORLD.w > this.viewW ? clamp(this.camera.x, hw, WORLD.w - hw) : WORLD.w / 2;
    this.camera.y = WORLD.h > this.viewH ? clamp(this.camera.y, hh, WORLD.h - hh) : WORLD.h / 2;
  }

  hasLineOfSight(x1, y1, x2, y2) {
    for (const o of this.level.obstacles) {
      if (segRectT(x1, y1, x2, y2, o) < 1) return false;
    }
    return true;
  }

  onDown(victim, killer) {
    const killerTeam = killer ? killer.team : victim.team === 'blue' ? 'tan' : 'blue';
    if (killerTeam === 'blue') this.score.blue += 1;
    else this.score.tan += 1;
    victim.dead = true;
    victim.respawnAt = this.elapsed + (victim === this.player ? 3.2 : rand(3.2, 5));
    this.sfx.down({ vol: victim === this.player ? 0.5 : 0.28 });
    for (let i = 0; i < 14; i++) {
      this.particles.push({ x: victim.x, y: victim.y, vx: rand(-150, 150), vy: rand(-150, 150), life: rand(0.25, 0.6), maxLife: 0.6, size: rand(1.5, 3.4), color: TEAM_COLOR[victim.team], drag: 2.6 });
    }
    this.texts.push({ x: victim.x, y: victim.y - 24, text: 'OUT', life: 1.2, maxLife: 1.2, vy: -26, color: TEAM_COLOR[victim.team] });
    this.addFeed(killer, victim);
    if (victim === this.player) {
      this.hurtFlash = 1;
      this.camera.shake = 14;
    }
    if (killer === this.player) {
      this.hitMarker = 0.35;
      this.camera.shake = Math.max(this.camera.shake, 6);
      this.toast(`ELIMINATED ${victim.name}`);
    }
    this.updateHud();
    this.checkWin();
  }

  addFeed(killer, victim) {
    const feed = this.hud.killfeed;
    if (!feed) return;
    const kName = killer ? (killer === this.player ? 'YOU' : killer.name) : 'FIELD';
    const kTeam = killer ? killer.team : victim.team === 'blue' ? 'tan' : 'blue';
    const vName = victim === this.player ? 'YOU' : victim.name;
    const el = document.createElement('div');
    el.className = 'feed';
    el.innerHTML = `<span class="chip ${kTeam}">${kName}</span><span class="arrow">›</span><span class="chip ${victim.team}">${vName}</span>`;
    feed.prepend(el);
    while (feed.children.length > 5) {
      const last = feed.lastChild;
      if (!last) break;
      feed.removeChild(last);
    }
    setTimeout(() => el.classList.add('fade'), 3400);
    setTimeout(() => el.remove(), 4100);
  }

  toast(text) {
    const el = this.hud.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
  }

  checkWin() {
    if (this.state !== 'playing') return;
    if (this.score.blue >= TARGET_SCORE || this.score.tan >= TARGET_SCORE) this.endMatch();
  }

  endMatch() {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.input.firing = false;
    const blue = this.score.blue;
    const tan = this.score.tan;
    let title = 'DRAW';
    let sub = 'Dead even on the field. Call it a day.';
    let cls = '';
    if (blue > tan) {
      title = 'VICTORY';
      sub = 'Field secured. Your team called its hits and took the ground.';
      cls = 'win';
      this.sfx.win();
    } else if (tan > blue) {
      title = 'DEFEAT';
      sub = 'Tan held the field. Regroup, top off your mags, and go again.';
      cls = 'lose';
      this.sfx.lose();
    }
    this.hud.endTitle.textContent = title;
    this.hud.endTitle.className = cls;
    this.hud.endSub.textContent = sub;
    this.hud.endScore.innerHTML = `<span class="blue">${blue}</span><i>—</i><span class="tan">${tan}</span>`;
    this.hud.endScreen.classList.remove('hidden');
    this.hud.centerText.classList.remove('show');
    this.hud.centerText.__show = false;
  }

  updateHud() {
    const p = this.player;
    const h = this.hud;
    const hpPct = clamp(p.hp / MAX_HP, 0, 1);
    setWidth(h.healthFill, `${(hpPct * 100).toFixed(1)}%`);
    if (h.healthFill.__low !== hpPct < 0.34) {
      h.healthFill.__low = hpPct < 0.34;
      h.healthFill.classList.toggle('low', hpPct < 0.34);
    }
    setWidth(h.staminaFill, `${p.stamina.toFixed(0)}%`);
    setText(h.magCount, String(p.mag));
    setText(h.reserveCount, String(p.reserve));
    if (h.magCount.__empty !== (p.mag === 0)) {
      h.magCount.__empty = p.mag === 0;
      h.magCount.classList.toggle('empty', p.mag === 0);
    }
    setWidth(h.reloadFill, p.reloadT > 0 ? `${((1 - p.reloadT / p.reloadDuration) * 100).toFixed(0)}%` : '0%');

    let status = 'READY';
    if (p.dead) status = 'HIT';
    else if (p.reloadT > 0) status = 'RELOADING';
    else if (p.hp < 34) status = 'WOUNDED';
    setText(h.statusText, status);

    const t = Math.max(0, Math.ceil(this.timeLeft));
    setText(h.timer, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    if (h.timer.__low !== this.timeLeft < 30) {
      h.timer.__low = this.timeLeft < 30;
      h.timer.classList.toggle('low', this.timeLeft < 30);
    }
    setText(h.blueScore, String(this.score.blue));
    setText(h.tanScore, String(this.score.tan));
    h.hurt.style.opacity = String(Math.min(0.9, this.hurtFlash * 0.9));

    if (p.dead) {
      const n = Math.max(0, Math.ceil(p.respawnAt - this.elapsed));
      setHTML(h.centerText, `<b>HIT</b><span>REDEPLOYING IN ${n}</span>`);
      if (h.centerText.__show !== true) {
        h.centerText.__show = true;
        h.centerText.classList.add('show');
      }
    } else if (h.centerText.__show !== false) {
      h.centerText.__show = false;
      h.centerText.classList.remove('show');
    }
  }

  render() {
    const ctx = this.ctx;
    const { viewW, viewH, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0d09';
    ctx.fillRect(0, 0, viewW, viewH);

    const shake = this.camera.shake;
    const ox = viewW / 2 - this.camera.x + (Math.random() - 0.5) * shake;
    const oy = viewH / 2 - this.camera.y + (Math.random() - 0.5) * shake;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.drawImage(this.staticCanvas, 0, 0);
    this.drawPickups(ctx);
    this.drawEntities(ctx);
    this.drawBullets(ctx);
    this.drawParticles(ctx);
    this.drawMuzzleFlashes(ctx);
    this.drawTexts(ctx);
    ctx.restore();

    this.drawScreenUi(ctx);
  }

  drawPickups(ctx) {
    for (const p of this.pickups) {
      if (p.taken) continue;
      const pulse = 1 + Math.sin(this.elapsed * 3 + p.id) * 0.08;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(2, 5, 16, 7, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = p.type === 'ammo' ? 'rgba(255,214,120,0.5)' : 'rgba(130,240,170,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 20 * pulse, 0, TAU);
      ctx.stroke();
      if (p.type === 'ammo') {
        ctx.fillStyle = '#6d6a3d';
        pathRoundRect(ctx, -12, -9, 24, 18, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#d9b44a';
        ctx.fillRect(-12, -2, 24, 4);
      } else {
        ctx.fillStyle = '#e8e4d6';
        pathRoundRect(ctx, -12, -9, 24, 18, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#d1493c';
        ctx.fillRect(-2, -6, 4, 12);
        ctx.fillRect(-6, -2, 12, 4);
      }
      ctx.restore();
    }
  }

  drawEntities(ctx) {
    const list = this.entities.filter((e) => e.alive).sort((a, b) => a.y - b.y);
    for (const e of list) drawOperator(ctx, e);
  }

  drawBullets(ctx) {
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      const ang = Math.atan2(b.vy, b.vx);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      ctx.strokeStyle = b.player ? 'rgba(200,235,255,0.9)' : 'rgba(255,205,160,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - c * 18, b.y - s * 18);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#fff8ea';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 1.7, 0, TAU);
      ctx.fill();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawMuzzleFlashes(ctx) {
    for (const e of this.entities) {
      if (!e.alive || e.muzzle <= 0) continue;
      const a = e.aim;
      const mx = e.x + Math.cos(a) * 24;
      const my = e.y + Math.sin(a) * 24;
      const alpha = clamp(e.muzzle / 0.055, 0, 1);
      const grd = ctx.createRadialGradient(mx, my, 0, mx, my, 28);
      grd.addColorStop(0, `rgba(255,236,190,${0.8 * alpha})`);
      grd.addColorStop(0.45, `rgba(255,180,80,${0.32 * alpha})`);
      grd.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(mx, my, 28, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(a);
      ctx.fillStyle = `rgba(255,244,214,${0.9 * alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, -3.5);
      ctx.lineTo(16, 0);
      ctx.lineTo(0, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.font = '800 15px ui-sans-serif, system-ui, sans-serif';
    for (const t of this.texts) {
      const a = clamp(t.life / 0.5, 0, 1);
      ctx.globalAlpha = a;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  drawScreenUi(ctx) {
    this.drawRadar(ctx);
    if (this.state === 'playing' || this.state === 'paused') this.drawCrosshair(ctx);
  }

  drawRadar(ctx) {
    const pad = 20;
    const w = 168;
    const h = Math.round((w * WORLD.h) / WORLD.w);
    const sx = w / WORLD.w;
    ctx.save();
    ctx.translate(pad, pad);
    ctx.fillStyle = 'rgba(10, 14, 9, 0.6)';
    pathRoundRect(ctx, 0, 0, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(236, 231, 216, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    pathRoundRect(ctx, 0, 0, w, h, 8);
    ctx.clip();
    ctx.fillStyle = 'rgba(236, 231, 216, 0.1)';
    for (const o of this.level.obstacles) {
      if (o.t === 'border') continue;
      ctx.fillRect(o.x * sx, o.y * sx, Math.max(1, o.w * sx), Math.max(1, o.h * sx));
    }
    for (const e of this.entities) {
      if (!e.alive) continue;
      const ex = e.x * sx;
      const ey = e.y * sx;
      if (e === this.player) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(e.aim) * 9, ey + Math.sin(e.aim) * 9);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, ey, 3.2, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = TEAM_COLOR[e.team];
        ctx.beginPath();
        ctx.arc(ex, ey, 2.6, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(236, 231, 216, 0.5)';
    ctx.font = '700 8.5px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SECTOR RADAR', 9, h - 8);
    ctx.restore();
  }

  drawCrosshair(ctx) {
    const p = this.player;
    const m = this.input.mouse;
    const gap = 5 + p.spreadHeat * 260 + (p.moving ? 3 : 0) + (p.reloadT > 0 ? 6 : 0);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(gap, 0);
      ctx.lineTo(gap + 7, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, TAU);
    ctx.fill();

    if (this.hitMarker > 0) {
      ctx.globalAlpha = Math.min(1, this.hitMarker * 4);
      ctx.strokeStyle = '#ffd36e';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate(Math.PI / 4 + (i * Math.PI) / 2);
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(17, 0);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    if (p.reloadT > 0) {
      const prog = 1 - p.reloadT / p.reloadDuration;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#ffd36e';
      ctx.beginPath();
      ctx.arc(0, 0, 24, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
      ctx.stroke();
      ctx.font = '700 8px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 211, 110, 0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('RELOADING', 0, 40);
    }
    ctx.restore();
  }
}
