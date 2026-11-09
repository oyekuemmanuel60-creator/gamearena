/* Game Arena players: realistic rigged footballers (Microsoft Rocketbox, MIT licence),
   motion-captured locomotion plus procedural football actions on the same skeleton.
   Body space: +z forward, +y up, +x the player's left. */
(function () {
'use strict';
const V3 = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);
const QI = new Q();

/* ---------- assets ---------- */
const A = { ready: false };
function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load ' + url)); i.src = url; }); }
// Models are stored as glTF JSON with the binary buffer as base64 in a custom field, rebuilt into a GLB in memory.
// This avoids data: URLs, which the published page's security policy blocks.
async function loadGLB(loader, url) {
  const r = await fetch(url); if (!r.ok) throw new Error('Could not load ' + url);
  const j = await r.json(); const b64 = j.buffers[0].b64; delete j.buffers[0].b64;
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const jsonBytes = new TextEncoder().encode(JSON.stringify(j));
  const jl = Math.ceil(jsonBytes.length / 4) * 4, bl = Math.ceil(bin.length / 4) * 4;
  const glb = new ArrayBuffer(12 + 8 + jl + 8 + bl); const dv = new DataView(glb); const u8 = new Uint8Array(glb);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.byteLength, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); u8.fill(0x20, 20, 20 + jl); u8.set(jsonBytes, 20);
  dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004E4942, true); u8.set(bin, 28 + jl);
  return new Promise((res, rej) => loader.parse(glb, '', res, (e) => rej(new Error('Could not read ' + url))));
}
async function loadAssets(base, onProgress) {
  const loader = new THREE.GLTFLoader();
  const files = ['sm03.gltf.json', 'sm02.gltf.json', 'anims.json', 'sm03_body_color.jpg', 'sm02_body_color.jpg', 'sm03_head_color.jpg', 'sm02_head_color.jpg', 'sm03_body_normal.jpg', 'sm02_body_normal.jpg', 'sm03_head_normal.jpg', 'sm02_head_normal.jpg', 'sm03_hair.png'];
  let done = 0; const tick = (x) => { done++; onProgress && onProgress(done / files.length); return x; };
  const [g3, g2, anims, b3, b2, h3, h2, n3, n2, hn3, hn2, hair] = await Promise.all([
    loadGLB(loader, base + 'sm03.gltf.json').then(tick), loadGLB(loader, base + 'sm02.gltf.json').then(tick),
    fetch(base + 'anims.json').then((r) => { if (!r.ok) throw new Error('Could not load animations'); return r.json(); }).then(tick),
    ...files.slice(3).map((f) => loadImage(base + f).then(tick))
  ]);
  const tex = (img, srgb = true) => { const t = new THREE.Texture(img); t.flipY = false; if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; t.needsUpdate = true; return t; };
  A.models = {
    sm03: { scene: g3.scene, body: b3, head: h3, bodyN: tex(n3, false), headN: tex(hn3, false), hair: tex(hair) },
    sm02: { scene: g2.scene, body: b2, head: h2, bodyN: tex(n2, false), headN: tex(hn2, false) }
  };
  A.clips = {};
  for (const name in anims) {
    const c = anims[name];
    const tracks = c.tr.map((t) => t.n.endsWith('.position') ? new THREE.VectorKeyframeTrack(t.n, t.t, t.v) : new THREE.QuaternionKeyframeTrack(t.n, t.t, t.v));
    A.clips[name] = new THREE.AnimationClip(name, c.d, tracks);
  }
  A.ready = true;
  return A;
}

/* ---------- texture painting: kits and skin tones ---------- */
const texCache = new Map();
function isSkin(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const sat = mx ? (mx - mn) / mx : 0;
  return r > 45 && r >= g && g >= b - 4 && (r - b) > 22 && sat > 0.16 && sat < 0.78 && !(sat > 0.7 && r > 150);
}
const isTrim = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return r > 140 && (mx - mn) / mx > 0.7 && g < 0.55 * r; };
function hexRGB(h) { const c = new THREE.Color(h); return [c.r * 255, c.g * 255, c.b * 255]; }
// skin: multiplier applied to skin pixels (1 = original tone)
function skinShift(d, i, tone) { d[i] = d[i] * tone[0]; d[i + 1] = d[i + 1] * tone[1]; d[i + 2] = d[i + 2] * tone[2]; }
const TONES = { natural: [1, 1, 1], deep: [0.62, 0.52, 0.47], darker: [0.47, 0.37, 0.32], warm: [0.82, 0.72, 0.64] };

function kitTexture(model, kit) {
  const key = [model, kit.shirt, kit.shorts, kit.socks, kit.trim, kit.boots, kit.number, kit.name, kit.tone, kit.sleeve || ''].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const img = A.models[model].body; const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, S, S);
  const im = x.getImageData(0, 0, S, S); const d = im.data;
  const shirt = hexRGB(kit.shirt), shorts = hexRGB(kit.shorts), socks = hexRGB(kit.socks), trim = hexRGB(kit.trim), boots = hexRGB(kit.boots), sleeve = hexRGB(kit.sleeve || kit.shirt);
  const tone = TONES[kit.tone] || TONES.natural;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const i = (py * S + px) * 4; const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const boot = py > 700 && ((px > 205 && px < 352) || (px > 672 && px < 820));
    if (boot) { if (lum < 0.45) { const k = 0.55 + lum; d[i] = boots[0] * k; d[i + 1] = boots[1] * k; d[i + 2] = boots[2] * k; } continue; }
    if (isSkin(r, g, b)) { skinShift(d, i, tone); continue; }
    let col;
    if (py < 205 && (px < 300 || px > 724)) col = shorts;
    else if (py > 312 && py < 570 && (px < 272 || px > 752)) col = (py < 345 || (py > 540)) ? trim : socks;
    else if (isTrim(r, g, b)) col = trim;
    else if ((px < 420 || px > 604) && py > 300 && py < 620) col = sleeve;
    else col = shirt;
    // keep a little of the baked fold shading, not the stripes
    const shade = 0.9 + 0.12 * (lum > 0.5 ? (lum - 0.75) : (lum - 0.15));
    d[i] = col[0] * shade; d[i + 1] = col[1] * shade; d[i + 2] = col[2] * shade;
  }
  x.putImageData(im, 0, 0);
  // clear the old sponsor, badge and maker marks, then add ours
  x.fillStyle = kit.shirt;
  for (const [rx, ry, rw, rh] of [[425, 610, 175, 90], [520, 566, 54, 54], [452, 578, 52, 26], [400, 196, 224, 230], [272, 340, 26, 120], [726, 340, 26, 120]]) x.fillRect(rx, ry, rw, rh);
  x.fillStyle = kit.shorts;
  for (const [rx, ry, rw, rh] of [[140, 130, 80, 70], [800, 130, 80, 70], [820, 170, 70, 30]]) x.fillRect(rx, ry, rw, rh);
  // Back: number and name (texture is upside down on the back panel)
  const contrast = kit.ink || '#ffffff';
  x.save(); x.translate(512, 300); x.rotate(Math.PI);
  x.fillStyle = contrast; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '800 150px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'; x.fillText(String(kit.number ?? 10), 0, 18);
  x.font = '700 34px "Arial Narrow", Arial, sans-serif'; x.fillText(String(kit.name || '').toUpperCase().slice(0, 12), 0, -96);
  x.restore();
  // Front: crest and chest logo
  x.fillStyle = contrast; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.beginPath(); x.arc(548, 594, 15, 0, Math.PI * 2); x.fillStyle = kit.trim; x.fill(); x.lineWidth = 3; x.strokeStyle = contrast; x.stroke();
  x.fillStyle = contrast; x.font = '800 40px "Arial Narrow", Arial, sans-serif'; x.fillText('GAME ARENA', 512, 652);
  x.font = '700 22px "Arial Narrow", Arial, sans-serif'; x.fillText(String(kit.number ?? 10), 175, 165); x.fillText(String(kit.number ?? 10), 850, 165);
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  texCache.set(key, t); return t;
}
function headTexture(model, tone) {
  const key = 'head|' + model + '|' + tone;
  if (texCache.has(key)) return texCache.get(key);
  const img = A.models[model].head; const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, S, S);
  const t0 = TONES[tone] || TONES.natural;
  if (tone !== 'natural') {
    const im = x.getImageData(0, 0, S, S); const d = im.data;
    for (let i = 0; i < d.length; i += 4) if (isSkin(d[i], d[i + 1], d[i + 2])) skinShift(d, i, t0);
    x.putImageData(im, 0, 0);
  }
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  texCache.set(key, t); return t;
}

/* ---------- poses (body-space parameters) ---------- */
function blankPose() {
  return {
    hipsY: 0, hipsYaw: 0, hipsPitch: 0, hipsRoll: 0,
    spinePitch: 0, spineYaw: 0, spineRoll: 0, headPitch: 0, headYaw: 0,
    L: { a: 0.02, b: 0.06, abd: 0.05, foot: 1.5 }, R: { a: 0.02, b: 0.06, abd: 0.05, foot: 1.5 },
    AL: { a: 0, b: 0.3, abd: 0.14 }, AR: { a: 0, b: 0.3, abd: 0.14 }
  };
}
const SCALARS = ['hipsY', 'hipsYaw', 'hipsPitch', 'hipsRoll', 'spinePitch', 'spineYaw', 'spineRoll', 'headPitch', 'headYaw'];
function mixPose(p, q, t, out) {
  out = out || blankPose();
  for (const k of SCALARS) out[k] = lerp(p[k], q[k], t);
  for (const l of ['L', 'R', 'AL', 'AR']) for (const k in p[l]) out[l][k] = lerp(p[l][k], q[l][k] ?? p[l][k], t);
  return out;
}
function keyframes(keys, u, build) { // keys: [[t, pose], ...]
  let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const k0 = keys[i], k1 = keys[i + 1]; const f = smooth(clamp((u - k0[0]) / (k1[0] - k0[0] || 1), 0, 1));
  return mixPose(k0[1], k1[1], f);
}
const P = {};
P.stand = () => { const p = blankPose(); return p; };
P.keeperReady = (t = 0) => {
  const p = blankPose(); const b = Math.sin(t * 7) * 0.01;
  p.hipsY = -0.2 + b; p.L.a = 0.6; p.R.a = 0.6; p.L.b = 1.15; p.R.b = 1.15; p.L.abd = 0.17; p.R.abd = 0.17; p.L.foot = 1.9; p.R.foot = 1.9;
  p.spinePitch = 0.42; p.headPitch = -0.38;
  p.AL.a = 1.05; p.AR.a = 1.05; p.AL.abd = 0.55; p.AR.abd = 0.55; p.AL.b = 1.15; p.AR.b = 1.15;
  return p;
};
P.jockey = (t = 0) => {
  const p = blankPose(); const b = Math.sin(t * 9) * 0.012;
  p.hipsY = -0.24 + b; p.L.a = 0.75; p.R.a = 0.35; p.L.b = 1.4; p.R.b = 1.15; p.L.abd = 0.26; p.R.abd = 0.3; p.L.foot = 2.0; p.R.foot = 1.9;
  p.spinePitch = 0.42; p.headPitch = -0.38; p.hipsYaw = 0.55; p.spineYaw = -0.3;
  p.AL.a = 0.35; p.AR.a = 0.2; p.AL.abd = 0.75; p.AR.abd = 0.7; p.AL.b = 0.9; p.AR.b = 0.9;
  return p;
};
// strike: kick with right foot unless leg = 'L'. u 0..1, contact at u = 0.5.
P.strike = (u, leg = 'R', style = 'driven') => {
  const sup = leg === 'R' ? 'L' : 'R'; const kA = leg === 'R' ? 'AR' : 'AL', oA = leg === 'R' ? 'AL' : 'AR'; const side = leg === 'R' ? -1 : 1;
  const mk = (a, b, abd, foot, lean, twist, arms, sa, sb, hy) => {
    const p = blankPose(); p[leg].a = a; p[leg].b = b; p[leg].abd = abd; p[leg].foot = foot;
    p[sup].a = sa; p[sup].b = sb; p[sup].abd = 0.06; p.spinePitch = lean; p.spineYaw = side * twist; p.hipsYaw = -side * twist * 0.8; p.hipsY = hy;
    p[oA].a = 0.45 * arms; p[oA].abd = 0.3 + 0.75 * arms; p[oA].b = 0.55; p[kA].a = -0.35 * arms; p[kA].abd = 0.3 + 0.6 * arms; p[kA].b = 0.45;
    p.headPitch = 0.2 + lean * 0.5; p.hipsRoll = side * 0.06 * arms; return p;
  };
  const lean = style === 'chip' ? -0.12 : style === 'finesse' ? 0.12 : style === 'pass' ? 0.1 : 0.22;
  const abd = style === 'finesse' || style === 'pass' ? 0.3 : 0.05;
  const backA = style === 'pass' ? -0.45 : style === 'chip' ? -0.6 : -0.75;
  const follow = style === 'pass' ? 0.55 : style === 'chip' ? 0.75 : style === 'finesse' ? 0.8 : 1.1;
  const keys = [
    [0, mk(0.15, 0.3, 0.05, 1.5, 0.08, 0, 0.2, 0.1, 0.25, -0.02)],
    [0.34, mk(backA, style === 'pass' ? 1.2 : 1.75, abd * 0.5, 1.9, lean * 0.6, 0.18, 1, 0.12, 0.35, -0.06)],
    [0.5, mk(0.35, 0.22, abd, style === 'pass' || style === 'finesse' ? 1.55 : 2.35, lean, 0.05, 1, 0.05, 0.42, -0.08)],
    [0.74, mk(follow, 0.35, abd * 0.7, 2.1, lean * 0.8, -0.22, 0.7, -0.05, 0.3, -0.04)],
    [1, mk(0.2, 0.4, 0.06, 1.6, 0.1, 0, 0.2, 0.08, 0.3, -0.02)]
  ];
  return keyframes(keys, u);
};
// goalkeeper dive in body space; the root roll is applied by the game. reach 0..1
P.dive = (reach, height = 'mid') => {
  const p = blankPose(); const up = height === 'high' ? 1 : height === 'low' ? 0.62 : 0.84;
  p.AL.a = lerp(0.7, Math.PI * 0.95 * up, reach); p.AR.a = lerp(0.7, Math.PI * 0.95 * up - 0.12, reach);
  p.AL.abd = lerp(0.6, 0.22, reach); p.AR.abd = lerp(0.6, 0.22, reach); p.AL.b = lerp(0.95, 0.12, reach); p.AR.b = lerp(0.95, 0.18, reach);
  p.L.a = lerp(0.6, 0.12, reach); p.R.a = lerp(0.6, -0.1, reach); p.L.b = lerp(1.15, 0.3, reach); p.R.b = lerp(1.15, 0.6, reach); p.L.abd = 0.08; p.R.abd = 0.12;
  p.spinePitch = lerp(0.42, 0.05, reach); p.headPitch = -0.15; p.hipsY = lerp(-0.2, 0, reach);
  return p;
};
P.block = (u) => { const p = P.keeperReady(); p.hipsY = lerp(-0.2, -0.45, u); p.L.a = lerp(0.6, 1.2, u); p.R.a = lerp(0.6, 0.15, u); p.L.b = lerp(1.15, 2.0, u); p.R.b = lerp(1.15, 0.25, u); p.R.abd = lerp(0.17, 0.75, u); p.AL.abd = lerp(0.6, 1.2, u); p.AR.abd = lerp(0.6, 1.2, u); p.AL.a = 0.4; p.AR.a = 0.4; p.AL.b = 0.3; p.AR.b = 0.3; return p; };
// hands to a ball at height y (metres): crouch for low balls, rise on the toes for high ones
P.catchAt = (y) => {
  const p = P.keeperReady(); const hy = clamp(y, 0.1, 2.4);
  p.hipsY = hy < 0.7 ? lerp(-0.5, -0.2, hy / 0.7) : hy > 1.7 ? lerp(-0.05, 0.12, (hy - 1.7) / 0.7) : -0.12;
  p.L.b = hy < 0.7 ? 1.7 : 0.6; p.R.b = p.L.b; p.L.a = hy < 0.7 ? 0.95 : 0.3; p.R.a = p.L.a; p.spinePitch = hy < 0.7 ? 0.6 : 0.2;
  const sh = 1.42 + p.hipsY * 0.9; const c = clamp((sh - hy) / 0.62, -1, 1);
  const a = Math.acos(c); p.AL.a = a; p.AR.a = a; p.AL.abd = 0.14; p.AR.abd = 0.14; p.AL.b = 0.25; p.AR.b = 0.25; p.headPitch = hy < 1 ? 0.4 : -0.2;
  return p;
};
P.catchBall = (h) => { const p = P.keeperReady(); p.hipsY = -0.1 + h * 0.08; p.L.b = 0.6; p.R.b = 0.6; p.L.a = 0.3; p.R.a = 0.3; p.AL.a = 1.25 + h * 0.55; p.AR.a = 1.25 + h * 0.55; p.AL.abd = 0.16; p.AR.abd = 0.16; p.AL.b = 0.6; p.AR.b = 0.6; return p; };
P.slide = (u) => {
  const p = blankPose();
  p.R.a = lerp(0.3, 0.5, u); p.R.b = lerp(0.6, 0.05, u); p.R.foot = 1.9;
  p.L.a = lerp(0.2, 0.12, u); p.L.b = lerp(0.6, 1.8, u); p.L.abd = 0.25;
  p.AL.a = lerp(0, -0.75, u); p.AL.abd = lerp(0.2, 0.55, u); p.AL.b = 0.3; p.AR.a = lerp(0, 0.45, u); p.AR.abd = lerp(0.2, 0.75, u); p.AR.b = 0.5;
  p.spinePitch = lerp(0.1, 0.4, u); p.headPitch = -0.35 * u;
  return p;
};
P.poke = (u) => { const p = P.jockey(); const s = Math.sin(clamp(u, 0, 1) * Math.PI); p.R.a = lerp(0.3, 1.0, s); p.R.b = lerp(0.85, 0.15, s); p.R.abd = lerp(0.2, 0.32, s); p.R.foot = 1.6; p.hipsYaw = lerp(0.3, -0.1, s); p.spinePitch = 0.3 + 0.1 * s; p.L.b = 1.05; return p; };
P.trap = (u) => { const p = blankPose(); const s = Math.sin(clamp(u, 0, 1) * Math.PI); p.R.a = 0.35 * s; p.R.b = 0.35 + 0.3 * s; p.R.abd = 0.25 * s; p.R.foot = 1.4; p.L.b = 0.3; p.hipsY = -0.05 * s; p.spinePitch = 0.2 * s; p.headPitch = 0.35 * s; p.AL.abd = 0.35; p.AR.abd = 0.35; return p; };
P.fall = (u) => { const p = P.slide(1); p.spinePitch = -0.2; p.AL.a = 1.2; p.AR.a = 1.2; p.L.b = 0.8; return p; };

/* ---------- character ---------- */
const B = (n) => 'Bip01_' + n;
const LEGS = { L: ['L_Thigh', 'L_Calf', 'L_Foot', 'L_Toe0'].map(B), R: ['R_Thigh', 'R_Calf', 'R_Foot', 'R_Toe0'].map(B) };
const ARMS = { AL: ['L_UpperArm', 'L_Forearm', 'L_Hand'].map(B), AR: ['R_UpperArm', 'R_Forearm', 'R_Hand'].map(B) };
const SPINE = ['Spine', 'Spine1', 'Spine2'].map(B);
const CONTROLLED = [B('Pelvis'), ...SPINE, B('Neck'), B('Head'), B('L_Clavicle'), B('R_Clavicle'), ...LEGS.L.slice(0, 3), ...LEGS.R.slice(0, 3), ...ARMS.AL.slice(0, 2), ...ARMS.AR.slice(0, 2)];
const LOCO = { idle: 'm_idle_breathe_01', walk: 'm_walk_neutral', jog: 'm_run_slow_01', run: 'm_run_neutral', sprint: 'm_run_fast_01' };
// approximate ground speed (m/s) of each locomotion clip at timeScale 1
const LOCO_SPEED = { walk: 1.45, jog: 3.4, run: 4.6, sprint: 6.6 };

const _q = new Q(), _q2 = new Q(), _v = new V3(), _v2 = new V3(), _e = new E(0, 0, 0, 'YXZ');
function legDir(swing, abd, side, out) { const ca = Math.cos(abd); return out.set(side * Math.sin(abd), -Math.cos(swing) * ca, Math.sin(swing) * ca); }

class Player {
  constructor(opts = {}) {
    const model = opts.model || 'sm03';
    this.kit = { shirt: '#ffb547', shorts: '#13222a', socks: '#ffb547', trim: '#13222a', boots: '#111111', number: 10, name: '', tone: 'natural', ink: '#13222a', ...opts.kit };
    this.modelName = model;
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    const m = THREE.SkeletonUtils.clone(A.models[model].scene);
    m.rotation.y = Math.PI / 2; this.root.add(m); this.model = m;
    this.bones = {};
    m.traverse((o) => {
      if (o.isBone || o.name.startsWith('Bip01')) this.bones[o.name] = o;
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    this.meshes = []; m.traverse((o) => { if (o.isMesh) this.meshes.push(o); });
    this.applyLook(opts.gloves);
    // rest data (model space)
    m.updateMatrixWorld(true);
    const inv = new Q(); m.getWorldQuaternion(inv).invert();
    this.rest = {};
    for (const n in this.bones) { const b = this.bones[n]; const w = new Q(); b.getWorldQuaternion(w); w.premultiply(inv); this.rest[n] = { local: b.quaternion.clone(), world: w, pos: b.position.clone() }; }
    const wp = (n) => { const v = new V3(); this.bones[n].getWorldPosition(v); return m.worldToLocal(v); };
    for (const ch of [...Object.values(LEGS), ...Object.values(ARMS)]) for (let i = 0; i < ch.length - 1; i++) this.rest[ch[i]].dir = wp(ch[i + 1]).sub(wp(ch[i])).normalize();
    this.rootRestY = this.bones.Bip01.position.y;
    // animation
    this.mixer = new THREE.AnimationMixer(m);
    this.loco = {};
    for (const k in LOCO) { const a = this.mixer.clipAction(A.clips[LOCO[k]]); a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0); this.loco[k] = a; }
    this.oneShot = null;
    this.speed = 0; this.phaseSync = 0;
    // procedural overlay
    this.proc = null; this.procW = 0; this.procTarget = 0; this.procRate = 10;
    this.procLocal = {}; for (const n of CONTROLLED) this.procLocal[n] = new Q();
    this.procRootY = 0;
    this.heading = 0; this.pos = new V3(); this.vel = new V3();
  }
  applyLook(gloves) {
    const M = A.models[this.modelName];
    for (const o of this.meshes) {
      const n = o.material.name;
      if (/body/.test(n)) o.material = new THREE.MeshStandardMaterial({ map: kitTexture(this.modelName, this.kit), normalMap: M.bodyN, roughness: 0.78, metalness: 0, name: n, skinning: true });
      else if (/head/.test(n)) o.material = new THREE.MeshStandardMaterial({ map: headTexture(this.modelName, this.kit.tone), normalMap: M.headN, roughness: 0.62, metalness: 0, name: n, skinning: true });
      else if (/opacity/.test(n)) { o.material = new THREE.MeshStandardMaterial({ map: M.hair, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8, name: n, skinning: true }); o.castShadow = false; }
    }
    if (gloves && !this.gloves) {
      const gm = new THREE.MeshStandardMaterial({ color: gloves, roughness: 0.55 });
      this.gloves = [];
      for (const s of ['L', 'R']) { const g = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), gm); g.scale.set(1.5, 1.1, 0.8); g.position.set(0.06, 0, 0); g.castShadow = true; this.bones[B(s + '_Hand')].add(g); this.gloves.push(g); }
    }
  }
  setKit(kit) { Object.assign(this.kit, kit); this.applyLook(); }
  // locomotion blending by ground speed (m/s)
  setSpeed(sp) { this.speed = sp; }
  playOnce(name, { fade = 0.25, loop = false, timeScale = 1 } = {}) {
    if (this.oneShot) this.oneShot.fadeOut(fade);
    const a = this.mixer.clipAction(A.clips[name]); a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.timeScale = timeScale; a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
    this.oneShot = a; return a;
  }
  stopOnce(fade = 0.3) { if (this.oneShot) { this.oneShot.fadeOut(fade); this.oneShot = null; } }
  // procedural action: pose function f(t) evaluated each frame; weight eases in
  act(fn, { rate = 12 } = {}) { this.proc = fn; this.procTarget = 1; this.procRate = rate; }
  release(rate = 6) { this.procTarget = 0; this.procRate = rate; }
  update(dt) {
    // locomotion weights
    const sp = this.speed; const w = { idle: 0, walk: 0, jog: 0, run: 0, sprint: 0 };
    const order = [['idle', 0], ['walk', 1.4], ['jog', 3.2], ['run', 4.6], ['sprint', 6.6]];
    if (sp <= 0.05) w.idle = 1;
    else {
      let i = 0; while (i < order.length - 2 && sp > order[i + 1][1]) i++;
      const [k0, s0] = order[i], [k1, s1] = order[i + 1]; const f = clamp((sp - s0) / (s1 - s0), 0, 1); w[k0] = 1 - f; w[k1] = f;
    }
    const oneW = this.oneShot ? this.oneShot.getEffectiveWeight() : 0;
    for (const k in this.loco) {
      const a = this.loco[k]; a.setEffectiveWeight(w[k] * (1 - oneW));
      if (k !== 'idle') a.timeScale = sp > 0.1 ? clamp(sp / LOCO_SPEED[k], 0.6, 1.6) : 1;
    }
    // keep run cycles in step with each other
    const lead = w.sprint > 0.5 ? 'sprint' : w.run > 0.5 ? 'run' : w.jog > 0.5 ? 'jog' : 'walk';
    const L = this.loco[lead]; const ph = (L.time / L.getClip().duration) % 1;
    for (const k of ['walk', 'jog', 'run', 'sprint']) if (k !== lead) { const a = this.loco[k]; a.time = ph * a.getClip().duration; }
    this.mixer.update(dt);
    // procedural overlay
    this.procW += (this.procTarget - this.procW) * (1 - Math.exp(-this.procRate * dt));
    if (this.procW < 0.002 && this.procTarget === 0) { this.procW = 0; this.proc = null; }
    if (this.proc && this.procW > 0) {
      const pose = this.proc(dt);
      this.computeProc(pose);
      for (const n of CONTROLLED) this.bones[n].quaternion.slerp(this.procLocal[n], this.procW);
      const rb = this.bones.Bip01; rb.position.y = lerp(rb.position.y, this.rootRestY + this.procRootY, this.procW);
    }
    this.root.position.set(this.pos.x, this.root.position.y, this.pos.z);
    this.root.rotation.y = this.heading;
  }
  // compute local quaternions for a body-space pose without touching the scene graph
  computeProc(p) {
    const R = this.rest, W = {};
    const local = (n, world) => { const par = this.bones[n].parent.name; const pw = W[par] || R[par].world; this.procLocal[n].copy(pw).invert().multiply(world); W[n] = world.clone(); };
    const hOff = new Q().setFromEuler(_e.set(p.hipsPitch, p.hipsYaw, p.hipsRoll, 'YXZ'));
    const sAll = new Q().setFromEuler(_e.set(p.spinePitch, p.spineYaw, p.spineRoll, 'YXZ'));
    const hd = new Q().setFromEuler(_e.set(p.headPitch, p.headYaw, 0, 'YXZ'));
    local(B('Pelvis'), new Q().copy(hOff).multiply(R[B('Pelvis')].world));
    SPINE.forEach((n, i) => { const f = QI.clone().slerp(sAll, (i + 1) / 3); local(n, new Q().copy(hOff).multiply(f).multiply(R[n].world)); });
    const chest = new Q().copy(hOff).multiply(sAll);
    local(B('Neck'), new Q().copy(chest).multiply(QI.clone().slerp(hd, 0.4)).multiply(R[B('Neck')].world));
    local(B('Head'), new Q().copy(chest).multiply(hd).multiply(R[B('Head')].world));
    local(B('L_Clavicle'), new Q().copy(chest).multiply(R[B('L_Clavicle')].world));
    local(B('R_Clavicle'), new Q().copy(chest).multiply(R[B('R_Clavicle')].world));
    const setDir = (n, dir, frame) => { _q.setFromUnitVectors(R[n].dir, dir.normalize()); local(n, new Q().copy(frame).multiply(_q).multiply(R[n].world)); };
    for (const k of ['L', 'R']) {
      const l = p[k], side = k === 'L' ? 1 : -1, ch = LEGS[k];
      setDir(ch[0], legDir(l.a, l.abd, side, new V3()), hOff);
      setDir(ch[1], legDir(l.a - l.b, l.abd * 0.6, side, new V3()), hOff);
      setDir(ch[2], legDir(l.a - l.b + l.foot, 0, side, new V3()), hOff);
    }
    for (const k of ['AL', 'AR']) {
      const a = p[k], side = k === 'AL' ? 1 : -1, ch = ARMS[k];
      setDir(ch[0], legDir(a.a, a.abd, side, new V3()), chest);
      setDir(ch[1], legDir(a.a + a.b, a.abd * 0.5, side, new V3()), chest);
    }
    this.procRootY = p.hipsY;
  }
  // world position of a named bone (for contact checks: feet, hands, head)
  bonePos(name, out = new V3()) { this.bones[B(name)].getWorldPosition(out); return out; }
}

window.GAPlayers = { loadAssets, Player, P, blankPose, mixPose, A, kitTexture };
})();
