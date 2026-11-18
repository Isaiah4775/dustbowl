import { TAU, clamp, pathRoundRect, rand } from './util.js';

export const WORLD = { w: 1800, h: 1300, border: 30 };
export const TEAM_COLOR = { blue: '#4f9dff', tan: '#ff8a4d' };
export const TEAM_DARK = { blue: '#1d4f8a', tan: '#8c4223' };
export const MATCH_TIME = 210;
export const TARGET_SCORE = 25;

export function buildLevel() {
  const obstacles = [];
  const add = (t, x, y, w, h) => obstacles.push({ t, x, y, w, h });

  // arena walls
  add('border', 0, 0, WORLD.w, WORLD.border);
  add('border', 0, WORLD.h - WORLD.border, WORLD.w, WORLD.border);
  add('border', 0, 0, WORLD.border, WORLD.h);
  add('border', WORLD.w - WORLD.border, 0, WORLD.border, WORLD.h);

  // top half of the field; mirrored to the bottom half
  const half = [
    ['crate', 180, 170, 100, 100],
    ['crate', 288, 188, 80, 80],
    ['barrel', 470, 150, 56, 56],
    ['barrel', 540, 205, 56, 56],
    ['sand', 650, 150, 220, 44],
    ['wall', 980, 140, 40, 250],
    ['crate', 1120, 220, 110, 110],
    ['crate', 1240, 252, 80, 80],
    ['sand', 1420, 160, 44, 200],
    ['barrel', 1552, 290, 56, 56],
    ['wall', 330, 400, 40, 180],
    ['crate', 150, 420, 96, 96],
    ['crate', 620, 360, 120, 80],
    ['barrel', 762, 402, 56, 56],
    ['sand', 830, 470, 200, 44],
    ['wall', 1220, 420, 40, 170],
    ['crate', 1380, 430, 100, 100],
  ];
  for (const [t, x, y, w, h] of half) {
    add(t, x, y, w, h);
    add(t, x, WORLD.h - y - h, w, h);
  }

  // centre pieces (not mirrored)
  add('crate', 830, 600, 140, 100);
  add('barrel', 760, 640, 56, 56);
  add('barrel', 1000, 650, 56, 56);
  add('wall', 640, 560, 40, 180);

  const blueSpawns = [
    { x: 240, y: 1180 },
    { x: 520, y: 1200 },
    { x: 900, y: 1190 },
    { x: 1280, y: 1200 },
    { x: 1570, y: 1180 },
  ];
  const tanSpawns = [
    { x: 240, y: 110 },
    { x: 520, y: 100 },
    { x: 900, y: 105 },
    { x: 1280, y: 110 },
    { x: 1570, y: 110 },
  ];

  const pickups = [
    { type: 'ammo', x: 92, y: 650 },
    { type: 'ammo', x: 1708, y: 650 },
    { type: 'med', x: 900, y: 330 },
    { type: 'med', x: 900, y: 970 },
  ];

  return { obstacles, blueSpawns, tanSpawns, pickups };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeStaticCanvas(level) {
  const c = document.createElement('canvas');
  c.width = WORLD.w;
  c.height = WORLD.h;
  const g = c.getContext('2d');
  const rng = mulberry32(20261118);

  // base dirt
  const base = g.createLinearGradient(0, 0, WORLD.w, WORLD.h);
  base.addColorStop(0, '#c4b088');
  base.addColorStop(0.5, '#bcaa7d');
  base.addColorStop(1, '#cbb68c');
  g.fillStyle = base;
  g.fillRect(0, 0, WORLD.w, WORLD.h);

  // broad tonal patches
  const patchColors = ['#b09b6e', '#cdba90', '#a9956a', '#bda87c', '#c9b284'];
  for (let i = 0; i < 150; i++) {
    const x = rng() * WORLD.w;
    const y = rng() * WORLD.h;
    const r = 70 + rng() * 240;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, patchColors[Math.floor(rng() * patchColors.length)]);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.16 + rng() * 0.18;
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;

  // gravel
  for (let i = 0; i < 5200; i++) {
    const x = rng() * WORLD.w;
    const y = rng() * WORLD.h;
    const s = rng() * 1.8 + 0.4;
    g.fillStyle = rng() < 0.5 ? 'rgba(90,78,54,0.16)' : 'rgba(255,246,220,0.2)';
    g.fillRect(x, y, s, s);
  }

  // dry grass tufts
  g.lineWidth = 1.4;
  for (let i = 0; i < 420; i++) {
    const x = rng() * WORLD.w;
    const y = rng() * WORLD.h;
    const h = 4 + rng() * 8;
    g.strokeStyle = rng() < 0.5 ? 'rgba(126,128,80,0.4)' : 'rgba(104,108,64,0.32)';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 2 + rng() * 4, y - h);
    g.stroke();
  }

  // tyre ruts
  g.strokeStyle = 'rgba(70,58,38,0.12)';
  for (let i = 0; i < 6; i++) {
    const y = 120 + i * 205 + rng() * 40;
    g.lineWidth = 10 + rng() * 8;
    g.beginPath();
    g.moveTo(-20, y);
    g.bezierCurveTo(WORLD.w * 0.3, y - 70, WORLD.w * 0.7, y + 70, WORLD.w + 20, y - 20);
    g.stroke();
  }

  // faded centre markings
  g.save();
  g.globalAlpha = 0.16;
  g.strokeStyle = '#fdf6e0';
  g.lineWidth = 5;
  g.setLineDash([26, 20]);
  g.beginPath();
  g.arc(WORLD.w / 2, WORLD.h / 2, 200, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  g.beginPath();
  g.moveTo(WORLD.w / 2 - 40, WORLD.h / 2);
  g.lineTo(WORLD.w / 2 + 40, WORLD.h / 2);
  g.stroke();
  g.restore();

  drawSpawnZone(g, 60, 980, WORLD.w - 120, 250, TEAM_COLOR.blue, 'BLUE DEPLOY');
  drawSpawnZone(g, 60, 70, WORLD.w - 120, 250, TEAM_COLOR.tan, 'TAN DEPLOY');

  for (const o of level.obstacles) drawObstacle(g, o, rng);

  return c;
}

function drawSpawnZone(g, x, y, w, h, color, label) {
  g.save();
  g.globalAlpha = 0.07;
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 0.32;
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.setLineDash([22, 16]);
  g.strokeRect(x + 8, y + 8, w - 16, h - 16);
  g.setLineDash([]);
  g.globalAlpha = 0.26;
  g.fillStyle = color;
  g.font = '800 44px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, x + w / 2, y + h / 2);
  g.restore();
}

function drawObstacle(g, o, rng) {
  const { t, x, y, w, h } = o;

  // drop shadow
  g.save();
  g.fillStyle = 'rgba(0, 0, 0, 0.22)';
  if (t === 'barrel') {
    g.beginPath();
    g.ellipse(x + w / 2 + 7, y + h / 2 + 8, w * 0.55, h * 0.52, 0, 0, TAU);
    g.fill();
  } else {
    pathRoundRect(g, x + 7, y + 9, w, h, 4);
    g.fill();
  }
  g.restore();

  if (t === 'border') {
    g.fillStyle = '#4b4a3f';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    g.lineWidth = 8;
    for (let i = -h; i < w; i += 46) {
      g.beginPath();
      g.moveTo(x + i, y + h);
      g.lineTo(x + i + h, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    g.lineWidth = 3;
    g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    return;
  }

  if (t === 'crate') {
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, '#a97a46');
    grd.addColorStop(1, '#8a6034');
    g.fillStyle = grd;
    pathRoundRect(g, x, y, w, h, 5);
    g.fill();
    g.strokeStyle = '#5e3f21';
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = 'rgba(70, 44, 20, 0.4)';
    g.lineWidth = 2;
    const step = Math.max(22, h / 4);
    for (let yy = y + step; yy < y + h - 4; yy += step) {
      g.beginPath();
      g.moveTo(x + 4, yy);
      g.lineTo(x + w - 4, yy);
      g.stroke();
    }
    g.strokeStyle = 'rgba(78, 50, 24, 0.55)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x + 6, y + h - 6);
    g.lineTo(x + w - 6, y + 6);
    g.stroke();
    g.fillStyle = '#3d2f1d';
    const cs = 9;
    g.fillRect(x + 2, y + 2, cs, 3);
    g.fillRect(x + 2, y + 2, 3, cs);
    g.fillRect(x + w - cs - 2, y + 2, cs, 3);
    g.fillRect(x + w - 5, y + 2, 3, cs);
    g.fillRect(x + 2, y + h - 5, cs, 3);
    g.fillRect(x + 2, y + h - cs - 2, 3, cs);
    g.fillRect(x + w - cs - 2, y + h - 5, cs, 3);
    g.fillRect(x + w - 5, y + h - cs - 2, 3, cs);
    return;
  }

  if (t === 'wall') {
    const grd = g.createLinearGradient(x, y, x + w, y + h);
    grd.addColorStop(0, '#777a63');
    grd.addColorStop(1, '#5d6049');
    g.fillStyle = grd;
    pathRoundRect(g, x, y, w, h, 4);
    g.fill();
    g.strokeStyle = '#3f4232';
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    g.lineWidth = 2;
    if (w > h) {
      for (let xx = x + 60; xx < x + w - 10; xx += 60) {
        g.beginPath();
        g.moveTo(xx, y + 4);
        g.lineTo(xx, y + h - 4);
        g.stroke();
      }
    } else {
      for (let yy = y + 60; yy < y + h - 10; yy += 60) {
        g.beginPath();
        g.moveTo(x + 4, yy);
        g.lineTo(x + w - 4, yy);
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + 8, y + 6);
    g.lineTo(x + w - 8, y + 6);
    g.stroke();
    return;
  }

  if (t === 'sand') {
    g.fillStyle = '#8b7c55';
    pathRoundRect(g, x, y, w, h, 4);
    g.fill();
    const rows = Math.max(1, Math.round(h / 22));
    const cols = Math.max(1, Math.round(w / 44));
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const jx = (rng() - 0.5) * 3;
        const jy = (rng() - 0.5) * 2;
        g.fillStyle = rng() < 0.5 ? '#b9a97f' : '#ac9b70';
        pathRoundRect(g, x + c * cw + 1.5 + jx, y + r * ch + 1.5 + jy, cw - 3, ch - 3, 6);
        g.fill();
        g.strokeStyle = 'rgba(70, 60, 38, 0.35)';
        g.lineWidth = 1;
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(50, 44, 28, 0.5)';
    g.lineWidth = 2.5;
    pathRoundRect(g, x, y, w, h, 5);
    g.stroke();
    return;
  }

  if (t === 'barrel') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rad = w / 2;
    const grd = g.createRadialGradient(cx - rad * 0.3, cy - rad * 0.35, rad * 0.15, cx, cy, rad);
    grd.addColorStop(0, '#7c8a68');
    grd.addColorStop(1, '#3f4a36');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, rad, 0, TAU);
    g.fill();
    g.strokeStyle = '#2b3325';
    g.lineWidth = 2.5;
    g.stroke();
    g.strokeStyle = 'rgba(217, 180, 74, 0.85)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy, rad * 0.72, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, rad * 0.45, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.18)';
    g.beginPath();
    g.arc(cx - rad * 0.3, cy - rad * 0.35, rad * 0.16, 0, TAU);
    g.fill();
    return;
  }
}
