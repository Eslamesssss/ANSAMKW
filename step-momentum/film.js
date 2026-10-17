// STEP — Make Brands Move: pure function of time. window.seek(t) paints frame t (see lib/motion.js).
// Timing is in beats (u) on the 120 BPM grid; docs/shotlist.md is the beat map this file follows.
// One 2-D world, one camera, one ball. The film is periodic: every state at u = 20 equals u = 0.
import * as M from './lib/motion.js';

const { W, H, E, prog, lerp, clamp, springU, springKeys, SPRING, font, layout, text, rrect, mix, TAU } = M;

const LOOP = 20;
const C = {
  bg: '#0B0F1A', dot: '#1A2133', card: '#121826', stroke: '#232B3D', ctl: '#1D2433', ctlHi: '#262E40',
  ink: '#F5F7FA', mute: '#8B94A8', dim: '#5A6378', key: '#C9CFDA', cobalt: '#0047FF', lime: '#C7FF00',
};
const DISPLAY = 'Display', UI = 'UI';
const R = 14;   // the ball

// ---------------------------------------------------------------- world layout (world px)
const TOG = { x: 0, y: 0, w: 84, h: 44, off: -20, on: 20, card: [-270, -56, 360, 112] };
const SL = { card: [560, -40, 680, 190], y: 95, t0: 600, t1: 1200, x0: 640, x1: 1160, kw: 20, kh: 44 };
const SL_BALL0 = SL.x0 - SL.kw / 2 - R - 1, SL_BALL1 = SL.x1 - SL.kw / 2 - R - 1, SL_BY = SL.y - 3 - R;
const CARDS = [
  ['STRATEGY', 'Set the direction.'],
  ['CREATIVE', 'Build the impact.'],
  ['PERFORMANCE', 'Drive growth.'],
].map(([title, body], i) => ({ title, body, x: 1180 + 140 * i, y: 230 + 130 * i, w: 440, h: 104, u: 6 + i }));
const CARD_LAND = [380, 380, 418].map((dx, i) => [CARDS[i].x + dx, CARDS[i].y - R]);
const MSG = { x: 1300, y: 650, w: 720, h: 250 };
const PILL = { x: 1886, y: 790, w: 104, h: 44 };
const FIELD = { x: 1330, y: 786, r: 1990, h: 52 };
const KB = { x: 1300, y: 930, w: 720, h: 320, clipY: MSG.y + MSG.h + 2 };
const KEY = { w: 58, h: 60, pitch: 68, gap: 10 };
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const ROW_X = [1325, 1359, 1427], ROW_Y = [950, 1020, 1090, 1160];
const RET = { x: 1850, y: 1160, w: 145, h: 60 };
function keyCenter(ch) {
  for (let r = 0; r < 3; r++) {
    const i = ROWS[r].indexOf(ch);
    if (i >= 0) return [ROW_X[r] + KEY.w / 2 + i * KEY.pitch, ROW_Y[r] + KEY.h / 2];
  }
}
const KEY_U = [10, 11, 12, 13], RET_U = 14, TYPED = 'STEP';
const WM = { x: 140, base: 820, size: 330, tagSize: 56, tagBase: 912 };

// ---------------------------------------------------------------- loop-safe springs
// The key list repeats every LOOP beats, so a spring chasing it has the same position and velocity
// at u and u + LOOP (the residue from two loops back is ~1e-9).
function loopKeys(u, keys, cfg) {
  const ext = [[-1e9, keys[keys.length - 1][1]]];
  for (const off of [-2 * LOOP, -LOOP, 0]) for (const [k, v] of keys) ext.push([k + off, v]);
  return springKeys(u, ext, cfg);
}
const CAM_SPRING = { stiffness: 110, damping: 21 };
const CAM_KEYS = [
  [2.0, [330, 30, Math.log(1.18)]],
  [2.75, [890, 70, Math.log(1.35)]],
  [4.3, [1040, 130, Math.log(1.3)]],
  [5.15, [1490, 390, Math.log(1.2)]],
  [7.3, [1610, 600, Math.log(1.15)]],
  [8.5, [1660, 905, Math.log(1.1)]],
  [14.2, [880, 590, Math.log(0.74)]],
  [17.55, [-80, 0, Math.log(2.0)]],
];
function camera(u) {
  const [cx, cy, lz] = loopKeys(u, CAM_KEYS, CAM_SPRING);
  return { cx, cy, z: Math.exp(lz) };
}
const CURSOR_KEYS = [[0.15, [16, 10]], [1.45, [236, 196]], [17.35, [12, 12]], [18.75, [112, 96]]];
const CLICKS = [1, 18.5];

// ---------------------------------------------------------------- the ball: one trajectory
// Flights are ballistic in their own beat window: x linear, y a parabola h above the chord.
// Each lands exactly on its beat, dwells DW beats (the contact squash), then the next flight leaves.
const DW = 0.12;
let FLIGHTS = null, WM_LAND = null;
function buildPath() {
  const kc = (ch) => keyCenter(ch);
  const pill = [PILL.x + PILL.w / 2, PILL.y - R];
  const ret = [RET.x + RET.w / 2 - 6, RET.y + RET.h / 2];
  FLIGHTS = [
    { a: [TOG.on, 0], b: [SL_BALL0, SL_BY], u0: 2, u1: 3, h: 170 },
    // u 3..5: the push (see ball()), then the release over the knob
    { a: [SL_BALL1, SL_BY], b: CARD_LAND[0], u0: 5, u1: 6, h: 170 },
    { a: CARD_LAND[0], b: CARD_LAND[1], u0: 6 + DW, u1: 7, h: 90 },
    { a: CARD_LAND[1], b: CARD_LAND[2], u0: 7 + DW, u1: 8, h: 90 },
    { a: CARD_LAND[2], b: pill, u0: 8 + DW, u1: 9, h: 200 },
    { a: pill, b: kc('S'), u0: 9 + DW, u1: 10, h: 120, top: true },
    { a: kc('S'), b: kc('T'), u0: 10 + DW, u1: 11, h: 85, top: true },
    { a: kc('T'), b: kc('E'), u0: 11 + DW, u1: 12, h: 70, top: true },
    { a: kc('E'), b: kc('P'), u0: 12 + DW, u1: 13, h: 110, top: true },
    { a: kc('P'), b: ret, u0: 13 + DW, u1: 14, h: 85, top: true },
    { a: ret, b: WM_LAND, u0: 14 + DW, u1: 16, h: 320 },
    { a: WM_LAND, b: [TOG.off, 0], u0: 17.5, u1: 19.5, h: 420 },
  ];
}
// landings: [beat, angle of the impact squash axis, amplitude, pivot at the contact point?]
const LANDS = [[3, 0.12, true], [6, 0.14, true], [7, 0.14, true], [8, 0.14, true], [9, 0.15, true],
  [10, 0.07, false], [11, 0.07, false], [12, 0.07, false], [13, 0.07, false], [14, 0.09, false],
  [16, 0.16, true], [19.5, 0.14, false]];

function hermite(s, x0, x1, m0, m1) {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * x0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * x1 + (s3 - s2) * m1;
}
// the push: lands slow, builds momentum (controlled acceleration), meets 100 % exactly on beat 5
const pushX = (u) => hermite(prog(u, 3, 5), SL_BALL0, SL_BALL1, 300, 840);

function flightAt(f, u) {
  const p = (u - f.u0) / (f.u1 - f.u0);
  const x = lerp(f.a[0], f.b[0], p);
  const y = lerp(f.a[1], f.b[1], p) - 4 * f.h * p * (1 - p);
  const d = 1 / ((f.u1 - f.u0) * M.GRID.period);   // per second
  const vx = (f.b[0] - f.a[0]) * d, vy = (f.b[1] - f.a[1] - 4 * f.h * (1 - 2 * p)) * d;
  return { x, y, vx, vy };
}
function ball(u) {
  let st = null;
  for (const f of FLIGHTS) if (u >= f.u0 && u < f.u1) { st = flightAt(f, u); st.fly = true; st.top = f.top; break; }
  if (!st) {
    if (u >= 19.5 || u < 1) st = { x: TOG.off, y: 0 };
    else if (u < 2) st = { x: lerp(TOG.off, TOG.on, springU(u, 1, SPRING.snappy)), y: 0 };
    else if (u >= 3 && u < 5) st = { x: pushX(u), y: SL_BY };
    else {
      // dwell after a landing: sit where the previous flight ended
      let last = FLIGHTS[0];
      for (const f of FLIGHTS) if (f.u1 <= u) last = f;
      st = { x: last.b[0], y: last.b[1] };
    }
  }
  // squash: a short compress-and-release at each contact, along the incoming direction
  st.sx = 1; st.sy = 1; st.rot = 0; st.pivot = false;
  for (const [lu, amp, pivot] of LANDS) {
    const since = ((u - lu) % LOOP + LOOP) % LOOP;
    const len = lu === 3 || lu === 16 || lu === 19.5 ? 0.5 : DW;
    if (since < len) {
      const k = len === DW ? Math.sin(Math.PI * since / DW) : Math.exp(-since * 9) * Math.cos(since * TAU * 1.6);
      st.sx = 1 + amp * k; st.sy = 1 - amp * k; st.pivot = pivot;
      return st;
    }
  }
  // anticipation as the toggle releases its knob
  if (u > 1.78 && u < 2) { const k = Math.sin(Math.PI * prog(u, 1.78, 2)); st.sx = 1 + 0.1 * k; st.sy = 1 - 0.1 * k; st.pivot = true; }
  if (st.fly) {   // stretch along the velocity, a little, never rubbery
    const sp = Math.hypot(st.vx, st.vy);
    const s = clamp(sp / 26000, 0, 0.1);
    st.sx = 1 + s; st.sy = 1 - s * 0.7; st.rot = Math.atan2(st.vy, st.vx);
  }
  return st;
}
function drawBall(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.pivot) { ctx.translate(0, R); ctx.scale(b.sx, b.sy); ctx.translate(0, -R); }
  else { ctx.rotate(b.rot); ctx.scale(b.sx, b.sy); }
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- derived interface state
const RESET = 19.9;   // everything but the toggle resets here, off camera
const live = (u) => u < RESET;
function sliderPct(u) {
  if (!live(u) || u < 3) return 0;
  if (u >= 5) return 1;
  const thumb = pushX(u) + R + 1 + SL.kw / 2;   // straight from the ball's x
  return clamp((thumb - SL.x0) / (SL.x1 - SL.x0));
}
const typedCount = (u) => (live(u) ? KEY_U.filter((k) => u >= k).length : 0);
// how hard a key/pill/card is being hit right now (0..1, decays after the impact)
const impact = (u, at, decay = 0.45) => (u >= at && u - at < 3 ? Math.exp(-(u - at) / decay) : 0);

// ---------------------------------------------------------------- drawing helpers
function card(ctx, x, y, w, h, r = 18, fillC = C.card, strokeC = C.stroke) {
  rrect(ctx, x, y, w, h, r); ctx.fillStyle = fillC; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = strokeC; ctx.stroke();
}
function label(ctx, s, x, y, size = 18, color = C.mute, align = 'left') {
  text(ctx, s, x, y, font(size, 600, UI), color, align, size * 0.2);
}

let DOTS = null;
function dotGrid(ctx, cam) {
  if (!DOTS) {
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const g = c.getContext('2d'); g.fillStyle = C.dot; g.beginPath(); g.arc(24, 24, 1.7, 0, TAU); g.fill();
    DOTS = ctx.createPattern(c, 'repeat');
  }
  DOTS.setTransform(new DOMMatrix([cam.z, 0, 0, cam.z, W / 2 - cam.cx * cam.z, H / 2 - cam.cy * cam.z]));
  ctx.fillStyle = DOTS; ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- components
function drawToggle(ctx, u) {
  const [x, y, w, h] = TOG.card;
  card(ctx, x, y, w, h, 22);
  label(ctx, 'BRAND MODE', x + 32, 7);
  // track: cobalt from the click on beat 1 until the cursor clicks it off on beat 18.5
  const on = u < 18.5 ? E.outCubic(prog(u, 1, 1.25)) : 1 - E.outCubic(prog(u, 18.5, 18.75));
  rrect(ctx, -TOG.w / 2, -TOG.h / 2, TOG.w, TOG.h, TOG.h / 2);
  ctx.fillStyle = mix(C.ctl, C.cobalt, on); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = mix(C.stroke, C.cobalt, on); ctx.stroke();
  // the empty knob slot reads as a faint ring while the ball is away
  const away = u >= 2 && u < 19.5;
  if (away) {
    const sx = u < 18.5 ? TOG.on : TOG.off;
    ctx.beginPath(); ctx.arc(sx, 0, R - 1, 0, TAU);
    ctx.lineWidth = 1.5; ctx.strokeStyle = on > 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)'; ctx.stroke();
  }
}

function drawSlider(ctx, u) {
  const [x, y, w, h] = SL.card;
  card(ctx, x, y, w, h, 22);
  label(ctx, 'MOMENTUM', x + 40, y + 42);
  const p = sliderPct(u);
  const kx = lerp(SL.x0, SL.x1, p);
  rrect(ctx, SL.t0, SL.y - 3, SL.t1 - SL.t0, 6, 3); ctx.fillStyle = C.ctl; ctx.fill();
  rrect(ctx, SL.t0, SL.y - 3, kx - SL.t0, 6, 3); ctx.fillStyle = C.cobalt; ctx.fill();
  // knob: compresses a touch when the ball lands against it, and when it hits the end stop
  const hit = 0.08 * impact(u, 3, 0.25) + 0.1 * impact(u, 5, 0.2);
  const kw = SL.kw * (1 - hit), kh = SL.kh * (1 + hit * 0.4);
  rrect(ctx, kx - kw / 2, SL.y - kh / 2, kw, kh, kw / 2); ctx.fillStyle = C.ink; ctx.fill();
  // value bubble, attached to the knob
  const done = u >= 5 && live(u) ? E.outCubic(prog(u, 5, 5.25)) : 0;
  const bw = 88, bh = 36, by = SL.y - 64;
  ctx.save();
  ctx.translate(kx, by + bh / 2);
  const pop = 1 + 0.08 * Math.sin(Math.PI * prog(u, 5, 5.35));
  ctx.scale(pop, pop);
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 10);
  ctx.moveTo(-7, bh / 2); ctx.lineTo(0, bh / 2 + 7); ctx.lineTo(7, bh / 2);
  ctx.fillStyle = mix(C.ctlHi, C.cobalt, done); ctx.fill();
  text(ctx, `${Math.round(p * 100)}%`, 0, 7, font(19, 650, UI), C.ink, 'center');
  ctx.restore();
}

function drawCards(ctx, u) {
  if (!live(u)) return;
  CARDS.forEach((c, i) => {
    const t0 = c.u - 0.55;
    if (u < t0) return;
    const k = springU(u, t0, SPRING.snappy);
    const a = E.outCubic(prog(u, t0, t0 + 0.22));
    // weight: a 4 px nudge when the ball steps on it
    const nudge = 4 * impact(u, c.u, 0.18) * Math.sin(Math.PI * clamp((u - c.u) / 0.3));
    const x = c.x - (1 - k) * 70, y = c.y + nudge;
    ctx.save();
    ctx.globalAlpha = a;
    card(ctx, x, y, c.w, c.h, 18);
    ctx.fillStyle = C.cobalt; ctx.fillRect(x + 28, y + 30, 8, 8);
    text(ctx, c.title, x + 54, y + 44, font(23, 700, UI), C.ink, 'left', 23 * 0.12);
    text(ctx, c.body, x + 54, y + 78, font(21, 400, UI), C.mute);
    text(ctx, `0${i + 1}`, x + c.w - 28, y + 42, font(15, 600, UI), C.dim, 'right', 1.5);
    ctx.restore();
  });
}

function drawKeyboard(ctx, u) {
  if (!live(u) || u < 9.05) return;
  const k = springU(u, 9.05, { stiffness: 260, damping: 26 });
  const dy = -(1 - k) * (KB.h + 40);
  ctx.save();
  ctx.beginPath(); ctx.rect(KB.x - 40, KB.clipY, KB.w + 80, 2000); ctx.clip();
  ctx.translate(0, dy);
  card(ctx, KB.x, KB.y, KB.w, KB.h, 22, '#0F1421');
  const keyFace = (x, y, w, h, s, hit, lit = 0) => {
    const press = 1 - 0.06 * hit;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(press, press);
    rrect(ctx, -w / 2, -h / 2, w, h, 10);
    ctx.fillStyle = mix(mix(C.ctl, C.cobalt, lit), C.cobalt, hit); ctx.fill();
    text(ctx, s, 0, 7, font(s.length > 1 ? 17 : 20, 500, UI), hit > 0.3 || lit > 0.5 ? C.ink : C.key, 'center');
    ctx.restore();
  };
  ROWS.forEach((row, r) => [...row].forEach((ch, i) => {
    const ki = TYPED.indexOf(ch);
    const hit = ki >= 0 ? impact(u, KEY_U[ki], 0.4) : 0;
    keyFace(ROW_X[r] + i * KEY.pitch, ROW_Y[r], KEY.w, KEY.h, ch, hit);
  }));
  keyFace(1325, 1090, 92, 60, 'shift', 0);
  keyFace(1903, 1090, 92, 60, 'delete', 0);
  keyFace(1325, 1160, 110, 60, '123', 0);
  keyFace(1445, 1160, 395, 60, 'space', 0);
  keyFace(RET.x, RET.y, RET.w, RET.h, 'return', impact(u, RET_U, 0.5));
  ctx.restore();
}

function drawMessage(ctx, u) {
  card(ctx, MSG.x, MSG.y, MSG.w, MSG.h, 22);
  ctx.fillStyle = C.cobalt; ctx.beginPath(); ctx.arc(MSG.x + 44, MSG.y + 66, 5, 0, TAU); ctx.fill();
  text(ctx, "WHAT'S NEXT?", MSG.x + 64, MSG.y + 78, font(34, 750, UI), C.ink, 'left', 34 * 0.02);
  const opened = live(u) ? springU(u, 9, SPRING.snappy) : 0;
  const sent = live(u) ? springU(u, RET_U + 0.12, { stiffness: 300, damping: 28 }) : 0;
  if (opened <= 0) {
    // the Reply pill, waiting
    const hit = 0;
    card(ctx, PILL.x, PILL.y + hit, PILL.w, PILL.h, PILL.h / 2, C.ctl, C.stroke);
    text(ctx, 'Reply', PILL.x + PILL.w / 2, PILL.y + 29, font(18, 550, UI), C.ink, 'center');
    return;
  }
  const n = typedCount(u);
  const str = TYPED.slice(0, n);
  const f = font(24, 650, UI), track = 24 * 0.06;
  const tw = layout(ctx, TYPED, f, track).width;
  // pill -> field (stretches left from its right edge), field -> bubble on send
  const bubbleW = tw + 48;
  const left0 = lerp(PILL.x, FIELD.x, opened);
  const left = lerp(left0, FIELD.r - bubbleW, sent);
  const top = lerp(lerp(PILL.y, FIELD.y, opened), FIELD.y - 4, sent);
  const h = lerp(lerp(PILL.h, FIELD.h, opened), 48, sent);
  const pillHit = 0.04 * impact(u, 9, 0.2);
  ctx.save();
  ctx.translate(0, pillHit * 60);
  card(ctx, left, top, FIELD.r - left, h, h / 2, mix(C.ctl, C.cobalt, sent), mix(C.stroke, C.cobalt, sent));
  // the pill's own label hands over to the field as it stretches
  if (opened < 0.6) {
    ctx.globalAlpha = 1 - opened / 0.6;
    text(ctx, 'Reply', FIELD.r - PILL.w / 2, top + 29, font(18, 550, UI), C.ink, 'center');
    ctx.globalAlpha = 1;
  }
  const tx = left + 24, ty = top + h / 2 + 9;
  if (str) text(ctx, str, tx, ty, f, C.ink, 'left', track);
  // caret: steady while typing, blinks on the half beat between keys
  if (opened > 0.8 && sent < 0.05) {
    const cw = str ? layout(ctx, str, f, track).width + 3 : 0;
    const blink = u < KEY_U[0] ? (Math.floor(u * 2) % 2 === 0) : true;
    if (blink) { ctx.fillStyle = C.cobalt; ctx.fillRect(tx + cw, top + 13, 2.5, h - 26); }
  }
  // send button: appears as the field opens, goes cobalt on return, folds into the bubble
  const sbA = prog(opened, 0.5, 1) * (1 - prog(sent, 0, 0.5));
  if (sbA > 0) {
    const act = impact(u, RET_U, 0.25) > 0 || u >= RET_U ? 1 : 0;
    const s = 1 + 0.18 * Math.sin(Math.PI * prog(u, RET_U, RET_U + 0.3));
    ctx.save(); ctx.globalAlpha = sbA;
    ctx.translate(FIELD.r - 26, top + h / 2); ctx.scale(s, s);
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fillStyle = act ? C.cobalt : C.ctlHi; ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, -7); ctx.moveTo(-6, -1); ctx.lineTo(0, -7); ctx.lineTo(6, -1); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

let WMG = null;
function measureWordmark(ctx) {
  const f = font(WM.size, 800, DISPLAY), track = -0.01 * WM.size;
  const L = layout(ctx, 'STEP', f, track);
  ctx.font = f;
  const cap = ctx.measureText('P').actualBoundingBoxAscent;
  const P = L.glyphs[3];
  WMG = { f, track, L, cap };
  WM_LAND = [WM.x + P.x + P.adv * 0.36, WM.base - cap - R];
}
function drawWordmark(ctx, u) {
  if (!live(u) || u < 14.9) return;
  const { f, L, cap } = WMG;
  ctx.save();
  ctx.beginPath(); ctx.rect(WM.x - 40, WM.base - cap - 400, 1400, cap + 400 + 2); ctx.clip();
  L.glyphs.forEach((g, i) => {
    const p = E.outQuint(prog(u, 14.95 + i * 0.12, 15.6 + i * 0.12));
    if (p <= 0) return;
    // the P takes the ball's weight on beat 16
    const land = i === 3 ? 6 * impact(u, 16, 0.15) * Math.sin(Math.PI * clamp((u - 16) / 0.35)) : 0;
    ctx.font = f; ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    ctx.fillText(g.ch, WM.x + g.x, WM.base + (1 - p) * (cap + 24) + land);
  });
  ctx.restore();
  // tagline: wipes in left to right under the wordmark
  const tp = E.outCubic(prog(u, 15.55, 16.25));
  if (tp > 0) {
    const tf = font(WM.tagSize, 700, DISPLAY), tt = WM.tagSize * 0.12;
    const tw = layout(ctx, 'MAKE BRANDS MOVE.', tf, tt).width;
    ctx.save(); ctx.beginPath(); ctx.rect(WM.x - 10, WM.tagBase - 80, (tw + 30) * tp, 120); ctx.clip();
    text(ctx, 'MAKE BRANDS MOVE.', WM.x + 6, WM.tagBase, tf, C.ink, 'left', tt);
    ctx.restore();
  }
  // the STEP Shift marker: a tiny lime stair after the wordmark (the only lime in the film)
  const mk = E.outBack(prog(u, 16, 16.4), 1.6);
  if (mk > 0) {
    const mx = WM.x + L.width + 12, my = WM.base, s = 9 * mk;
    ctx.fillStyle = C.lime;
    ctx.fillRect(mx, my - s, s, s);
    ctx.fillRect(mx + s, my - 2 * s, s, 2 * s);
    ctx.fillRect(mx + 2 * s, my - 3 * s, s, 3 * s);
  }
}

function drawCursor(ctx, u) {
  const [x, y] = loopKeys(u, CURSOR_KEYS, { stiffness: 90, damping: 17 });
  let press = 0;
  for (const c of CLICKS) press = Math.max(press, Math.sin(Math.PI * clamp((u - c + 0.06) / 0.28)));
  const s = 1.05 * (1 - 0.14 * press);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 25); ctx.lineTo(6.2, 19.4); ctx.lineTo(10.4, 28.6); ctx.lineTo(14.2, 26.9);
  ctx.lineTo(10.1, 17.9); ctx.lineTo(18, 17.6); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = C.bg; ctx.stroke();
  ctx.fillStyle = C.ink; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- hits (picture and sound share them)
const HITS = [
  [1, 'cursor clicks BRAND MODE on', 'tick+click', { gain: 0.32 }],
  [2, 'knob springs free', 'pop', { pitch: 'A5', to: 'D6', gain: 0.28 }],
  [3, 'ball lands on MOMENTUM', 'thud', { gain: 0.32 }],
  [3.5, 'slider 25', 'tick', { gain: 0.12 }],
  [4, 'slider 50', 'blip', { pitch: 'D6', gain: 0.12 }],
  [4.5, 'slider 75', 'tick', { gain: 0.12 }],
  [5, '100 % / release', 'bell+pop', { pitch: 'D6', gain: 0.26 }],
  [6, 'STRATEGY card + step', 'thud+blip', { pitch: 'A5', gain: 0.24 }],
  [7, 'CREATIVE card + step', 'thud+blip', { pitch: 'F5', gain: 0.24 }],
  [8, 'PERFORMANCE card + step', 'thud+blip', { pitch: 'D5', gain: 0.24 }],
  [9, 'ball strikes Reply', 'pop', { pitch: 'E5', to: 'A5', gain: 0.26 }],
  [9.35, 'keyboard emerges', 'whoosh', { len: 0.45, from: 400, to: 1800, gain: 0.14 }],
  [10, 'key S', 'click', { gain: 0.3 }],
  [11, 'key T', 'click', { gain: 0.3 }],
  [12, 'key E', 'click', { gain: 0.3 }],
  [13, 'key P', 'click', { gain: 0.3 }],
  [14, 'return / send', 'click+bell', { pitch: 'A5', gain: 0.3 }],
  [14.5, 'bubble contracts', 'blip', { pitch: 'D6', gain: 0.12 }],
  [15, 'pull back to the world', 'whoosh', { len: 0.7, from: 1600, to: 300, gain: 0.16 }],
  [16, 'ball lands on STEP / brand reveal', 'thud+bell', { pitch: 'D6', gain: 0.34 }],
  [17.5, 'ball launches home', 'pop', { pitch: 'D5', to: 'A5', gain: 0.22 }],
  [18.5, 'cursor clicks toggle off', 'tick', { gain: 0.2 }],
  [19.5, 'ball settles into the toggle', 'click+thud', { gain: 0.22 }],
];
// End-of-loop sounds also play one loop earlier, so their tails cross the wrap into frame 0.
for (const h of HITS.filter((h) => h[0] >= 18)) HITS.push([h[0] - LOOP, `${h[1]} (loop tail)`, h[2], h[3]]);

M.film({
  fonts: [font(100, 800, DISPLAY), font(56, 700, DISPLAY), font(40, 700, UI), font(40, 600, UI), font(40, 400, UI), font(40, 500, UI)],
  hits: HITS,
  samples: 12,
  shutter: 0.35,
  init(ctx) { measureWordmark(ctx); buildPath(); },
  draw(ctx, uRaw) {
    const u = ((uRaw % LOOP) + LOOP) % LOOP;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const cam = camera(u);
    dotGrid(ctx, cam);
    ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.cx, -cam.cy);
    drawWordmark(ctx, u);
    drawToggle(ctx, u);
    drawSlider(ctx, u);
    drawCards(ctx, u);
    drawKeyboard(ctx, u);
    drawMessage(ctx, u);
    drawBall(ctx, ball(u));
    drawCursor(ctx, u);
  },
});

// for checks from the console / scripts
window.STEP = { camera, ball: (u) => ball(((u % LOOP) + LOOP) % LOOP), sliderPct, typedCount, LOOP };
