import {
  TAU,
  clamp,
  rand,
  randInt,
  angleDiff,
  approachAngle,
  resolveCircleRect,
  pathRoundRect,
} from './util.js';
import { WORLD, TEAM_COLOR, TEAM_DARK } from './level.js';

export const MAX_HP = 100;

export class Operator {
  constructor(game, x, y, team, name) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.r = 13;
    this.team = team;
    this.name = name;
    this.speed = 245;
    this.aim = team === 'blue' ? -Math.PI / 2 : Math.PI / 2;
    this.hp = MAX_HP;
    this.dead = false;
    this.respawnAt = 0;
    this.moving = false;
    this.walkPhase = 0;
    this.hitFlash = 0;
    this.muzzle = 0;
    this.spawnProtect = 0;
    this.sinceDamage = 0;
    this.isPlayer = false;
  }

  get alive() {
    return !this.dead;
  }

  tickTimers(dt) {
    if (this.dead) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.sinceDamage += dt;
  }

  move(ix, iy, scale, dt) {
    const len = Math.hypot(ix, iy);
    this.moving = len > 0.01;
    if (this.moving) {
      ix /= len;
      iy /= len;
    }
    const speed = this.speed * scale;
    this.x += ix * speed * dt;
    for (const o of this.game.level.obstacles) resolveCircleRect(this, this.r, o);
    this.y += iy * speed * dt;
    for (const o of this.game.level.obstacles) resolveCircleRect(this, this.r, o);
    this.x = clamp(this.x, this.r + 2, WORLD.w - this.r - 2);
    this.y = clamp(this.y, this.r + 2, WORLD.h - this.r - 2);
    if (this.moving) this.walkPhase += dt * 11;
  }

  takeDamage(amount, from) {
    if (this.dead || this.spawnProtect > 0) return false;
    this.hp -= amount;
    this.sinceDamage = 0;
    this.hitFlash = 0.22;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.game.onDown(this, from);
    }
    return true;
  }
}

export function drawOperator(ctx, e) {
  if (e.dead) return;
  const light = TEAM_COLOR[e.team];
  const dark = TEAM_DARK[e.team];

  ctx.save();
  ctx.translate(e.x, e.y);

  // shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
  ctx.beginPath();
  ctx.ellipse(3, 6, e.r + 3, e.r * 0.8, 0, 0, TAU);
  ctx.fill();

  if (e.isPlayer) {
    ctx.strokeStyle = 'rgba(111, 179, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 8, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (e.spawnProtect > 0) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 + 0.25 * Math.sin(e.spawnProtect * 22)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 5, 0, TAU);
    ctx.stroke();
  }

  ctx.rotate(e.aim);

  // legs
  const swing = e.moving ? Math.sin(e.walkPhase) * 3.5 : 0;
  ctx.fillStyle = '#3a3f33';
  pathRoundRect(ctx, -8, -10 + swing, 15, 7, 3);
  ctx.fill();
  pathRoundRect(ctx, -8, 3 - swing, 15, 7, 3);
  ctx.fill();

  // torso
  ctx.fillStyle = '#545c48';
  ctx.beginPath();
  ctx.ellipse(-1, 0, 11.5, 12.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // plate carrier with team flash
  ctx.fillStyle = '#2f352b';
  pathRoundRect(ctx, -8, -8.5, 12, 17, 4);
  ctx.fill();
  ctx.fillStyle = dark;
  pathRoundRect(ctx, -6, -6, 8, 12, 2);
  ctx.fill();

  // rifle
  ctx.fillStyle = '#20241e';
  pathRoundRect(ctx, 4, -2.6, 22, 5.2, 2);
  ctx.fill();
  ctx.fillStyle = '#151813';
  pathRoundRect(ctx, 6, -5.2, 9, 10.4, 2);
  ctx.fill();
  ctx.fillStyle = '#3b3f34';
  pathRoundRect(ctx, 15, 2.2, 6, 4, 2);
  ctx.fill();

  // hands
  ctx.fillStyle = '#c9a37a';
  ctx.beginPath();
  ctx.arc(16, 3.5, 3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(8, -4.5, 2.8, 0, TAU);
  ctx.fill();

  // helmet
  ctx.beginPath();
  ctx.arc(-1, 0, 8.6, 0, TAU);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1.5, 0, 5, 0, TAU);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.fill();

  ctx.restore();

  // hit flash
  if (e.hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.7, e.hitFlash * 3.5);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 2, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // health pip + callsign for bots
  if (!e.isPlayer) {
    const w = 30;
    if (e.hp < MAX_HP) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(e.x - w / 2, e.y - 27, w, 4);
      ctx.fillStyle = light;
      ctx.fillRect(e.x - w / 2, e.y - 27, w * clamp(e.hp / MAX_HP, 0, 1), 4);
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = light;
    ctx.font = '700 9px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, e.x, e.y - 33);
    ctx.globalAlpha = 1;
  }
}

export class Player extends Operator {
  constructor(game, x, y) {
    super(game, x, y, 'blue', 'YOU');
    this.isPlayer = true;
    this.speed = 245;
    this.magSize = 30;
    this.mag = 30;
    this.reserve = 150;
    this.reloadT = 0;
    this.reloadDuration = 1.9;
    this.cool = 0;
    this.stamina = 100;
    this.spreadHeat = 0;
  }

  update(dt) {
    const g = this.game;
    const inp = g.input;
    if (this.dead) return;
    this.tickTimers(dt);

    const w = g.screenToWorld(inp.mouse.x, inp.mouse.y);
    this.aim = Math.atan2(w.y - this.y, w.x - this.x);

    const right = inp.isDown('KeyD', 'ArrowRight') ? 1 : 0;
    const left = inp.isDown('KeyA', 'ArrowLeft') ? 1 : 0;
    const down = inp.isDown('KeyS', 'ArrowDown') ? 1 : 0;
    const up = inp.isDown('KeyW', 'ArrowUp') ? 1 : 0;
    const ix = right - left;
    const iy = down - up;
    const moving = ix !== 0 || iy !== 0;
    const wantSprint = inp.isDown('ShiftLeft', 'ShiftRight') && moving && this.stamina > 2;

    if (inp.consume('KeyR')) this.startReload();

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        const need = this.magSize - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
        g.sfx.reloadDone();
      }
    }

    this.move(ix, iy, wantSprint ? 1.42 : 1, dt);

    if (wantSprint) this.stamina = Math.max(0, this.stamina - dt * 32);
    else this.stamina = Math.min(100, this.stamina + dt * 20);

    this.spreadHeat = Math.max(0, this.spreadHeat - dt * 0.14);
    if (this.sinceDamage > 7 && this.hp < MAX_HP) this.hp = Math.min(MAX_HP, this.hp + dt * 11);

    this.cool = Math.max(0, this.cool - dt);
    if (inp.firing && g.startGrace <= 0 && this.reloadT <= 0) {
      if (this.mag > 0) {
        if (this.cool <= 0) this.fire();
      } else if (this.reserve > 0) {
        this.startReload();
      } else if (this.cool <= 0) {
        this.cool = 0.45;
        g.sfx.empty();
        g.toast('MAG EMPTY — FIND AN AMMO CRATE');
      }
    }
    if (this.mag === 0 && this.reserve > 0 && this.reloadT <= 0) this.startReload();
  }

  fire() {
    const g = this.game;
    this.cool = 0.1;
    this.mag--;
    const spread = 0.024 + (this.moving ? 0.05 : 0) + this.spreadHeat;
    this.spreadHeat = Math.min(0.055, this.spreadHeat + 0.007);
    g.shoot(this, { spread, dmg: 36, speed: 1320, fromPlayer: true });
    g.camera.shake = Math.max(g.camera.shake, 2.4);
  }

  startReload() {
    if (this.reloadT > 0 || this.mag >= this.magSize || this.reserve <= 0) return;
    this.reloadT = this.reloadDuration;
    this.game.sfx.reload();
  }
}

export class Bot extends Operator {
  constructor(game, name, team, x, y) {
    super(game, x, y, team, name);
    this.speed = 150;
    this.magSize = 26;
    this.mag = randInt(18, 26);
    this.reloading = 0;
    this.fireTimer = rand(0.2, 0.9);
    this.burstLeft = randInt(3, 5);
    this.thinkTimer = rand(0, 0.3);
    this.target = null;
    this.waypoint = null;
    this.waypointTimer = 0;
    this.strafePhase = rand(0, TAU);
    this.strafeFreq = rand(0.7, 1.3);
  }

  update(dt) {
    if (this.dead) return;
    const g = this.game;
    this.tickTimers(dt);

    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.acquire(g);
      this.thinkTimer = 0.28 + Math.random() * 0.22;
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.mag = this.magSize;
    }

    const t = this.target;
    const visible = Boolean(t && t.alive && g.hasLineOfSight(this.x, this.y, t.x, t.y));

    if (visible) {
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      const desired = Math.atan2(t.y - this.y, t.x - this.x);
      this.aim = approachAngle(this.aim, desired, 6.2 * dt);

      let mx = 0;
      let my = 0;
      const strafe = Math.sin(g.elapsed * this.strafeFreq * 2 + this.strafePhase);
      if (d > 400) {
        mx = Math.cos(desired);
        my = Math.sin(desired);
      } else if (d < 185) {
        mx = -Math.cos(desired);
        my = -Math.sin(desired);
      } else {
        mx = Math.cos(desired + Math.PI / 2) * strafe;
        my = Math.sin(desired + Math.PI / 2) * strafe;
      }
      this.move(mx, my, this.reloading > 0 ? 0.5 : 1, dt);

      if (this.reloading <= 0 && this.fireTimer <= 0 && this.mag > 0) {
        const aligned = Math.abs(angleDiff(this.aim, desired)) < 0.17;
        if (aligned && g.hasLineOfSight(this.x, this.y, t.x, t.y)) {
          this.mag--;
          this.burstLeft--;
          g.shoot(this, { spread: 0.075, dmg: 17, speed: 1180 });
          this.fireTimer = 0.11 + Math.random() * 0.05;
          if (this.burstLeft <= 0) {
            this.burstLeft = randInt(3, 6);
            this.fireTimer = 0.6 + Math.random() * 0.7;
          }
        }
      }
      if (this.mag <= 0 && this.reloading <= 0) this.reloading = 2.4;
    } else {
      this.patrol(dt, g);
    }
  }

  acquire(g) {
    let best = null;
    let bestD = Infinity;
    for (const e of g.entities) {
      if (!e.alive || e.team === this.team) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > 780 || d >= bestD) continue;
      if (!g.hasLineOfSight(this.x, this.y, e.x, e.y)) continue;
      best = e;
      bestD = d;
    }
    this.target = best;
  }

  patrol(dt, g) {
    this.waypointTimer -= dt;
    const wp = this.waypoint;
    const reached = wp && Math.hypot(wp.x - this.x, wp.y - this.y) < 45;
    if (!wp || reached || this.waypointTimer <= 0) {
      const tx = rand(WORLD.border + 90, WORLD.w - WORLD.border - 90);
      const ty =
        this.team === 'tan'
          ? rand(WORLD.h * 0.16, WORLD.h * 0.66)
          : rand(WORLD.h * 0.34, WORLD.h * 0.84);
      this.waypoint = { x: tx, y: ty };
      this.waypointTimer = rand(4, 7);
    }
    const a = Math.atan2(this.waypoint.y - this.y, this.waypoint.x - this.x);
    this.aim = approachAngle(this.aim, a, 3 * dt);
    this.move(Math.cos(a), Math.sin(a), 0.62, dt);
  }
}
