export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
export function angleDiff(from, to) {
  let d = (to - from + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}

export function approachAngle(current, target, maxStep) {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

/** Push a circle-shaped body {x, y, r} out of an AABB in place. */
export function resolveCircleRect(p, radius, rect) {
  const cx = clamp(p.x, rect.x, rect.x + rect.w);
  const cy = clamp(p.y, rect.y, rect.y + rect.h);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > radius * radius) return;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * radius;
    p.y = cy + (dy / d) * radius;
    return;
  }
  // centre is inside the rect: eject along the shallowest axis
  const left = p.x - rect.x;
  const right = rect.x + rect.w - p.x;
  const top = p.y - rect.y;
  const bottom = rect.y + rect.h - p.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) p.x = rect.x - radius;
  else if (m === right) p.x = rect.x + rect.w + radius;
  else if (m === top) p.y = rect.y - radius;
  else p.y = rect.y + rect.h + radius;
}

/** First hit time in [0, 1] of segment a->b against an AABB, or Infinity. */
export function segRectT(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;

  for (let axis = 0; axis < 2; axis++) {
    const p = axis === 0 ? x1 : y1;
    const d = axis === 0 ? dx : dy;
    const min = axis === 0 ? rect.x : rect.y;
    const max = axis === 0 ? rect.x + rect.w : rect.y + rect.h;
    if (Math.abs(d) < 1e-9) {
      if (p < min || p > max) return Infinity;
    } else {
      let t1 = (min - p) / d;
      let t2 = (max - p) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/** First hit time in [0, 1] of segment a->b against a circle, or Infinity. */
export function segCircleT(x1, y1, x2, y2, cx, cy, cr) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const c = fx * fx + fy * fy - cr * cr;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return Infinity;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  const t2 = (-b + s) / (2 * a);
  if (t2 >= 0 && t2 <= 1) return t2;
  return Infinity;
}

/** Build (not fill) a rounded-rect path. */
export function pathRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
