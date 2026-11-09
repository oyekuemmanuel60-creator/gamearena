(() => {
'use strict';
const $ = (s) => document.querySelector(s);
if (!window.THREE || !THREE.GLTFLoader || !THREE.SkeletonUtils || !window.GAPlayers) {
  const l = $('#loading'); if (l) l.innerHTML = 'The 3D engine did not load.<small>Check your connection and reload the page.</small>';
  return;
}
const { Player, P, loadAssets } = GAPlayers;
const V3 = THREE.Vector3;

/* ---------- helpers ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const fmt = (n) => Math.round(n).toLocaleString('en-NG');
const today = () => new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180;
const hlen = (v) => Math.hypot(v.x, v.z);
const rotY = (v, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return new V3(v.x * c + v.z * s, 0, -v.x * s + v.z * c); }; // +ang turns toward the left of the vector
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let NOW = 0;

/* ---------- rules ---------- */
const HL = 20, HW = 12, GW = 5, GH = 2, ND = 1.1, BR = 0.11, G = 9.81;
const POSITIONS = {
  GK: { name: 'Goalkeeper', main: 'keeping', num: 1, weights: { keeping: 0.75, passing: 0.15, defending: 0.1, shooting: 0 }, blurb: 'Position on the angle, get set, and time your dive.' },
  DEF: { name: 'Defender', main: 'defending', num: 4, weights: { defending: 0.6, passing: 0.25, shooting: 0.1, keeping: 0.05 }, blurb: 'Jockey, show them wide, and tackle when the ball is exposed.' },
  MID: { name: 'Midfielder', main: 'passing', num: 8, weights: { passing: 0.55, shooting: 0.2, defending: 0.2, keeping: 0.05 }, blurb: 'Weight your passes and play through the lines.' },
  ST: { name: 'Striker', main: 'shooting', num: 9, weights: { shooting: 0.6, passing: 0.25, defending: 0.1, keeping: 0.05 }, blurb: 'Set the ball, open your body, and strike it clean.' }
};
const ATTRS = { shooting: 'Shooting', passing: 'Passing', defending: 'Defending', keeping: 'Goalkeeping' };
const LOOKS = [
  { model: 'sm03', tone: 'deep', label: 'Locs, brown skin' },
  { model: 'sm03', tone: 'darker', label: 'Locs, dark skin' },
  { model: 'sm02', tone: 'darker', label: 'Short hair, dark skin' },
  { model: 'sm02', tone: 'deep', label: 'Short hair, brown skin' }
];
const DRILLS = {
  match: {
    name: 'Match play', attr: 'shooting', pos: 'ST', unit: '8 attacks', btn: ['Shoot', 'Pass / call', 'Through / run'],
    desc: '3 v 2 attacks with two AI teammates. Lose your marker, call for the ball, beat the offside line and finish. Teammates only pass when you ask.',
    controls: [],
    tips: ['Off the ball, your ring is red when you are marked and green when you are open. The blue ring shows the nearest good space.', 'Call for the ball to your feet (pass button) or into space ahead of you (through button) once you are open.', 'Stay level with the last defender until the pass is played, then run. Going early is offside.', 'Do not sprint at a defender with the ball. Slow down, shift it, or pass and call for the one-two.', 'Aim with the direction keys: the reticle on the goal shows where the shot goes. Red means wide or over.']
  },
  finishing: {
    name: 'Finishing', attr: 'shooting', pos: 'ST', unit: '10 chances', btn: ['Shoot', 'Finesse', 'Chip'],
    desc: 'Edge-of-box strikes, one-on-ones, lay-offs, tight angles and through balls. A real keeper reads your body.',
    controls: [['Move and dribble', 'W A S D', 'Left stick'], ['Sprint (bigger touches)', 'Shift', 'RT'], ['Driven shot: hold for power, release', 'J or Space', 'A'], ['Finesse curler', 'K', 'X'], ['Chip', 'L', 'Y']],
    tips: ['Aim as you release: hold a direction, or point the mouse in Mouse aim. With no aim, the ball goes where your body faces.', 'Set the ball first. It has to be just ahead of your kicking foot, or the contact is poor.', 'Open your body to the target. Shooting across yourself sprays the ball.', 'Over 75% power on a driven shot makes it rise and lose accuracy. Find the green zone.', 'Shooting at full sprint or with your weaker foot costs accuracy. Slow down a step and use your strong foot when you can.', 'Finesse bends the ball back in. Aim outside the far post and let it curl. Chip when the keeper comes off his line.']
  },
  saves: {
    name: 'Goalkeeping', attr: 'keeping', pos: 'GK', unit: '10 shots', btn: ['Dive', 'Rush', 'Spread'],
    desc: 'Edge-of-box shots, one-on-ones, angled drives and penalties. Shooters punish a keeper who moves early.',
    controls: [['Position', 'W A S D', 'Left stick'], ['Dive toward the stick (no stick = catch at body)', 'J or Space', 'A'], ['Rush off the line (hold)', 'K', 'X'], ['Spread to block a one-on-one', 'L', 'Y']],
    tips: ['Stand on the line between the ball and the middle of your goal, a step or two off your line.', 'Stop moving as the shooter plants his foot. A set keeper reacts faster.', 'Dive after the strike, not before. Shooters read early dives and go the other way.', 'Come off your line early in one-on-ones and spread when he is about to shoot.', 'Your real hands make the save. A full stretch reaches the corners only if you go in time.']
  },
  tackling: {
    name: 'Defending', attr: 'defending', pos: 'DEF', unit: '8 attacks', btn: ['Tackle', 'Jockey', 'Slide'],
    desc: 'One-on-one against a dribbler who feints, cuts and knocks it past you. Fouls and cards count against you.',
    controls: [['Move', 'W A S D', 'Left stick'], ['Sprint (cannot jockey)', 'Shift', 'RT'], ['Jockey: side-on, face the attacker (hold)', 'K', 'X or LT'], ['Standing tackle', 'J or Space', 'A'], ['Slide tackle', 'L', 'Y']],
    tips: ['Jockey to stay balanced. You move slower but react instantly to feints.', 'Stay goal-side, about two metres off. Too tight and he knocks it past you.', 'Tackle when the ball leaves his feet after a touch, not when it is under his boot.', 'Slide only when the ball is loose and you come from the side. From behind is a foul and a card.', 'Showing him wide counts. Contain him long enough and he has to turn back.']
  },
  passing: {
    name: 'Passing', attr: 'passing', pos: 'MID', unit: '60 seconds', btn: ['Pass', 'Through', 'Lofted'],
    desc: 'Find moving teammates while a presser hunts the lane. Weight, angle and pass type decide it.',
    controls: [['Move', 'W A S D', 'Left stick'], ['Ground pass: hold for weight, release', 'J or Space', 'A'], ['Through ball into space ahead of the runner', 'K', 'X'], ['Lofted pass over the presser', 'L', 'Y'], ['Aim', 'Hold a direction', 'Left stick']],
    tips: ['Aim with the stick. The pass snaps only to a teammate within 15 degrees of it.', 'Weight matters: overhit passes bounce off, underhit ones get cut out.', 'Passing behind your body is less accurate. Turn first.', 'Through balls lead the runner. Lofted passes clear the presser but take longer.']
  }
};
// Beginner mode: one action button, the game helps with footwork, aim and timing
const BEGINNER = {
  match: { btn: 'Shoot', btns: ['Shoot or call', 'Pass or call'], controls: [], tips: ['Off the ball: move into the blue ring until your ring turns green, then press either button to call for the ball.', 'On the ball: press Shoot. Hold a direction to move the reticle on the goal; with no direction it picks the open corner.', 'Stay level with the last defender until the pass comes, or you will be offside.'] },
  finishing: { btn: 'Shoot', controls: [['Move and dribble', 'W A S D', 'Left stick'], ['Shoot', 'J or Space', 'A'], ['Pick a corner: hold a direction toward it as you shoot', 'Direction keys', 'Left stick']], tips: ['Get within about 16 metres of goal, then tap shoot.', 'Hold a direction toward a corner as you shoot to pick it (in Mouse aim, just point at it). With no direction, you aim for the side the keeper leaves open.', 'Shots straight at the keeper get saved. Corners score.'] },
  saves: { btn: 'Dive', controls: [['Adjust your position', 'W A S D', 'Left stick'], ['Save (dives toward the ball by itself)', 'J or Space', 'A']], tips: ['Leave the stick alone and your keeper gets on the angle by himself.', 'Press save the moment the ball is struck, not before. Going early lets the shooter pick the other side.'] },
  tackling: { btn: 'Tackle', controls: [['Move (you jockey by yourself near the attacker)', 'W A S D', 'Left stick'], ['Sprint (stops jockeying)', 'Shift', 'RT'], ['Tackle', 'J or Space', 'A']], tips: ['Stay between the attacker and your goal, a couple of steps off him.', 'Tackle when the ball rolls away from his feet after a touch.'] },
  passing: { btn: 'Pass', controls: [['Move', 'W A S D', 'Left stick'], ['Pass (weight set for you)', 'J or Space', 'A'], ['Choose a teammate', 'Hold a direction', 'Left stick']], tips: ['Tap pass to find the teammate in the ring. Hold a direction toward someone else to pick them instead.', 'Pass before the red presser steps into the lane.'] }
};
const isBeginner = () => !S.profile || S.profile.mode !== 'pro';
const MODE_REWARD = { beginner: 0.7, pro: 1 };
const DEFAULT_SETTINGS = { startingGrant: 1000, lagosRate: 1, maxGrant: 5000, dailyPointsCap: 1500, dailyRatingCap: 3, grantSessions: 5, grantCooldownDays: 30 };
const SETTING_INFO = {
  startingGrant: ['Starting grant', 'Points every new player receives on sign-up.'],
  lagosRate: ['LagosLife exchange rate', 'Game Arena points per 1 LagosLife point.'],
  maxGrant: ['Largest development grant', 'Grants above 60% of this wait for your sign-off.'],
  dailyPointsCap: ['Daily training points cap', 'Most points one player can earn from drills per day.'],
  dailyRatingCap: ['Daily rating gain cap', 'Most a single skill can rise per day.'],
  grantSessions: ['Sessions before a grant', 'Training sessions needed before a player can apply.'],
  grantCooldownDays: ['Days between grants', 'Wait after an approved grant before applying again.']
};

/* ---------- storage ---------- */
const KEY = 'gameArena.training.v1';
const blank = () => ({ settings: { ...DEFAULT_SETTINGS }, profile: null, balance: 0, ledger: [], sessions: [], best: {}, daily: { date: '', points: 0, gains: {} }, grants: [], settingsLog: [], sound: true });
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); const b = blank(); return { ...b, ...d, settings: { ...b.settings, ...(d.settings || {}) } }; } } catch (e) { /* storage unavailable */ }
  return blank();
}
let S = load();
if (S.profile && !S.profile.look) S.profile.look = 0;
if (S.profile && !S.profile.number) S.profile.number = POSITIONS[S.profile.position].num;
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
function rollDaily() { if (S.daily.date !== today()) S.daily = { date: today(), points: 0, gains: {} }; }
function credit(amount, desc) { S.balance += amount; S.ledger.unshift({ t: Date.now(), desc, amount, balance: S.balance }); S.ledger = S.ledger.slice(0, 80); save(); $('#balanceTop').textContent = fmt(S.balance); }
function overall(p) { const w = POSITIONS[p.position].weights; let s = 0; for (const k in w) s += p.ratings[k] * w[k]; return s; }
const rating = (attr) => (S.profile ? S.profile.ratings[attr] : 50);

/* ---------- audio ---------- */
let AC = null, noiseBuf = null;
function ac() {
  if (!S.sound) return null;
  try {
    if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); const len = AC.sampleRate * 2; noiseBuf = AC.createBuffer(1, len, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
    if (AC.state === 'suspended') AC.resume();
  } catch (e) { return null; }
  return AC;
}
function noise(dur, freq, type, vol, attack = 0.005) {
  const a = ac(); if (!a) return;
  const src = a.createBufferSource(); src.buffer = noiseBuf; const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = a.createGain(); const t = a.currentTime;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(a.destination); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(freq, dur, vol, type = 'sine', slide) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(); o.type = type; const g = a.createGain(); const t = a.currentTime;
  o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  kick: (p = 1) => { noise(0.08, 1300, 'lowpass', 0.25 + 0.35 * p); tone(150, 0.12, 0.25 + 0.3 * p, 'sine', 60); },
  touch: () => { noise(0.04, 900, 'lowpass', 0.12); },
  thud: () => { noise(0.12, 600, 'lowpass', 0.45); tone(90, 0.15, 0.4, 'sine', 50); },
  post: () => { tone(820, 0.5, 0.18, 'triangle', 780); tone(1240, 0.3, 0.08, 'sine'); },
  whistle: () => { if (!ac()) return; tone(2900, 0.18, 0.12); setTimeout(() => tone(2950, 0.32, 0.12), 220); },
  foul: () => { if (!ac()) return; tone(2950, 0.12, 0.13); setTimeout(() => tone(2950, 0.12, 0.13), 160); setTimeout(() => tone(2950, 0.4, 0.13), 320); },
  cheer: () => { noise(2.4, 1300, 'bandpass', 0.22, 0.3); noise(1.8, 500, 'bandpass', 0.14, 0.2); },
  groan: () => { noise(1.1, 400, 'lowpass', 0.14, 0.15); },
  net: (p = 1) => { noise(0.35, 2600, 'highpass', 0.12 * p, 0.01); noise(0.25, 700, 'bandpass', 0.1 * p, 0.01); },
  ui: () => tone(660, 0.06, 0.06, 'triangle'),
  tick: () => tone(1500, 0.04, 0.05, 'square')
};

/* ---------- renderer and stadium ---------- */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060f12); scene.fog = new THREE.Fog(0x060f12, 75, 175);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x1a2a18, 0.5));
const sun = new THREE.DirectionalLight(0xfff1da, 1.0);
sun.position.set(-16, 40, 20); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 24, bottom: -24, near: 5, far: 100 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; scene.add(sun);
const fillL = new THREE.DirectionalLight(0xffd6a0, 0.35); fillL.position.set(24, 30, -20); scene.add(fillL);
const rim = new THREE.DirectionalLight(0xbfd8ff, 0.25); rim.position.set(0, 18, -40); scene.add(rim);
const mat = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const maxAniso = renderer.capabilities.getMaxAnisotropy();

function pitchTexture() {
  const PX = 40, W = 44 * PX, H = 28 * PX; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  for (let i = 0; i < 11; i++) { x.fillStyle = i % 2 ? '#3a8a4d' : '#317a43'; x.fillRect(i * 4 * PX, 0, 4 * PX, H); }
  for (let i = 0; i < 26000; i++) { x.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * 0.07})` : `rgba(255,255,220,${Math.random() * 0.045})`; x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  const m = (v) => v * PX;
  x.strokeStyle = 'rgba(246,246,238,0.92)'; x.fillStyle = 'rgba(246,246,238,0.92)'; x.lineWidth = 0.1 * PX;
  x.strokeRect(m(2), m(2), m(40), m(24));
  x.beginPath(); x.moveTo(m(22), m(2)); x.lineTo(m(22), m(26)); x.stroke();
  x.beginPath(); x.arc(m(22), m(14), m(3), 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(m(22), m(14), m(0.15), 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(m(2), m(14), m(6), -Math.PI / 2, Math.PI / 2); x.stroke();
  x.beginPath(); x.arc(m(42), m(14), m(6), Math.PI / 2, Math.PI * 1.5); x.stroke();
  for (const px of [8, 36]) { x.beginPath(); x.arc(m(px), m(14), m(0.12), 0, Math.PI * 2); x.fill(); }
  for (const [cx, cy, a0] of [[2, 2, 0], [42, 2, Math.PI / 2], [42, 26, Math.PI], [2, 26, Math.PI * 1.5]]) { x.beginPath(); x.arc(m(cx), m(cy), m(0.6), a0, a0 + Math.PI / 2); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso; return t;
}
function boardTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#0b1a1f'; x.fillRect(0, 0, 1024, 64); x.fillStyle = '#ffb547'; x.fillRect(0, 0, 1024, 4); x.fillRect(0, 60, 1024, 4);
  x.font = '800 38px "Arial Narrow", Arial, sans-serif'; x.textBaseline = 'middle';
  let px = 20; ['GAME ARENA', 'TRAINING GROUND', 'LAGOS'].forEach((w, i) => { x.fillStyle = i === 0 ? '#ffb547' : '#f2efe6'; x.fillText(w, px, 33); px += x.measureText(w).width + 46; x.fillStyle = '#4fbf7a'; x.fillRect(px - 30, 26, 12, 12); });
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t;
}
function ballTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#f7f5ef'; x.fillRect(0, 0, 512, 256); x.fillStyle = '#121212';
  const pts = [[64, 40], [192, 40], [320, 40], [448, 40], [0, 128], [128, 128], [256, 128], [384, 128], [512, 128], [64, 216], [192, 216], [320, 216], [448, 216]];
  for (const [px, py] of pts) { x.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; x.lineTo(px + Math.cos(a) * 26, py + Math.sin(a) * 22); } x.closePath(); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,244,220,1)'); g.addColorStop(0.2, 'rgba(255,226,170,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 110), mat(0x121c1f, 0.95)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true; scene.add(ground);
const pitch = new THREE.Mesh(new THREE.PlaneGeometry(44, 28), new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.95 })); pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
const bTex = boardTexture();
function board(len, x, z, rotY) {
  const t = bTex.clone(); t.needsUpdate = true; t.repeat.set(len / 9, 1);
  const side = mat(0x0b1a1f);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.18), [side, side, side, side, new THREE.MeshBasicMaterial({ map: t }), new THREE.MeshBasicMaterial({ map: t })]);
  m.position.set(x, 0.45, z); m.rotation.y = rotY; m.castShadow = true; scene.add(m);
}
board(48, 0, -(HW + 2.7), 0); board(48, 0, HW + 2.7, Math.PI); board(30, -(HL + 3.7), 0, Math.PI / 2); board(30, HL + 3.7, 0, -Math.PI / 2);
const crowdBase = []; const standMat = mat(0x16252b, 0.9);
function stand(len, tiers, along, sideSign, start) {
  for (let r = 0; r < tiers; r++) {
    const h = 0.9 + r * 0.55; const m = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len : 1, h, along === 'x' ? 1 : len), standMat);
    const off = sideSign * (start + r + 0.5); if (along === 'x') m.position.set(0, h / 2, off); else m.position.set(off, h / 2, 0); m.receiveShadow = true; scene.add(m);
    for (let s = -len / 2 + 0.5; s < len / 2 - 0.3; s += 0.8) { if (Math.random() < 0.13) continue; const p = along === 'x' ? new V3(s + rand(-0.1, 0.1), h + 0.35, off) : new V3(off, h + 0.35, s + rand(-0.1, 0.1)); crowdBase.push({ p, ph: Math.random() * 6.28, amp: rand(0.15, 0.45) }); }
  }
  const backH = 0.9 + tiers * 0.55 + 1.6; const back = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len : 0.6, backH, along === 'x' ? 0.6 : len), standMat);
  const bo = sideSign * (start + tiers + 0.3); if (along === 'x') back.position.set(0, backH / 2, bo); else back.position.set(bo, backH / 2, 0); scene.add(back);
}
stand(50, 8, 'x', 1, HW + 3.4); stand(50, 8, 'x', -1, HW + 3.4); stand(28, 4, 'z', 1, HL + 4.4); stand(28, 4, 'z', -1, HL + 4.4);
const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.7, 0.34), mat(0xffffff, 0.9), crowdBase.length);
const crowdColors = [0xffb547, 0xf2efe6, 0x3fd0c9, 0xd6453d, 0x2f7d4a, 0x1d4b8f, 0xe8d36a, 0x8a4fd1, 0x2a2f33, 0xf2efe6];
const dummy = new THREE.Object3D();
crowdBase.forEach((c, i) => { dummy.position.copy(c.p); dummy.updateMatrix(); crowd.setMatrixAt(i, dummy.matrix); const col = new THREE.Color(crowdColors[(Math.random() * crowdColors.length) | 0]); col.multiplyScalar(rand(0.55, 1)); crowd.setColorAt(i, col); });
scene.add(crowd);
let cheerT = 0;
function updateCrowd(dt, t) {
  if (cheerT <= 0) return; cheerT -= dt; const k = Math.max(0, cheerT);
  crowdBase.forEach((c, i) => { dummy.position.set(c.p.x, c.p.y + Math.max(0, Math.sin(t * 9 + c.ph)) * c.amp * Math.min(1, k), c.p.z); dummy.updateMatrix(); crowd.setMatrixAt(i, dummy.matrix); });
  crowd.instanceMatrix.needsUpdate = true;
}
const glowTex = glowTexture();
for (const [fx, fz] of [[-27, -19], [27, -19], [-27, 19], [27, 19]]) {
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 26, 8), mat(0x26323a, 0.6)); mast.position.set(fx, 13, fz); scene.add(mast);
  const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff3d8 })); head.position.set(fx * 0.98, 26.2, fz * 0.98); head.lookAt(0, 0, 0); scene.add(head);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe4b8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(14, 14, 1); glow.position.copy(head.position); scene.add(glow);
}
// Goal frame and a real net: sloped back net (deep at the ground, shallow at the bar), side and roof netting.
const NDB = 1.7, NDT = 0.85; // net depth at the ground and at the crossbar
const netDepth = (y) => NDB - (NDB - NDT) * clamp(y / GH, 0, 1);
function netTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(240,244,246,0.95)'; x.lineWidth = 2.2; x.strokeRect(1, 1, 30, 30);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t;
}
const NET_CELL = 0.13;
const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 });
function gridGeom(nu, nv, fn) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const r = fn(i / nu, j / nv); pos.push(r[0], r[1], r[2]); uv.push(r[3] / NET_CELL, r[4] / NET_CELL); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
const nets = {};
function makeGoal(side) {
  const g = new THREE.Group(); const postM = mat(0xffffff, 0.35); const pg = new THREE.CylinderGeometry(0.06, 0.06, GH, 12);
  for (const z of [-GW / 2, GW / 2]) { const p = new THREE.Mesh(pg, postM); p.position.set(side * HL, GH / 2, z); p.castShadow = true; g.add(p); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GW + 0.12, 12), postM); bar.rotation.x = Math.PI / 2; bar.position.set(side * HL, GH, 0); bar.castShadow = true; g.add(bar);
  // back frame: ground bar and two stanchions from the top corners
  const frameM = mat(0xd9dde0, 0.5); const slant = Math.hypot(NDB - NDT, GH);
  const gb = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, GW, 8), frameM); gb.rotation.x = Math.PI / 2; gb.position.set(side * (HL + NDB), 0.03, 0); g.add(gb);
  for (const z of [-GW / 2, GW / 2]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, slant, 8), frameM); st.position.set(side * (HL + (NDB + NDT) / 2), GH / 2, z); st.rotation.z = side * Math.atan2(NDB - NDT, GH); g.add(st);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, NDT, 6), frameM); tb.rotation.z = Math.PI / 2; tb.position.set(side * (HL + NDT / 2), GH, z); g.add(tb);
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, NDB, 6), frameM); lb.rotation.z = Math.PI / 2; lb.position.set(side * (HL + NDB / 2), 0.02, z); g.add(lb);
  }
  // back net: a deformable grid
  const NU = 30, NV = 12;
  const backG = gridGeom(NU, NV, (u, v) => { const y = v * GH, z = -GW / 2 + u * GW; return [side * (HL + netDepth(y)), y, z, z, v * slant]; });
  const back = new THREE.Mesh(backG, netMat); g.add(back);
  for (const zs of [-1, 1]) g.add(new THREE.Mesh(gridGeom(10, 12, (u, v) => { const y = v * GH; const d = netDepth(y) * u; return [side * (HL + d), y, zs * GW / 2, d, y]; }), netMat));
  g.add(new THREE.Mesh(gridGeom(8, 30, (u, v) => { const d = NDT * u, z = -GW / 2 + v * GW; return [side * (HL + d), GH, z, d, z]; }), netMat));
  scene.add(g);
  const rest = Float32Array.from(backG.attributes.position.array);
  nets[side] = { side, geo: backG, rest, A: 0, vA: 0, zb: 0, yb: 1, target: 0, touch: false };
}
makeGoal(1); makeGoal(-1);
// the back net bulges where the ball hits it and springs back
function netUpdate(dt) {
  for (const s of [1, -1]) {
    const n = nets[s]; if (!n) continue;
    if (n.touch) { if (n.target > n.A) { n.vA = Math.max(n.vA, (n.target - n.A) / Math.max(dt, 1e-3)); n.A = n.target; } }
    const acc = 160 * ((n.touch ? n.target : 0) - n.A) - 10 * n.vA; n.vA += acc * dt; n.A += n.vA * dt;
    n.touch = false; n.target = 0;
    if (Math.abs(n.A) < 1e-4 && Math.abs(n.vA) < 1e-3) { if (n.idle) continue; n.idle = true; } else n.idle = false;
    const p = n.geo.attributes.position.array, r = n.rest; const sg = 0.5;
    for (let i = 0; i < p.length; i += 3) { const dz = r[i + 2] - n.zb, dy = r[i + 1] - n.yb; const w = Math.exp(-(dz * dz + dy * dy) / (2 * sg * sg)); p[i] = r[i] + s * n.A * w * (r[i + 1] > 0.02 ? 1 : 0.4); }
    n.geo.attributes.position.needsUpdate = true;
  }
}

/* ---------- ball ---------- */
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BR, 24, 16), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45 }));
ballMesh.castShadow = true; scene.add(ballMesh);
const ball = { pos: new V3(0, BR, 0), vel: new V3(), spin: new V3(), last: new V3(), prev: new V3(), held: null, net: 0, events: [] };
const _m = new V3();
// substepped so a hard shot can never tunnel through a post, the line or the net
function ballStep(dt) {
  ball.prev.copy(ball.pos);
  if (ball.held) return;
  const n = clamp(Math.ceil(ball.vel.length() * dt / 0.1), 1, 10);
  for (let i = 0; i < n; i++) ballSub(dt / n);
}
function ballSub(dt) {
  const v = ball.vel; const sp = v.length();
  const px = ball.pos.x;
  v.addScaledVector(v, -0.012 * sp * dt);                       // air drag
  if (ball.spin.lengthSq() > 1) { _m.crossVectors(ball.spin, v).multiplyScalar(0.0042 * dt); v.add(_m); ball.spin.multiplyScalar(Math.exp(-0.4 * dt)); }
  v.y -= G * dt;
  ball.pos.addScaledVector(v, dt);
  if (ball.pos.y < BR) {
    ball.pos.y = BR;
    if (v.y < 0) { if (v.y < -1.5) ball.events.push('bounce'); v.y = -v.y * 0.5; if (v.y < 0.7) v.y = 0; }
    const hs = hlen(v);
    if (hs > 0.001) { const dec = (2.0 + 0.09 * hs) * dt; const k = Math.max(0, hs - dec) / hs; v.x *= k; v.z *= k; }
    ball.spin.multiplyScalar(Math.exp(-3 * dt));
  }
  for (const s of [1, -1]) {
    const gx = s * HL;
    // posts and crossbar
    if (Math.abs(ball.pos.x - gx) < 0.5) {
      for (const zp of [-GW / 2, GW / 2]) {
        if (ball.pos.y > GH + BR) continue;
        const dx = ball.pos.x - gx, dz = ball.pos.z - zp; const d = Math.hypot(dx, dz);
        if (d < BR + 0.06 && d > 1e-4) { const nx = dx / d, nz = dz / d; ball.pos.x = gx + nx * (BR + 0.061); ball.pos.z = zp + nz * (BR + 0.061); const vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= 1.6 * vn * nx; v.z -= 1.6 * vn * nz; ball.events.push('post'); } }
      }
      if (Math.abs(ball.pos.z) < GW / 2 + 0.06) {
        const dx = ball.pos.x - gx, dy = ball.pos.y - GH; const d = Math.hypot(dx, dy);
        if (d < BR + 0.06 && d > 1e-4) { const nx = dx / d, ny = dy / d; ball.pos.x = gx + nx * (BR + 0.061); ball.pos.y = GH + ny * (BR + 0.061); const vn = v.x * nx + v.y * ny; if (vn < 0) { v.x -= 1.6 * vn * nx; v.y -= 1.6 * vn * ny; ball.events.push('bar'); } }
      }
    }
    const inX = s * ball.pos.x, prevIn = s * px;
    // a goal: the whole ball crosses the line between the posts and under the bar
    if (ball.net !== s && prevIn <= HL + BR && inX > HL + BR && Math.abs(ball.pos.z) < GW / 2 && ball.pos.y < GH) { ball.net = s; ball.events.push('goal'); }
    if (ball.net === s) {
      // inside the goal: the net holds the ball
      const vn = s * v.x;
      const lim = GW / 2 - BR - 0.02;
      if (Math.abs(ball.pos.z) > lim) { ball.pos.z = Math.sign(ball.pos.z) * lim; if (v.z * Math.sign(ball.pos.z) > 0) { v.z *= -0.12; v.x *= 0.7; } }
      if (ball.pos.y > GH - BR - 0.02) { ball.pos.y = GH - BR - 0.02; if (v.y > 0) { v.y *= -0.1; v.x *= 0.7; } }
      const pen = inX - (HL + netDepth(ball.pos.y) - BR);
      if (pen > 0) {
        // soft mesh: a stiff spring with heavy damping, so the ball sinks into the net and drops
        const nvn = vn + (-520 * pen - (vn > 0 ? 34 : 70) * vn) * dt; v.x = s * nvn; v.z *= Math.exp(-5 * dt); if (v.y > 0) v.y *= Math.exp(-6 * dt);
        if (pen > 0.65) { ball.pos.x = s * (HL + netDepth(ball.pos.y) - BR + 0.65); if (s * v.x > 0) v.x = 0; }
        const nt = nets[s]; if (nt) { nt.touch = true; nt.target = Math.max(nt.target, pen); nt.zb = ball.pos.z; nt.yb = ball.pos.y; }
        if (vn > 4 && !ball.netHit) { ball.netHit = true; ball.events.push('net'); sfx.net(clamp(vn / 25, 0.3, 1)); }
      }
      if (inX < HL + BR + 0.02 && vn < 0) { v.x = s * Math.abs(v.x) * 0.25; ball.pos.x = s * (HL + BR + 0.02); }
    } else if (inX > HL - 0.02 && inX < HL + netDepth(Math.min(ball.pos.y, GH)) + BR && ball.pos.y < GH + BR) {
      // outside netting: sides and roof
      const az = Math.abs(ball.pos.z), sz = Math.sign(ball.pos.z) || 1;
      if (az >= GW / 2 - 0.03 && az < GW / 2 + BR && inX > HL + 0.07) { ball.pos.z = sz * (GW / 2 + BR); if (v.z * sz < 0) { v.z *= -0.15; v.x *= 0.55; v.y *= 0.7; ball.events.push('sidenet'); } }
      else if (az < GW / 2 && inX > HL + 0.07 && ball.pos.y >= GH - 0.1) { ball.pos.y = GH + BR; if (v.y < 0) { v.y *= -0.25; v.x *= 0.75; v.z *= 0.75; ball.events.push('roof'); } }
    }
  }
  if (Math.abs(ball.pos.z) > HW + 2.5) { ball.pos.z = Math.sign(ball.pos.z) * (HW + 2.5); v.z *= -0.35; }
  if (Math.abs(ball.pos.x) > HL + 3.5) { ball.pos.x = Math.sign(ball.pos.x) * (HL + 3.5); v.x *= -0.35; }
}
function ballSync() {
  const d = new V3().subVectors(ball.pos, ball.last); const l = Math.hypot(d.x, d.z);
  if (l > 1e-5) ballMesh.rotateOnWorldAxis(new V3(d.z, 0, -d.x).normalize(), l / BR);
  if (ball.spin.lengthSq() > 4 && !ball.held) ballMesh.rotateOnWorldAxis(ball.spin.clone().normalize(), ball.spin.length() * 0.016);
  ball.last.copy(ball.pos); ballMesh.position.copy(ball.pos);
}
function resetBall(x, z) { ball.held = null; ball.net = 0; ball.netHit = false; ball.pos.set(x, BR, z); ball.vel.set(0, 0, 0); ball.spin.set(0, 0, 0); ball.last.copy(ball.pos); ball.events.length = 0; }
// Solve the launch so the real flight (drag, spin, gravity) passes through the target point.
function flightAt(pos, vel, spin, planeN, planeD) {
  const p = pos.clone(), v = vel.clone(), w = spin.clone(); const h = 1 / 120; let t = 0;
  for (let i = 0; i < 600; i++) {
    const sp = v.length(); v.addScaledVector(v, -0.012 * sp * h);
    if (w.lengthSq() > 1) { _m.crossVectors(w, v).multiplyScalar(0.0042 * h); v.add(_m); w.multiplyScalar(Math.exp(-0.4 * h)); }
    v.y -= G * h; p.addScaledVector(v, h); t += h;
    if (p.x * planeN.x + p.z * planeN.z >= planeD) return { p, t };
  }
  return { p, t };
}
function aimSolve(from, target, speed, spin) {
  const n = new V3(target.x - from.x, 0, target.z - from.z); const L = n.length(); n.divideScalar(L);
  const planeD = target.x * n.x + target.z * n.z;
  launch(from, target, speed); const v = ball.vel.clone();
  for (let it = 0; it < 4; it++) {
    const r = flightAt(from, v, spin, n, planeD);
    const lat = new V3(n.z, 0, -n.x); // left of the flight line (matches rotY)
    const eLat = (target.x - r.p.x) * lat.x + (target.z - r.p.z) * lat.z; const eY = target.y - r.p.y;
    const ang = Math.atan2(eLat, L); const hv = new V3(v.x, 0, v.z); const hs = hv.length();
    const nd = rotY(hv.normalize(), ang); v.x = nd.x * hs; v.z = nd.z * hs;
    v.y += eY / Math.max(0.1, r.t);
    if (Math.abs(eLat) < 0.02 && Math.abs(eY) < 0.02) break;
  }
  ball.vel.copy(v);
}
// ballistic launch to a target point (ignores drag; callers compensate)
function launch(from, to, speed) {
  const dx = to.x - from.x, dz = to.z - from.z; const d = Math.max(0.5, Math.hypot(dx, dz)); const T = d / speed;
  ball.vel.set(dx / T, (to.y - from.y + 0.5 * G * T * T) / T, dz / T);
}

// timing cue ring around the ball
const cue = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
cue.rotation.x = -Math.PI / 2; cue.visible = false; scene.add(cue);
const aimMark = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.47, 32), new THREE.MeshBasicMaterial({ color: 0x3fd0c9, transparent: true, opacity: 0.9, depthWrite: false }));
aimMark.rotation.x = -Math.PI / 2; aimMark.visible = false; scene.add(aimMark);
const goalMark = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 32), new THREE.MeshBasicMaterial({ color: 0x3fd0c9, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false }));
goalMark.rotation.y = Math.PI / 2; goalMark.renderOrder = 5; goalMark.visible = false; scene.add(goalMark);
const userRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 40), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.75, depthWrite: false }));
userRing.rotation.x = -Math.PI / 2; userRing.position.y = 0.02; userRing.visible = false; scene.add(userRing);
const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.85, 40), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.85, depthWrite: false }));
targetRing.rotation.x = -Math.PI / 2; targetRing.position.y = 0.025; targetRing.visible = false; scene.add(targetRing);

// Shot aim: a reticle on the goal mouth shows where the shot is going. Direction moves it across the goal,
// power raises it (and over the bar if you overhit a driven shot).
const shotMark = new THREE.Group();
{
  const m = new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 36), m); shotMark.add(ring);
  for (const [w, h] of [[0.1, 0.03], [0.03, 0.1]]) for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); if (w > h) b.position.x = s * 0.36; else b.position.y = s * 0.36; shotMark.add(b); }
  shotMark.rotation.y = -Math.PI / 2; shotMark.renderOrder = 6; shotMark.visible = false; shotMark.userData.mat = m; scene.add(shotMark);
}
// h = target height for a given power on a driven shot (what resolveContact will do on a clean strike)
function shotHeight(style, power, baseY) { if (style === 'chip') return 1.6; if (style === 'driven') return baseY + 2.4 * Math.max(0, power - 0.78); return baseY; }
function shotAimPoint(inp, mv, from, power, beg, faceHeading) {
  const lim = beg ? GW / 2 - 0.45 : GW / 2 + 0.5;
  let tz, y = null;
  if (inp.goalPt) { tz = inp.goalPt.z; y = inp.goalPt.y; }
  else if (inp.aimPt && inp.aimPt.x > from.x + 1.5) { const d = new V3(inp.aimPt.x - from.x, 0, inp.aimPt.z - from.z); tz = from.z + d.z / d.x * (HL - from.x); }
  else {
    // the stick is read relative to the line to goal: left/right of it slides the aim across the goal mouth
    const g = new V3(HL - from.x, 0, -from.z).normalize(); const r = new V3(-g.z, 0, g.x);
    let lat;
    if (inp.mag > 0.3) lat = mv.clone().normalize().dot(r);
    else if (beg) lat = null;
    else { const f = new V3(Math.cos(faceHeading), 0, -Math.sin(faceHeading)); lat = f.dot(r) * 1.6; }
    if (lat === null) {
      // assisted: the corner with the widest gap from the keeper, as seen from the ball
      const kz = keeper ? keeper.pos.z : 0, kx = keeper ? keeper.pos.x : HL; const ka = Math.atan2(kz - from.z, kx - from.x);
      let bestGap = -1; tz = GW / 2 - 0.55;
      for (const s of [-1, 1]) { const z = s * (GW / 2 - 0.55); const gap = Math.abs(wrap(Math.atan2(z - from.z, HL - from.x) - ka)); if (gap > bestGap) { bestGap = gap; tz = z; } }
    }
    else tz = clamp(lat, -1, 1) * (GW / 2 + 0.1);
    // r points to +z when facing the goal; so positive lat is toward +z
  }
  tz = clamp(tz, -lim, lim);
  const baseY = y ?? (beg ? 0.55 : 0.3 + 0.9 * clamp(power, 0, 0.78) / 0.78);
  return { tz, baseY, pt: new V3(HL, baseY, tz) };
}
function showShotMark(tz, y, live) {
  shotMark.visible = true; shotMark.position.set(HL - 0.02, clamp(y, 0.12, 3.2), tz);
  const out = Math.abs(tz) > GW / 2 - 0.1 || y > GH - 0.08;
  shotMark.userData.mat.color.setHex(out ? 0xff5a4f : 0xffb547); shotMark.userData.mat.opacity = live ? 0.95 : 0.5;
  shotMark.scale.setScalar(live ? 1 : 0.85);
}

/* ---------- camera ---------- */
const cam = { pos: new V3(34, 15, 0), look: new V3(0, 0.5, 0), tPos: new V3(34, 15, 0), tLook: new V3(0, 0.5, 0), k: 3.5 };
function camTo(px, py, pz, lx, ly, lz, k = 3.5) { cam.tPos.set(px, py, pz); cam.tLook.set(lx, ly, lz); cam.k = k; }
// drill camera: the scheme decides between broadcast, behind (default framing) and chase
function drillCam(focus, me, px, py, pz, lx, ly, lz, k = 3.5) {
  const kind = scheme().cam;
  if (kind === 'broadcast') { const fx = clamp(focus.x, -HL + 6, HL - 6); camTo(fx, 10.5, focus.z * 0.45 + 18, fx, 0.3, focus.z * 0.6 - 0.5, 6); }
  else if (kind === 'chase' && me) { const d = new V3(Math.cos(chaseYaw), 0, -Math.sin(chaseYaw)); camTo(me.pos.x - d.x * 5, 2.5, me.pos.z - d.z * 5, me.pos.x + d.x * 7, 0.9, me.pos.z + d.z * 7, 5); }
  else camTo(px, py, pz, lx, ly, lz, Math.max(k * 1.8, 5));
}
function camSnap() { cam.pos.copy(cam.tPos); cam.look.copy(cam.tLook); }
function camUpdate(dt) {
  for (const a of ['x', 'y', 'z']) { cam.pos[a] = damp(cam.pos[a], cam.tPos[a], cam.k, dt); cam.look[a] = damp(cam.look[a], cam.tLook[a], cam.k * 1.3, dt); }
  camera.position.copy(cam.pos);
  // portrait screens: lift the camera so the pitch, not the sky, fills the frame
  if (mode === 'drill' && camera.aspect < 0.85) { camera.position.y += 2.4; camera.lookAt(cam.look.x, cam.look.y - 0.6, cam.look.z); }
  else camera.lookAt(cam.look);
}
let chaseYaw = 0, dbgCam = null;
function mapMove(inp) {
  if (mode === 'drill' && S.controls === 'player') {
    // run along the view; left/right steer the view and side-step a little
    const f = new V3(Math.cos(chaseYaw), 0, -Math.sin(chaseYaw)); const r = new V3(-f.z, 0, f.x);
    return new V3().addScaledVector(f, inp.y).addScaledVector(r, inp.x * 0.45);
  }
  const f = new V3().subVectors(cam.tLook, cam.tPos); f.y = 0; if (f.lengthSq() < 1e-6) f.set(1, 0, 0); f.normalize();
  const r = new V3(-f.z, 0, f.x);
  return new V3().addScaledVector(r, inp.x).addScaledVector(f, inp.y);
}

/* ---------- input ---------- */
const keys = new Set();
const tapped = new Set(); // keys pressed since the last frame, so a quick tap is never missed
const touch = { x: 0, y: 0, a: false, b: false, c: false, s: false };
let device = 'keyboard', padPrevStart = false, padNavT = 0, padPrevA = false;
const prev = { a: false, b: false, c: false };
const isTyping = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  keys.add(e.code); tapped.add(e.code);
  if (mode === 'drill' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyS', 'KeyD', 'KeyW', 'KeyE'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape') { if (!$('#overlay').hidden && modalClosable) closeModal(); else if (mode === 'drill') togglePause(); }
  setDevice('keyboard');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('touchstart', () => setDevice('touch'), { passive: true });
function setDevice(d) {
  if (device === d) return; device = d;
  $('#deviceTag').textContent = d === 'gamepad' ? 'Controller' : d === 'touch' ? 'Touch' : 'Keyboard';
  updateHint(); updateTouchVisibility();
}
addEventListener('gamepadconnected', () => { setDevice('gamepad'); toast('Controller connected'); });
function readPad() { const pads = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of pads) if (p && p.connected) return p; return null; }
function btn(b, i) { return !!(b[i] && (b[i].pressed || b[i].value > 0.4)); }
/* Control schemes. Each maps keys to move, sprint and three actions (a, b, c) per drill. */
const SCHEMES = {
  fifa: {
    name: 'FIFA layout', short: 'FIFA', cam: 'broadcast',
    blurb: 'Arrow keys move, A S D W are your four buttons, E sprints. Side-on TV camera, like a broadcast match.',
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], sprint: ['KeyE', 'ShiftLeft', 'ShiftRight'],
    btn: { match: { a: ['KeyD'], b: ['KeyS'], c: ['KeyW'] }, finishing: { a: ['KeyD'], b: ['KeyA'], c: ['KeyW'] }, saves: { a: ['KeyD'], b: ['KeyS'], c: ['KeyA'] }, tackling: { a: ['KeyD'], b: ['KeyS'], c: ['KeyA'] }, passing: { a: ['KeyS'], b: ['KeyW'], c: ['KeyA'] } }
  },
  mouse: {
    name: 'Mouse aim', short: 'Mouse', cam: 'behind',
    blurb: 'W A S D move. Point the mouse exactly where you want the ball to go, hold left click for power. Right click and Space for the other moves.',
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], sprint: ['ShiftLeft', 'ShiftRight'],
    btn: Object.fromEntries(['match', 'finishing', 'saves', 'tackling', 'passing'].map((k) => [k, { a: ['MOUSE_L'], b: ['MOUSE_R'], c: ['Space'] }]))
  },
  player: {
    name: 'Player cam', short: 'Player', cam: 'chase',
    blurb: 'Camera right behind your player, like Pro Clubs. W A S D move, J K L are your buttons, Shift sprints.',
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], sprint: ['ShiftLeft', 'ShiftRight'],
    btn: Object.fromEntries(['match', 'finishing', 'saves', 'tackling', 'passing'].map((k) => [k, { a: ['KeyJ', 'Space'], b: ['KeyK'], c: ['KeyL'] }]))
  }
};
const scheme = () => SCHEMES[S.controls] || SCHEMES.fifa;
const KEY_LABEL = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift', ShiftRight: 'Shift', Space: 'Space', MOUSE_L: 'Left click', MOUSE_R: 'Right click' };
const keyLabel = (c) => KEY_LABEL[c] || c.replace(/^Key/, '');
const keysLabel = (arr) => [...new Set(arr.map(keyLabel))].join(' or ');
const any = (arr) => arr.some((k) => keys.has(k) || tapped.has(k));
// mouse aiming
const mouse = { x: 0, y: 0, has: false };
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true; });
addEventListener('mousedown', (e) => { if (e.target !== canvas) return; const k = e.button === 2 ? 'MOUSE_R' : 'MOUSE_L'; keys.add(k); tapped.add(k); setDevice('keyboard'); });
addEventListener('mouseup', (e) => { keys.delete(e.button === 2 ? 'MOUSE_R' : 'MOUSE_L'); });
addEventListener('contextmenu', (e) => { if (mode === 'drill' && e.target === canvas) e.preventDefault(); });
function mouseAim() {
  if (!mouse.has || S.controls !== 'mouse' || mode !== 'drill') return null;
  ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction; const out = {};
  if (d.y < -0.01) { const t = -o.y / d.y; out.pt = o.clone().addScaledVector(d, t); }
  if (D && D.id === 'finishing' && d.x > 0.05) {
    const t = (HL - o.x) / d.x; const g = o.clone().addScaledVector(d, t);
    if (Math.abs(g.z) < 4.5 && g.y > -1 && g.y < 3.6) out.goal = new V3(HL, clamp(g.y, 0.15, 2.2), clamp(g.z, -3, 3));
  }
  return out.pt || out.goal ? out : null;
}
function readInput() {
  let x = 0, y = 0, a = false, b = false, c = false, s = false;
  const sc = scheme(); const bm = sc.btn[D ? D.id : 'finishing'];
  if (any(sc.left)) x -= 1; if (any(sc.right)) x += 1; if (any(sc.up)) y += 1; if (any(sc.down)) y -= 1;
  a = any(bm.a); b = any(bm.b); c = any(bm.c); s = any(sc.sprint);
  const p = readPad();
  if (p) {
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0; const bb = p.buttons;
    if (Math.hypot(ax, ay) > 0.2) { x += ax; y -= ay; setDevice('gamepad'); }
    if (btn(bb, 14)) x -= 1; if (btn(bb, 15)) x += 1; if (btn(bb, 12)) y += 1; if (btn(bb, 13)) y -= 1;
    if (btn(bb, 0)) { a = true; setDevice('gamepad'); }
    if (btn(bb, 2) || btn(bb, 6)) { b = true; setDevice('gamepad'); }
    if (btn(bb, 3)) { c = true; setDevice('gamepad'); }
    if (btn(bb, 7) || btn(bb, 5)) s = true;
    const st = btn(bb, 9); if (st && !padPrevStart && mode === 'drill') togglePause(); padPrevStart = st;
  }
  x += touch.x; y += touch.y; a = a || touch.a; b = b || touch.b; c = c || touch.c; s = s || touch.s;
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  const mk = (k, v) => ({ down: v, pressed: v && !prev[k], released: !v && prev[k] });
  const inp = { x, y, mag: Math.min(1, l), sprint: s, a: mk('a', a), b: mk('b', b), c: mk('c', c) };
  prev.a = a; prev.b = b; prev.c = c;
  const m = device === 'keyboard' ? mouseAim() : null; if (m) { inp.aimPt = m.pt; inp.goalPt = m.goal; }
  lastInp = inp; tapped.clear();
  return inp;
}
let lastInp = null;
// direction to aim an action from a point: mouse cursor first, then held direction
function aimOf(inp, mv, from) {
  const p = inp.goalPt || inp.aimPt;
  if (p) { const v = new V3(p.x - from.x, 0, p.z - from.z); if (v.lengthSq() > 0.04) return v.normalize(); }
  return inp.mag > 0.3 ? mv.clone().normalize() : null;
}
const NOINPUT = { x: 0, y: 0, mag: 0, sprint: false, a: { down: false, pressed: false, released: false }, b: { down: false, pressed: false, released: false }, c: { down: false, pressed: false, released: false } };
function padMenuNav(dt) {
  const p = readPad(); if (!p) return;
  const b = p.buttons; const ax = p.axes[0] || 0, ay = p.axes[1] || 0; padNavT -= dt;
  let dir = 0;
  if (ay > 0.5 || ax > 0.5 || btn(b, 13) || btn(b, 15)) dir = 1;
  if (ay < -0.5 || ax < -0.5 || btn(b, 12) || btn(b, 14)) dir = -1;
  if (dir && padNavT <= 0) {
    padNavT = 0.22; setDevice('gamepad');
    const scope = !$('#overlay').hidden ? $('#overlay') : !$('#pause').hidden ? $('#pause') : $('#hub');
    const items = [...scope.querySelectorAll('button:not(:disabled), input, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
    if (items.length) { const i = items.indexOf(document.activeElement); const n = items[(i + dir + items.length) % items.length]; n.focus(); n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  if (!dir) padNavT = Math.min(padNavT, 0);
  const a = btn(b, 0); if (a && !padPrevA && document.activeElement && document.activeElement !== document.body) document.activeElement.click(); padPrevA = a;
  if (btn(b, 1) && !$('#overlay').hidden && modalClosable) closeModal();
}
(() => {
  const stick = $('#stick'), knob = $('#knob'); let id = null;
  const move = (e) => { const r = stick.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const R = r.width / 2; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } knob.style.transform = `translate(${dx}px, ${dy}px)`; touch.x = dx / R; touch.y = -dy / R; };
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); setDevice('touch'); move(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; touch.x = touch.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  for (const [elId, k] of [['btnA', 'a'], ['btnB', 'b'], ['btnC', 'c'], ['btnS', 's']]) {
    const el = $('#' + elId);
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); touch[k] = true; el.classList.add('down'); setDevice('touch'); e.preventDefault(); });
    const up = () => { touch[k] = false; el.classList.remove('down'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
})();
function updateTouchVisibility() {
  const show = mode === 'drill' && (device === 'touch' || matchMedia('(pointer: coarse)').matches);
  $('#touch').hidden = !show; document.body.classList.toggle('touch-ui', show); document.body.classList.toggle('in-drill', mode === 'drill');
}

/* ---------- UI helpers ---------- */
let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }
let modalClosable = true;
function openModal(html, { wide = false, closable = true } = {}) {
  modalClosable = closable; const sh = $('#sheet'); sh.className = 'sheet' + (wide ? ' wide' : '');
  sh.innerHTML = (closable ? '<button class="close" type="button" data-close aria-label="Close">&times;</button>' : '') + html;
  $('#overlay').hidden = false; const f = sh.querySelector('[autofocus], .btn.primary, input, button'); if (f) setTimeout(() => f.focus(), 30); return sh;
}
function closeModal() { $('#overlay').hidden = true; $('#sheet').innerHTML = ''; if (onModalClose) { const f = onModalClose; onModalClose = null; f(); } }
let onModalClose = null;
$('#overlay').addEventListener('click', (e) => { if (e.target.closest('[data-close]') || (e.target.id === 'overlay' && modalClosable)) closeModal(); });
let msgTimer = 0;
function showMsg(big, small = '', color = 'var(--chalk)', dur = 1.4) {
  const m = $('#hudMsg'); $('#msgBig').textContent = big; $('#msgBig').style.color = color; $('#msgSmall').textContent = small;
  m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); m.hidden = false; msgTimer = dur;
}
function hideMsg() { $('#hudMsg').hidden = true; msgTimer = 0; }
function setHud(prog) { $('#hudProg').textContent = prog; $('#hudScore').textContent = D && D.practice ? (D.stats.made || 0) + ' / ' + (D.rep || 0) : fmt(D ? D.score : 0); $('#hudScoreLbl').textContent = D && D.practice ? 'Practice' : 'Score'; }
function setPower(v, label, hint) {
  const p = $('#power'); if (v === null) { p.hidden = true; return; }
  p.hidden = false; $('#powerBar').style.width = clamp(v / 1.15, 0, 1) * 100 + '%'; $('#powerLbl').textContent = label; $('#powerHint').textContent = hint;
}
function showFeedback(title, rows, tip) {
  const f = $('#feedback');
  f.innerHTML = `<h4>${esc(title)}</h4>` + rows.map(([k, v, cls]) => `<div class="row"><span>${esc(k)}</span><b class="${cls || ''}">${esc(v)}</b></div>`).join('') + (tip ? `<div class="tip">${esc(tip)}</div>` : '');
  f.hidden = false;
}
function hideFeedback() { $('#feedback').hidden = true; }
const ACTION_DESC = {
  match: { a: 'Shoot (hold for power, aim with direction)', b: 'Pass, or call for the ball to your feet', c: 'Through ball, or call for it into space' },
  finishing: { a: 'Driven shot: hold for power, release', b: 'Finesse curler', c: 'Chip' },
  saves: { a: 'Dive or save', b: 'Rush off your line (hold)', c: 'Spread to block' },
  tackling: { a: 'Standing tackle', b: 'Jockey (hold)', c: 'Slide tackle' },
  passing: { a: 'Ground pass: hold for weight', b: 'Through ball', c: 'Lofted pass' }
};
function controlRows(id) {
  const sc = scheme(); const beg = isBeginner(); const bm = sc.btn[id];
  const rows = [['Move', keysLabel([...sc.up, ...sc.left, ...sc.down, ...sc.right]), 'Left stick'], ['Sprint', keysLabel(sc.sprint), 'RT']];
  const pads = { a: 'A', b: 'X', c: 'Y' };
  const bl = BEGINNER[id].btns || [BEGINNER[id].btn];
  for (const [i, k] of (beg ? ['a', 'b'].slice(0, bl.length) : ['a', 'b', 'c']).entries()) rows.push([beg ? bl[i] : ACTION_DESC[id][k], keysLabel(bm[k]), pads[k]]);
  rows.push(['Aim', S.controls === 'mouse' ? 'Point the mouse where you want it' : 'Hold a direction as you release', 'Left stick']);
  return rows;
}
function schemeButtons() { return `<div class="btn-row">${Object.entries(SCHEMES).map(([k, v]) => `<button class="btn ${(S.controls || 'fifa') === k ? 'primary' : ''}" type="button" data-scheme="${k}">${esc(v.name)}</button>`).join('')}</div>`; }
function setScheme(k) { S.controls = k; save(); if (D) updateHint(); toast(SCHEMES[k].name + ' controls on.'); }
function openControls(after) {
  const cur = S.controls || 'fifa';
  const sh = openModal(`<div class="label">Controls</div><h2 style="margin-top:8px">Pick your controls</h2>
    <p class="muted">Try each one in Practice. You can switch any time from the Controls button or the pause menu.</p>
    <form id="ctlForm" novalidate><div class="positions" style="grid-template-columns:minmax(0,1fr)">${Object.entries(SCHEMES).map(([k, v]) => `<label><input type="radio" name="ctl" value="${k}" ${k === cur ? 'checked' : ''}><b>${esc(v.name)}</b><span>${esc(v.blurb)}</span></label>`).join('')}</div>
    <div class="btn-row"><button class="btn primary" type="submit">Use these controls</button></div></form>`, { wide: true });
  sh.querySelector('#ctlForm').addEventListener('submit', (e) => { e.preventDefault(); setScheme(sh.querySelector('input[name=ctl]:checked').value); closeModal(); if (after) after(); });
}
function updateHint() {
  if (!D) return; const d = DRILLS[D.id]; const h = $('#hint');
  const beg = isBeginner(); const bl = BEGINNER[D.id].btns || [BEGINNER[D.id].btn]; $('#btnB').hidden = beg && bl.length < 2; $('#btnC').hidden = beg;
  if (device === 'keyboard') {
    const sc = scheme(); const bm = sc.btn[D.id]; const lbl = beg ? bl : d.btn;
    const mv = S.controls === 'fifa' ? '↑ ↓ ← →' : 'W A S D';
    h.innerHTML = `<b>${mv}</b> move · ` + ['a', 'b', 'c'].slice(0, lbl.length).map((k, i) => `<b>${esc(keysLabel(bm[k]))}</b> ${esc(lbl[i])}`).join(' · ') + ` · <b>${esc(keysLabel(sc.sprint))}</b> sprint` + (S.controls === 'mouse' ? ' · aim with the mouse' : '');
    if (beg) { $('#btnA').textContent = lbl[0]; if (lbl[1]) $('#btnB').textContent = lbl[1]; } return;
  }
  if (beg) {
    h.innerHTML = device === 'gamepad' ? `Stick to move · <b>A</b> ${bl[0]}${bl[1] ? ` · <b>X</b> ${bl[1]}` : ''} · <b>RT</b> sprint` : '';
    $('#btnA').textContent = bl[0]; if (bl[1]) $('#btnB').textContent = bl[1]; return;
  }
  if (device === 'gamepad') h.innerHTML = `Stick to move · <b>A</b> ${d.btn[0]} · <b>X</b> ${d.btn[1]} · <b>Y</b> ${d.btn[2]} · <b>RT</b> sprint`;
  else if (device === 'touch') h.innerHTML = '';
  else h.innerHTML = `<b>W A S D</b> move · <b>J</b> ${d.btn[0]} · <b>K</b> ${d.btn[1]} · <b>L</b> ${d.btn[2]} · <b>Shift</b> sprint · <b>Esc</b> pause`;
  $('#btnA').textContent = d.btn[0]; $('#btnB').textContent = d.btn[1]; $('#btnC').textContent = d.btn[2];
}

/* ---------- actors ---------- */
class Actor {
  constructor(opts) {
    this.pl = new Player(opts); scene.add(this.pl.root); this.pl.root.visible = false;
    this.pos = this.pl.pos; this.vel = this.pl.vel; this.heading = 0;
    this.state = 'free'; this.st = {}; this.touchCD = 0; this.rating = opts.rating || 60; this.strong = 'R'; this.faceLock = false; this.animSpeed = null; this.ai = !!opts.ai;
  }
  show(v = true) { this.pl.root.visible = v; return this; }
  get visible() { return this.pl.root.visible; }
  place(x, z, h = 0) {
    this.pos.set(x, 0, z); this.vel.set(0, 0, 0); this.heading = h; this.state = 'free'; this.st = {}; this.faceLock = false; this.animSpeed = null; this.touchCD = 0;
    const pl = this.pl; pl.proc = null; pl.procW = 0; pl.procTarget = 0; pl.stopOnce(0); pl.root.rotation.set(0, h, 0); pl.root.position.y = 0; pl.heading = h; pl.setSpeed(0); pl.update(0.016);
    return this;
  }
  dir(out = new V3()) { return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }
  left(out = new V3()) { return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  speed() { return hlen(this.vel); }
  steer(desired, dt, accel) { const dx = desired.x - this.vel.x, dz = desired.z - this.vel.z; const l = Math.hypot(dx, dz); const m = accel * dt; const k = l > m ? m / l : 1; this.vel.x += dx * k; this.vel.z += dz * k; }
  turnTo(dx, dz, dt, rate) { if (Math.hypot(dx, dz) < 1e-4) return; const t = Math.atan2(-dz, dx); const d = wrap(t - this.heading); const m = rate * dt; this.heading += clamp(d, -m, m); }
  integrate(dt) { this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.x = clamp(this.pos.x, -HL - 2.5, HL + 2.5); this.pos.z = clamp(this.pos.z, -HW - 1.5, HW + 1.5); }
  finish(dt) {
    const sp = this.speed();
    if (!this.faceLock && sp > 0.35) this.turnTo(this.vel.x, this.vel.z, dt, this.ai ? lerp(14, 5, clamp(sp / 7.5, 0, 1)) : lerp(26, 13, clamp(sp / 7.5, 0, 1)));
    this.pl.heading = this.heading; this.pl.setSpeed(this.animSpeed ?? sp); this.pl.update(dt);
  }
  footPoint(out = new V3()) { this.dir(out).multiplyScalar(0.42).add(this.pos); return out; }
  hasBall() { return !ball.held && ball.pos.y < 0.5 && dist2(this.footPoint(), ball.pos) < 0.62 && this.state === 'free'; }
}

// dribbling: touches push the ball ahead; returns true if a touch happened
function dribble(a, dt, moveDir, sprinting) {
  a.touchCD -= dt;
  const fp = a.footPoint(); const d = dist2(fp, ball.pos);
  if ((!a.ai || a.sticky) && a.state === 'free' && !ball.held && ball.pos.y < 0.5 && d < 0.95) {
    // close control: the ball stays at the feet, a little further ahead when sprinting
    const sp = a.speed();
    const lead = sp < 0.4 ? 0.42 : sprinting ? (isBeginner() ? 0.72 : 0.9) : 0.5 + 0.05 * Math.sin(NOW * 10);
    const tx = a.pos.x + Math.cos(a.heading) * lead, tz = a.pos.z - Math.sin(a.heading) * lead;
    ball.vel.set(a.vel.x + (tx - ball.pos.x) * 14, 0, a.vel.z + (tz - ball.pos.z) * 14); ball.spin.set(0, 0, 0);
    if (sp > 0.8 && NOW - (a.touchSfx || 0) > (sprinting ? 0.36 : 0.3)) { sfx.touch(); a.touchSfx = NOW; }
    a.lastTouch = NOW; return false;
  }
  if (ball.held || ball.pos.y > 0.45 || d > 0.6 || a.touchCD > 0) return false;
  const sp = a.speed();
  const rel = Math.hypot(ball.vel.x - a.vel.x, ball.vel.z - a.vel.z);
  if (moveDir.lengthSq() < 0.01 || sp < 0.6) {
    // settle the ball at the feet
    ball.vel.x = (fp.x - ball.pos.x) * 3 + a.vel.x; ball.vel.z = (fp.z - ball.pos.z) * 3 + a.vel.z; ball.spin.set(0, 0, 0);
    a.touchCD = 0.12; return false;
  }
  const assist = a === user && isBeginner();
  const push = assist ? (sprinting ? rand(1.6, 2.2) : rand(0.6, 0.9)) : sprinting ? rand(2.4, 3.6) : rand(0.8, 1.4);
  const err = (assist ? 0.35 : 1) * (gauss() * (sprinting ? 6 : 3) * (1.45 - a.rating / 100) * DEG + (rel > 4 ? gauss() * 8 * DEG : 0));
  const dir = rotY(moveDir.clone().normalize(), err);
  const tsp = sp + push;
  ball.vel.set(dir.x * tsp, 0, dir.z * tsp); ball.spin.set(0, 0, 0);
  a.touchCD = sprinting ? 0.42 : 0.28; a.lastTouch = NOW;
  sfx.touch();
  return true;
}

/* ---------- striking ---------- */
const STRIKE = { driven: 0.32, finesse: 0.3, chip: 0.32, pass: 0.24, through: 0.25, lofted: 0.3, clear: 0.3 };
const CONTACT_DELAY = 0.02; // actual launch slightly after the animation's contact frame
function startStrike(a, style, power, aim, opts = {}) {
  const rel = new V3().subVectors(ball.pos, a.pos); const l = rel.dot(a.left());
  const leg = opts.leg || (l > 0.1 ? 'L' : 'R');
  if (opts.assist) a.heading = Math.atan2(-aim.z, aim.x); // beginner: square up to the target straight away
  a.state = 'strike';
  a.st = { t: 0, style, power, aim: aim.clone().setY(0).normalize(), dur: STRIKE[style], leg, done: false, entrySpeed: a.speed(), timing: null, ...opts };
  const anim = style === 'through' ? 'pass' : style === 'lofted' || style === 'clear' ? 'chip' : style;
  a.pl.act(() => P.strike(clamp(a.st.t / a.st.dur, 0, 1), leg === 'L' ? 'L' : 'R', anim), { rate: 22 });
}
function contactTime(a) { return a.st.dur * 0.5 + CONTACT_DELAY; }
function updateStrike(a, dt) {
  const st = a.st; st.t += dt;
  const tc = contactTime(a) - st.t;
  if (!st.done && tc > 0.02 && !ball.held) {
    // adjust the last strides so the plant foot lands beside the ball (limited, like a real approach)
    const fwd = a.dir(), left = a.left(); const idealL = st.leg === 'R' ? -0.1 : 0.1;
    const bp = ball.pos.clone().addScaledVector(ball.vel, tc); bp.y = 0;
    const want = bp.addScaledVector(fwd, -0.42).addScaledVector(left, -idealL);
    const need = new V3(want.x - a.pos.x, 0, want.z - a.pos.z);
    const v = need.multiplyScalar(1 / Math.max(tc, 0.06)); const vm = v.length(); const cap = st.assist ? 9 : 6.5;
    if (vm > cap) v.multiplyScalar(cap / vm);
    a.steer(v, dt, 30);
  } else a.vel.multiplyScalar(Math.exp(-3.5 * dt));
  // the body opens toward the target through the swing
  a.turnTo(st.aim.x, st.aim.z, dt, a.ai ? 3.5 : 9);
  a.faceLock = true;
  if (!st.done && st.t >= contactTime(a)) { st.done = true; st.result = resolveContact(a); if (st.onContact) st.onContact(st.result); }
  if (st.t >= st.dur + 0.1) { a.state = 'free'; a.faceLock = false; a.pl.release(9); }
}
// returns feedback data for the strike
function resolveContact(a) {
  const st = a.st; const fwd = a.dir(), left = a.left();
  const rel = new V3().subVectors(ball.pos, a.pos);
  const f = rel.dot(fwd), l = rel.dot(left);
  const idealL = st.leg === 'R' ? -0.1 : 0.1; const idealF = 0.42;
  const err = Math.hypot(f - idealF, (l - idealL) * 1.2) + Math.max(0, ball.pos.y - 0.3) * 0.7;
  const out = { style: st.style, power: st.power, leg: st.leg, weak: st.leg !== a.strong, speedRun: st.entrySpeed };
  if (ball.held || err > 0.75) { out.whiff = true; out.quality = 0; return out; }
  const q = clamp(1 - err / 0.55, 0, 1); out.quality = q;
  const R = st.rating ?? a.rating;
  const aim = st.aim.clone();
  const bodyAng = Math.abs(wrap(Math.atan2(-aim.z, aim.x) - a.heading)) / DEG; out.bodyAngle = bodyAng;
  const runSp = st.entrySpeed;
  const tf = st.assist ? 0.55 : 1; // beginner aim assist
  const isPass = st.style === 'pass' || st.style === 'through' || st.style === 'lofted' || st.style === 'clear';
  let sigma = (isPass ? 1.4 : 2.3) + 3.4 * (1 - R / 100);
  if (st.style === 'driven') sigma += 3.2 * Math.max(0, st.power - 0.75) / 0.25;
  sigma += Math.max(0, bodyAng - 32) * (isPass ? 0.06 : 0.085);
  sigma += (runSp / 7.5) * 1.5;
  sigma *= (1.6 - 0.6 * q) * (out.weak ? 1.35 : 1) * tf;
  if (st.pressure) sigma *= 1 + st.pressure * 0.5;
  if (st.ai) sigma = st.aiSigma ?? sigma;
  out.sigma = sigma;
  const angErr = gauss() * sigma * DEG;
  const from = ball.pos.clone();
  let dir = rotY(aim, angErr);
  // distance to the target plane or point
  let L, target;
  if (st.target) { L = Math.max(1, dist2(from, st.target)); }
  else if (dir.x > 0.08) L = Math.min(45, (HL - from.x) / dir.x + 0.3); else if (dir.x < -0.08) L = Math.min(45, (-HL - from.x) / dir.x + 0.3); else L = 25;
  const P_ = st.power;
  let speed, h;
  const vNoise = gauss() * (0.12 + 0.32 * P_ + 0.45 * (1 - q)) * (st.ai ? 0.6 : 1) * (tf < 1 ? 0.7 : 1);
  const sprintLift = runSp > 6 ? 0.22 : 0;
  ball.spin.set(0, 0, 0);
  if (st.style === 'driven') {
    speed = (17 + 13 * P_) * (0.7 + 0.3 * q) * (out.weak ? 0.9 : 1);
    h = (st.targetY != null ? st.targetY + 2.4 * Math.max(0, P_ - 0.78) : 0.15 + 1.8 * Math.pow(P_, 2.3)) + sprintLift + vNoise + (1 - q) * 0.35 * Math.sign(gauss());
    // poor contact puts some spin on it
    ball.spin.set(0, gauss() * 25 * (1 - q), 0);
  } else if (st.style === 'finesse') {
    speed = (13 + 8 * P_) * (0.82 + 0.18 * q);
    h = (st.targetY != null ? st.targetY : 0.3 + 1.05 * P_) + vNoise * 0.7;
    const w = (st.leg === 'R' ? 1 : -1) * (48 + 34 * P_) * (0.7 + 0.3 * q);
    ball.spin.set(0, w, 0);
  } else if (st.style === 'chip') {
    speed = 7 + 6.5 * P_;
    h = 1.2 + 0.7 * P_ + vNoise * 0.6;
  } else {
    // passes
    const toTarget = st.target ? dist2(from, st.target) : L;
    if (st.style === 'lofted' || st.style === 'clear') { speed = clamp(6 + toTarget * 0.55, 7, 16) * lerp(0.75, 1.25, P_); h = 0.4; }
    else { speed = clamp(st.speedOverride ?? (5 + 16 * P_), 4, 24); h = BR + 0.05; }
  }
  target = from.clone().addScaledVector(dir, L); target.y = Math.max(BR, h);
  if (st.style === 'pass' || st.style === 'through') {
    ball.vel.set(dir.x * speed, 0.3 + gauss() * 0.3 * (1 - q), dir.z * speed);
  } else if (st.style === 'lofted' || st.style === 'clear') {
    const T = L / speed; ball.vel.set(dir.x * speed, 0.5 * G * T, dir.z * speed);
  } else aimSolve(from, target, speed, ball.spin);
  ball.pos.y = Math.max(ball.pos.y, BR + 0.01);
  out.speed = speed; out.dir = dir; out.L = L; out.h = h;
  a.lastTouch = NOW; sfx.kick(clamp(speed / 30, 0.2, 1));
  ball.events.push('kick');
  return out;
}

/* ---------- goalkeeper ---------- */
// Shared keeper mechanics for AI and user keepers. side = +1 defends x = +HL, -1 defends x = -HL.
function keeperPose(k) { const p = P.keeperReady(NOW); const f = clamp(k.speed() / 3, 0, 1); const ph = NOW * 11; p.L.a += Math.sin(ph) * 0.22 * f; p.R.a -= Math.sin(ph) * 0.22 * f; p.hipsY += Math.abs(Math.cos(ph)) * 0.03 * f; return p; }
function keeperInit(k, side) {
  k.gk = { side, mode: 'pos', t: 0, diveDir: 0, diveH: 'mid', roll: 0, rollSign: 1, lift: 0, set: 0, reactAt: 0, held: false, early: false, moveAtStrike: 0, diveStartT: -1 };
  k.animSpeed = 0;
  k.pl.act(() => keeperPose(k), { rate: 8 });
}
function keeperGoalCentre(k) { return new V3(k.gk.side * HL, 0, 0); }
function keeperIdealSpot(k, bp) {
  const c = keeperGoalCentre(k); const toBall = new V3(bp.x - c.x, 0, bp.z - c.z); const dist = toBall.length() || 1; toBall.divideScalar(dist);
  const off = clamp(0.55 + (20 - dist) * 0.075, 0.55, 2.3);
  return { spot: c.clone().addScaledVector(toBall, Math.min(off, dist - 1)), dist };
}
function keeperDive(k, dirZ, height, dist) {
  const g = k.gk; g.mode = 'dive'; g.t = 0; g.diveDir = Math.sign(dirZ) || 1; g.diveH = height; g.diveStartT = NOW; g.diveReach = dist ? clamp((dist + 0.5) / 2.8, 0.35, 1) : 1;
  const right = k.left().multiplyScalar(-1); g.rollSign = Math.sign(right.z * g.diveDir) || 1;
  k.pl.act(() => P.dive(clamp(g.t / 0.26, 0, 1), g.diveH), { rate: 30 });
}
function keeperCatchStance(k, h) { const g = k.gk; g.mode = 'catch'; g.t = 0; g.catchH = h; k.pl.act(() => P.catchAt(g.catchH), { rate: 20 }); }
function keeperUpdatePhysics(k, dt) {
  const g = k.gk; g.t += dt;
  const root = k.pl.root;
  if (g.mode === 'dive') {
    const sp = (g.diveH === 'low' ? 4.6 : 5.4) * (g.diveReach || 1);
    const ramp = clamp(g.t / 0.16, 0, 1) * clamp(1 - (g.t - 0.45) / 0.2, 0, 1);
    k.vel.set(-g.side * 0.6 * ramp, 0, g.diveDir * sp * ramp);
    g.roll = damp(g.roll, g.diveH === 'low' ? 1.42 : 1.3, 5.5, dt);
    g.lift = g.t < 0.22 ? (g.diveH === 'high' ? 0.55 : g.diveH === 'mid' ? 0.35 : 0.12) * Math.sin(g.t / 0.22 * Math.PI / 2) : damp(g.lift, 0.12, 6, dt);
    if (g.t > 1.05) { g.mode = 'down'; g.t = 0; }
  } else if (g.mode === 'down') {
    k.vel.multiplyScalar(Math.exp(-8 * dt)); g.lift = damp(g.lift, 0, 6, dt);
    if (g.t > 0.7) { g.roll = damp(g.roll, 0, 7, dt); }
    if (g.t > 1.3) { g.mode = 'pos'; g.roll = 0; k.pl.act(() => keeperPose(k), { rate: 6 }); }
  } else if (g.mode === 'block') {
    k.vel.multiplyScalar(Math.exp(-6 * dt)); g.lift = 0; g.roll = 0;
    if (g.t > 1.1) { g.mode = 'pos'; k.pl.act(() => keeperPose(k), { rate: 6 }); }
  } else { g.roll = damp(g.roll, 0, 10, dt); g.lift = damp(g.lift, 0, 10, dt); }
  root.rotation.x = g.roll * g.rollSign;
  root.position.y = g.lift + Math.sin(g.roll) * 0.12;
}
// does the ball touch the keeper's body this frame? returns {part, d} or null
const _hp = new V3(), _hp2 = new V3(), _seg = new THREE.Line3(), _cp = new V3();
// swept test: distance from a body point to the ball's path this frame
function segDist(p) { _seg.set(ball.prev, ball.pos); _seg.closestPointToPoint(p, true, _cp); return _cp.distanceTo(p); }
function keeperContact(k) {
  const pl = k.pl; if (ball.held) return null;
  if (ball.pos.distanceTo(k.pos) > 3.5 && ball.prev.distanceTo(k.pos) > 3.5) return null;
  const hands = [pl.bonePos('L_Hand', _hp).clone(), pl.bonePos('R_Hand', _hp2).clone()];
  for (const h of hands) { const d = segDist(h); if (d < 0.22) { ball.pos.copy(_cp); return { part: 'hands', d, at: h }; } }
  for (const [bn, r] of [['Head', 0.2], ['Spine2', 0.3], ['Spine', 0.28], ['Pelvis', 0.26], ['L_Calf', 0.17], ['R_Calf', 0.17], ['L_Thigh', 0.18], ['R_Thigh', 0.18], ['L_Foot', 0.15], ['R_Foot', 0.15], ['L_Forearm', 0.15], ['R_Forearm', 0.15], ['L_UpperArm', 0.15], ['R_UpperArm', 0.15]]) {
    const p = pl.bonePos(bn, _hp).clone(); const d = segDist(p);
    if (d < r) { ball.pos.copy(_cp); return { part: bn === 'Head' || /Spine|Pelvis/.test(bn) ? 'body' : /Foot|Calf|Thigh/.test(bn) ? 'legs' : 'arms', d, at: p }; }
  }
  return null;
}
function keeperSaveResponse(k, c) {
  const sp = ball.vel.length(); const g = k.gk;
  const canHold = c.part === 'body' || (c.part === 'hands' && sp < 23 && g.mode !== 'dive') || (c.part === 'hands' && sp < 17);
  if (canHold && (g.wantCatch !== false)) { ball.held = k; ball.vel.set(0, 0, 0); ball.spin.set(0, 0, 0); g.held = true; return 'held'; }
  // parry: push the ball away from the goal and to the side
  const n = new V3().subVectors(ball.pos, c.at).normalize();
  const out = new V3(-g.side * 0.8, 0.2, 0).add(n.multiplyScalar(0.8)).normalize();
  ball.vel.copy(out.multiplyScalar(clamp(sp * 0.35, 3, 9))); ball.spin.set(0, 0, 0);
  return 'parried';
}
function keeperHoldBall(k) {
  if (ball.held !== k) return;
  const a = k.pl.bonePos('L_Hand', _hp), b = k.pl.bonePos('R_Hand', _hp2);
  ball.pos.copy(a).add(b).multiplyScalar(0.5);
}
// AI keeper brain for the finishing drill
function keeperAI(k, dt, ctx) {
  const g = k.gk;
  if (g.mode === 'pos' || g.mode === 'set') {
    const { spot, dist } = keeperIdealSpot(k, ball.pos);
    let target = spot;
    // one-on-one: close the shooter down
    if (ctx.oneOnOne && dist < 10 && dist > 2.5) target = new V3().lerpVectors(spot, ball.pos, clamp((10 - dist) / 9, 0, 0.62));
    if (ctx.loose && dist < 8) target = ball.pos.clone();
    const striking = ctx.shooter && ctx.shooter.state === 'strike' && !ctx.shooter.st.done;
    if (striking) { g.mode = 'set'; }
    if (g.mode === 'set' && !striking) g.mode = 'pos';
    const want = new V3(target.x - k.pos.x, 0, target.z - k.pos.z);
    const d = want.length();
    const maxSp = g.mode === 'set' ? 0 : (ctx.oneOnOne && dist < 10 ? 6.2 : 4.4);
    if (d > 0.05) want.multiplyScalar(Math.min(maxSp, d * 4) / d); else want.set(0, 0, 0);
    k.steer(want, dt, g.mode === 'set' ? 30 : 18);
    k.faceLock = true; k.turnTo(ball.pos.x - k.pos.x, ball.pos.z - k.pos.z, dt, 10);
    // spread in a close one-on-one when the shooter winds up
    if (ctx.oneOnOne && dist < 3.2 && striking && g.mode !== 'block') { g.mode = 'block'; g.t = 0; k.pl.act(() => P.block(clamp(g.t / 0.2, 0, 1)), { rate: 25 }); }
    // claim a loose ball
    if (dist2(k.pos, ball.pos) < 0.9 && ball.pos.y < 1.6 && !ctx.shooterHasBall) { ball.held = k; ball.vel.set(0, 0, 0); g.held = true; g.mode = 'hold'; return 'claimed'; }
  }
  if (g.mode === 'react') {
    k.vel.multiplyScalar(Math.exp(-10 * dt));
    if (NOW >= g.reactAt) {
      const v = ball.vel; const px = k.pos.x;
      const T = Math.abs(v.x) > 0.5 ? (px - ball.pos.x) / v.x : 0.4;
      const pz = ball.pos.z + v.z * clamp(T, 0, 2); const py = ball.pos.y + v.y * T - 0.5 * G * T * T;
      const dz = pz - k.pos.z;
      if (Math.abs(dz) < 0.5 && py < 1.9 && py > -0.5) keeperCatchStance(k, py);
      else keeperDive(k, dz, py > 1.35 ? 'high' : py < 0.45 ? 'low' : 'mid', Math.abs(dz));
    }
  }
  if (g.mode === 'catch') { k.vel.multiplyScalar(Math.exp(-10 * dt)); if (g.t > 1.2 && !g.held) { g.mode = 'pos'; k.pl.act(() => keeperPose(k), { rate: 6 }); } }
  keeperUpdatePhysics(k, dt);
  return null;
}
function keeperOnShot(k, shooter) {
  const g = k.gk; if (g.mode === 'dive' || g.mode === 'down') return;
  const moving = k.speed();
  g.moveAtStrike = moving;
  let rt = 0.21 + rand(0, 0.07) + (moving > 1.2 ? 0.1 : 0);
  // shooting at a keeper who is off his line gives him more time if the shot is central
  g.reactAt = NOW + rt; if (g.mode !== 'block') g.mode = 'react';
}

/* ---------- AI helpers ---------- */
function aiRun(a, dt, target, speed, accel = 9) {
  const want = new V3(target.x - a.pos.x, 0, target.z - a.pos.z); const d = want.length();
  if (d > 0.05) want.multiplyScalar(Math.min(speed, d * 3) / d); else want.set(0, 0, 0);
  a.steer(want, dt, accel);
}

/* ---------- modes ---------- */
let mode = 'loading', D = null, paused = false;
let user = null, userGK = null, keeper = null, opp = null, mate = null, mates = [], presser = null;
const actors = [];
function hideAll() { for (const a of actors) { a.show(false); a.sticky = false; a.runTo = null; } if (typeof clearBubbles === 'function') { clearBubbles(); spaceMark.visible = false; runLine.visible = false; setChip(''); } shotMark.visible = false; userRing.visible = false; userRing.material.color.setHex(0xffb547); targetRing.visible = false; cue.visible = false; }

function userKit() {
  const p = S.profile; const look = LOOKS[p ? p.look || 0 : 0];
  return { model: look.model, kit: { shirt: '#ffb547', shorts: '#13222a', socks: '#ffb547', trim: '#13222a', boots: '#111111', ink: '#13222a', number: p ? p.number : 10, name: p ? p.name.split(' ').slice(-1)[0] : '', tone: look.tone } };
}
function buildActors() {
  const uk = userKit();
  user = new Actor({ model: uk.model, kit: uk.kit, rating: 60 });
  userGK = new Actor({ model: uk.model, kit: { ...uk.kit, shirt: '#3fd0c9', socks: '#3fd0c9', trim: '#13222a', number: 1 }, gloves: '#f2efe6', rating: 60 });
  keeper = new Actor({ model: 'sm03', kit: { shirt: '#2b2f36', shorts: '#2b2f36', socks: '#2b2f36', trim: '#b6f05a', boots: '#b6f05a', ink: '#b6f05a', number: 1, name: 'Nwosu', tone: 'darker' }, gloves: '#b6f05a', ai: true, rating: 70 });
  opp = new Actor({ model: 'sm02', kit: { shirt: '#c8102e', shorts: '#ffffff', socks: '#c8102e', trim: '#ffffff', boots: '#f2efe6', ink: '#ffffff', number: 7, name: 'Bello', tone: 'darker' }, ai: true, rating: 70 });
  presser = new Actor({ model: 'sm03', kit: { shirt: '#c8102e', shorts: '#ffffff', socks: '#c8102e', trim: '#ffffff', boots: '#111111', ink: '#ffffff', number: 5, name: 'Okeke', tone: 'deep' }, ai: true, rating: 65 });
  mate = new Actor({ model: 'sm02', kit: { shirt: '#ffb547', shorts: '#13222a', socks: '#ffb547', trim: '#13222a', boots: '#f2efe6', ink: '#13222a', number: 8, name: 'Adeyemi', tone: 'deep' }, ai: true, rating: 72 });
  mates = [mate,
    new Actor({ model: 'sm03', kit: { shirt: '#ffb547', shorts: '#13222a', socks: '#ffb547', trim: '#13222a', boots: '#111111', ink: '#13222a', number: 11, name: 'Musa', tone: 'darker' }, ai: true, rating: 70 }),
    new Actor({ model: 'sm02', kit: { shirt: '#ffb547', shorts: '#13222a', socks: '#ffb547', trim: '#13222a', boots: '#111111', ink: '#13222a', number: 6, name: 'Obi', tone: 'darker' }, ai: true, rating: 70 })];
  actors.push(user, userGK, keeper, opp, presser, ...mates);
}
function refreshUserLook() {
  if (!user) return; const uk = userKit();
  if (user.pl.modelName !== uk.model) {
    // rebuild the user's actors for a different body model
    for (const a of [user, userGK]) { scene.remove(a.pl.root); actors.splice(actors.indexOf(a), 1); }
    user = new Actor({ model: uk.model, kit: uk.kit }); userGK = new Actor({ model: uk.model, kit: { ...uk.kit, shirt: '#3fd0c9', socks: '#3fd0c9', number: 1 }, gloves: '#f2efe6' });
    actors.push(user, userGK);
  } else { user.pl.setKit(uk.kit); userGK.pl.setKit({ ...uk.kit, shirt: '#3fd0c9', socks: '#3fd0c9', number: 1 }); }
}

function enterHub() {
  mode = 'hub'; D = null; paused = false;
  $('#hud').hidden = true; $('#pause').hidden = true; updateTouchVisibility(); setPower(null); hideFeedback(); hideMsg();
  hideAll();
  if (user) {
    user.show().place(0.6, 0.4, -Math.PI / 2 + 0.6); resetBall(1.1, 0.15);
    user.pl.playOnce('m_idle_shake_leg_01', { fade: 0.2, loop: true });
  }
  renderHub(); $('#hub').hidden = !S.profile;
  hubTick(0); camSnap();
}
function openGuide(id, practice) {
  const d0 = DRILLS[id]; const beg = isBeginner(); const d = beg ? { ...d0, ...BEGINNER[id] } : d0;
  const sh = openModal(`
    <div class="label">${esc(d.name)} · ${beg ? 'Beginner' : 'Pro'} · ${practice ? 'Practice' : 'Session'}</div>
    <h2 style="margin-top:8px">${esc(d.name)}</h2>
    <p class="muted">${esc(d.desc)}</p>
    <div class="btn-row" style="margin-top:10px"><button class="btn ${beg ? 'primary' : ''}" type="button" data-mode="beginner">Beginner</button><button class="btn ${beg ? '' : 'primary'}" type="button" data-mode="pro">Pro</button></div>
    <p class="muted" style="margin-top:8px">${beg ? 'One button. The game sets your feet and helps you aim. 70% of the points and rating.' : 'Full control. Every result comes from your technique. Full points and rating.'}</p>
    <div class="label" style="margin-top:14px">Controls: ${esc(scheme().name)}</div>${schemeButtons()}
    <p class="muted" style="margin-top:6px">${esc(scheme().blurb)}</p>
    <table class="keys"><thead><tr><th>Action</th><th>Keyboard</th><th>Controller</th></tr></thead><tbody>
      ${controlRows(id).map(([k, kb, pad]) => `<tr><td>${esc(k)}</td><td>${kb.split(' or ').map((x) => (x.length > 8 && /\s/.test(x) ? esc(x) : `<kbd>${esc(x)}</kbd>`)).join(' or ')}</td><td>${esc(pad)}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted" style="margin-top:8px">${beg ? 'On touch screens: the pad moves you and the big button does the action.' : 'On touch screens: the pad moves you, and the three round buttons match the actions in order.'}</p>
    <h3>${beg ? 'How to do well' : 'What good technique looks like'}</h3>
    <ul class="tips">${d.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <div class="btn-row"><button class="btn primary" type="button" data-go>${practice ? 'Start practice' : 'Start session'}</button>${mode === 'drill' ? '' : '<button class="btn" type="button" data-close>Back</button>'}</div>`, { wide: true });
  sh.querySelector('[data-go]').addEventListener('click', () => { closeModal(); if (mode === 'drill' && paused) { togglePause(); return; } startDrill(id, practice); });
  sh.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); if (mode === 'drill') updateHint(); openGuide(id, practice); }));
  sh.querySelectorAll('[data-scheme]').forEach((b) => b.addEventListener('click', () => { setScheme(b.dataset.scheme); openGuide(id, practice); }));
}
function setMode(m) { if (!S.profile) return; S.profile.mode = m; save(); renderHub(); if (D) updateHint(); toast(m === 'pro' ? 'Pro mode: full control, full rewards.' : 'Beginner mode: one button, assisted.'); }
function startDrill(id, practice = false) {
  if (!S.profile) return;
  closeModal(); mode = 'drill'; paused = false;
  $('#hub').hidden = true; $('#hud').hidden = false; $('#pause').hidden = true;
  hideAll(); hideMsg(); hideFeedback(); setPower(null);
  user.pl.stopOnce(0); userGK.pl.stopOnce(0);
  chaseYaw = 0;
  D = { id, practice, score: 0, rep: 0, phase: 'count', t: 0, stats: { made: 0 }, wait: 0, after: null, log: [] };
  $('#hudTitle').textContent = DRILLS[id].name + (practice ? ' · Practice' : '');
  updateHint(); updateTouchVisibility();
  DRILL_IMPL[id].start();
  camSnap(); sfx.ui();
}
function togglePause() {
  if (mode !== 'drill' || !D || D.phase === 'done') return;
  paused = !paused; $('#pause').hidden = !paused;
  $('#pauseNote').textContent = D.practice ? 'Practice sessions are not scored. Leave whenever you are ready.' : 'Leaving now ends the session without saving a score.';
  if (paused) $('#resumeBtn').focus();
}
$('#leaveBtn').addEventListener('click', togglePause);
$('#resumeBtn').addEventListener('click', togglePause);
$('#guideBtn').addEventListener('click', () => openGuide(D.id, D.practice));
$('#ctlPauseBtn').addEventListener('click', () => openControls());
$('#quitBtn').addEventListener('click', () => { const pr = D && D.practice; enterHub(); toast(pr ? 'Practice ended.' : 'Session left. No score saved.'); });
function endDrill() {
  if (!D || D.phase === 'done') return;
  D.phase = 'done'; D.doneT = 0; setPower(null); cue.visible = false;
  sfx.whistle(); showMsg('Full time', D.practice ? '' : `${fmt(Math.min(1000, D.score))} / 1,000`, 'var(--flood)', 1.8);
}
const nextRep = (fn, delay) => { D.wait = delay; D.after = fn; };
function repDone(points, msg, sub, color, fb) {
  D.score += points; if (points > 0) D.stats.made = (D.stats.made || 0) + 1;
  D.log.push({ points, msg }); showMsg(msg, sub, color, 1.6);
  if (fb) showFeedback(fb.title, fb.rows, fb.tip);
  const impl = DRILL_IMPL[D.id];
  setHud(impl.progress());
  const more = D.practice || D.rep < D.reps;
  nextRep(() => { hideFeedback(); more ? impl.setupRep() : endDrill(); }, fb ? 2.6 : 1.8);
}

/* ---------- drill: finishing ---------- */
const SCEN_F = ['edge', 'layoff', 'angle', 'breakaway', 'through'];
const finishing = {
  start() {
    D.reps = 10; D.stats = { made: 0, goals: 0, saved: 0, missed: 0, perfect: 0 };
    D.order = [...SCEN_F, ...SCEN_F.slice().sort(() => Math.random() - 0.5)];
    user.show(); keeper.show(); userRing.visible = true;
    keeperInit(keeper, 1);
    this.setupRep();
    camSnap();
  },
  progress() { return D.practice ? `Chance ${D.rep}` : `Chance ${Math.min(D.rep, D.reps)} of ${D.reps}`; },
  setupRep() {
    D.rep++; const sc = D.order[(D.rep - 1) % D.order.length]; D.sc = sc; D.state = 'play'; D.shot = null; D.hold = null; D.res = null; D.repT = 0;
    opp.show(false); mate.show(false); hideFeedback(); cue.visible = false; shotMark.visible = false;
    keeper.place(HL - 0.6, 0, Math.PI); keeperInit(keeper, 1);
    const z = rand(-4.5, 4.5);
    if (sc === 'edge') { user.place(HL - rand(12, 15), z, 0); resetBall(user.pos.x + 0.45, z - 0.08); }
    else if (sc === 'angle') { const s = Math.random() < 0.5 ? -1 : 1; user.place(HL - rand(5.5, 7), s * rand(7, 8.5), s * 0.6); resetBall(user.pos.x + 0.4, user.pos.z - s * 0.2); }
    else if (sc === 'breakaway') { user.place(HL - 26, z * 0.6, 0); resetBall(user.pos.x + 0.45, user.pos.z - 0.08); opp.show().place(user.pos.x - 3.5, user.pos.z + rand(-2, 2), 0); }
    else if (sc === 'layoff') {
      user.place(HL - 17, z * 0.4, 0);
      const s = Math.random() < 0.5 ? -1 : 1; mate.show().place(HL - 11, s * 7.5, Math.PI / 2 * s); resetBall(mate.pos.x + 0.4 * Math.cos(mate.heading), mate.pos.z - 0.4 * Math.sin(mate.heading));
      D.passAt = 1.0; D.passed = false;
    } else if (sc === 'through') {
      user.place(HL - 25, z * 0.5, 0); mate.show().place(HL - 31, user.pos.z + rand(-3, 3), 0); resetBall(mate.pos.x + 0.42, mate.pos.z - 0.08); D.passAt = 0.9; D.passed = false;
      opp.show().place(user.pos.x - 2.5, user.pos.z + 3, 0);
    }
    setHud(this.progress());
    const label = { edge: 'Edge of the box', angle: 'Tight angle', breakaway: 'One-on-one: defender chasing', layoff: 'Lay-off: hit it first time or take a touch', through: 'Through ball: time your run' }[sc];
    showMsg(label.split(':')[0], label.split(':')[1] || '', 'var(--chalk)', 1.3);
    drillCam(user.pos, user, user.pos.x - 8.5, 5, user.pos.z * 0.75, HL, 1, user.pos.z * 0.3);
  },
  shotButtons(inp) {
    for (const [k, style] of [['a', 'driven'], ['b', 'finesse'], ['c', 'chip']]) {
      if (inp[k].pressed && !D.hold && user.state === 'free') D.hold = { k, style, t: 0 };
    }
  },
  update(dt, inp) {
    D.repT += dt;
    const u = user; const sprint = inp.sprint;
    const mv = mapMove(inp);
    // player control
    if (u.state === 'free') {
      const hasBall = u.hasBall();
      const maxSp = (sprint ? 7.4 : 5.3) * (hasBall ? 0.92 : 1) * (D.hold ? 0.6 : 1);
      u.steer(mv.clone().multiplyScalar(maxSp * inp.mag), dt, sprint ? 34 : 45);
      u.integrate(dt);
      if (D.state === 'play') {
        dribble(u, dt, mv, sprint && inp.mag > 0.5 && !D.hold);
        const beg = isBeginner();
        if (beg) {
          if (inp.a.pressed && dist2(u.footPoint(), ball.pos) < 1.5 && !ball.held) {
            const far = HL - ball.pos.x; const pw = far > 18 ? 0.78 : 0.68;
            const am = shotAimPoint(inp, mv, ball.pos, pw, true, u.heading);
            const aim = new V3(HL - ball.pos.x, 0, am.tz - ball.pos.z).normalize();
            D.shotStyle = 'driven'; D.aimAt = am.pt;
            startStrike(u, 'driven', pw, aim, { rating: rating('shooting'), btn: 'a', assist: true, targetY: am.baseY, onContact: (r) => this.onContact(r) });
          }
        } else this.shotButtons(inp);
        if (D.hold) {
          D.hold.t += dt; const pw = Math.min(1.15, D.hold.t / 0.95);
          setPower(pw, { driven: 'Driven shot', finesse: 'Finesse', chip: 'Chip' }[D.hold.style], pw > 1 ? 'Too much power' : 'Release to strike');
          const am = shotAimPoint(inp, mv, ball.pos, pw, false, u.heading);
          if (!inp[D.hold.k].down) {
            const aim = new V3(HL - ball.pos.x, 0, am.tz - ball.pos.z).normalize();
            D.shotStyle = D.hold.style; D.aimAt = am.pt;
            startStrike(u, D.hold.style, Math.min(1.1, pw), aim, { rating: rating('shooting'), btn: D.hold.k, targetY: D.hold.style === 'chip' ? null : am.baseY, onContact: (r) => this.onContact(r) });
            u.st.timing = null; D.hold = null; setPower(null);
          }
        }
      }
    } else if (u.state === 'strike') {
      updateStrike(u, dt); u.integrate(dt);
    }
    // live shot reticle on the goal
    if (D.state === 'play' && !D.shot && u.state === 'free' && dist2(u.footPoint(), ball.pos) < 1.5 && HL - ball.pos.x < 30) {
      const beg = isBeginner(); const pw = D.hold ? Math.min(1.15, D.hold.t / 0.95) : beg ? (HL - ball.pos.x > 18 ? 0.78 : 0.68) : 0.6;
      const am = shotAimPoint(inp, mv, ball.pos, pw, beg, u.heading);
      showShotMark(am.tz, shotHeight(D.hold ? D.hold.style : 'driven', pw, am.baseY), !!D.hold || beg);
    } else if (!D.shot && u.state !== 'strike') shotMark.visible = false;
    // supporting AI
    if (D.sc === 'layoff' || D.sc === 'through') this.mateLogic(dt);
    if (D.sc === 'breakaway' || D.sc === 'through') this.chaser(dt);
    if (mate.visible) mate.finish(dt);
    if (opp.visible) opp.finish(dt);
    // ball and keeper
    ballStep(dt);
    if (ball.held === keeper) keeperHoldBall(keeper);
    const oneOnOne = D.sc === 'breakaway' || D.sc === 'through';
    const res = keeperAI(keeper, dt, { shooter: u, oneOnOne, loose: !u.hasBall() && !D.shot && hlen(ball.vel) < 3 && D.repT > 2, shooterHasBall: u.hasBall() });
    keeper.integrate(dt); keeper.finish(dt);
    if (res === 'claimed' && D.state === 'play') this.result('claimed');
    // shot outcome
    if (D.shot && D.state === 'play') {
      const c = ball.net ? null : keeperContact(keeper);
      if (c && !D.shot.touched) { D.shot.touched = true; const r = keeperSaveResponse(keeper, c); sfx.thud(); this.result(r === 'held' ? 'saved' : 'parried'); }
      else if (ball.events.includes('post') || ball.events.includes('bar')) { sfx.post(); D.shot.woodwork = true; }
      if (D.state === 'play') {
        if (ball.net === 1) this.result('goal');
        else if (ball.pos.x > HL + 0.3 && ball.net !== 1) this.result(D.shot.woodwork ? 'post' : ball.pos.y > GH ? 'over' : 'wide');
        else if (NOW - D.shot.t > 3 && hlen(ball.vel) < 1) this.result('short');
      }
    }
    if (D.shot && !D.shot.cross && ball.pos.x >= HL - 0.05) D.shot.cross = { z: ball.pos.z, y: ball.pos.y };
    if (D.state === 'play' && !D.shot && u.state === 'free') {
      if (Math.abs(ball.pos.z) > HW || ball.pos.x > HL + 0.2 || ball.pos.x < -HL) this.result('out');
      else if (!D.practice && D.repT > 20) this.result('timeout');
    }
    ball.events.length = 0;
    u.finish(dt);
    // camera: behind the shooter, looking at goal
    const cz = u.pos.z * 0.7;
    const foc = new V3().lerpVectors(u.pos, new V3(HL, 0, 0), 0.3);
    if (D.shot) drillCam(foc, u, u.pos.x - 7.5, 4.4, cz, HL, 1, ball.pos.z * 0.4, 2.2);
    else drillCam(foc, u, u.pos.x - 8.5, 5, cz, HL, 1, u.pos.z * 0.3, 3.5);
  },
  onContact(r) {
    if (r.whiff) { this.feedback(r); this.result('whiff'); return; }
    D.shot = { t: NOW, r, touched: false };
    D.lastR = r;
    keeperOnShot(keeper, user);
  },
  mateLogic(dt) {
    const m = mate;
    if (!D.passed && D.repT > D.passAt && m.state === 'free') {
      // play the ball into the striker's path
      const lead = D.sc === 'through' ? 1.25 : 0.55;
      const tgt = user.pos.clone().addScaledVector(user.vel.lengthSq() > 1 ? user.vel.clone() : new V3(3, 0, 0), lead);
      if (D.sc === 'through') { tgt.x = Math.max(tgt.x, HL - 13); tgt.x = Math.min(tgt.x, HL - 9); }
      else { tgt.x = clamp(tgt.x, HL - 15, HL - 8); }
      const aim = new V3(tgt.x - ball.pos.x, 0, tgt.z - ball.pos.z).normalize();
      m.turnTo(aim.x, aim.z, 1, 99);
      startStrike(m, 'pass', 0.6, aim, { ai: true, aiSigma: 2, target: tgt, speedOverride: clamp(dist2(ball.pos, tgt) * 0.95 + 4, 8, 15) });
      D.passed = true;
    }
    if (m.state === 'strike') { updateStrike(m, dt); } else { m.vel.multiplyScalar(Math.exp(-4 * dt)); m.faceLock = true; m.turnTo(user.pos.x - m.pos.x, user.pos.z - m.pos.z, dt, 4); }
    m.integrate(dt);
  },
  chaser(dt) {
    const c = opp; if (D.state !== 'play') { c.vel.multiplyScalar(Math.exp(-3 * dt)); c.integrate(dt); return; }
    const sp = D.sc === 'through' ? 6.4 : 6.9;
    aiRun(c, dt, ball.pos, sp, 8); c.integrate(dt); c.faceLock = false;
    if (!D.shot && user.state === 'free' && dist2(c.footPoint(), ball.pos) < 0.55 && ball.pos.y < 0.5 && D.repT > 1.2) {
      ball.vel.set(rand(-2, 1), 0.5, rand(-5, 5)); sfx.thud(); this.result('tackled');
    }
  },
  feedback(r) {
    const q = r.quality ?? 0;
    const rows = [];
    rows.push(['Shot', { driven: 'Driven', finesse: 'Finesse curler', chip: 'Chip' }[r.style]]);
    if (r.whiff) rows.push(['Contact', 'Missed the ball', 'bad']);
    else rows.push(['Contact', q > 0.75 ? 'Clean' : q > 0.45 ? 'Decent' : 'Scuffed', q > 0.75 ? 'good' : q > 0.45 ? 'ok' : 'bad']);
    if (!r.whiff) {
      const ba = r.bodyAngle;
      rows.push(['Body shape', ba < 20 ? 'Square to target' : ba < 40 ? 'Open, good' : 'Across your body', ba < 40 ? 'good' : 'bad']);
      const pw = Math.round(r.power * 100); rows.push(['Power', pw + '%', r.style === 'driven' && pw > 80 ? 'bad' : pw < 35 ? 'ok' : 'good']);
      rows.push(['Foot', r.weak ? 'Weaker foot' : 'Strong foot', r.weak ? 'ok' : 'good']);
    }
    let tip = '';
    if (r.whiff) tip = 'The ball was not in front of your kicking foot. Take a touch to set it before you strike.';
    else if (q < 0.45) tip = 'Strike when the ball sits just ahead of your foot, not under you or out of reach.';
    else if (r.bodyAngle > 40) tip = 'Turn your body toward the target before shooting, or use finesse to bend it across you.';
    else if (r.style === 'driven' && r.power > 0.8) tip = 'Too much power. Release in the green zone to keep it down.';
    else if (r.weak) tip = 'Weaker foot. Shift the ball onto your stronger foot when you have time.';
    else if (r.style === 'driven' && r.speedRun > 6) tip = 'Shooting at full sprint costs accuracy. Take a calmer touch first.';
    return { title: 'Strike technique', rows, tip };
  },
  result(kind) {
    if (D.state !== 'play') return; D.state = 'over';
    const r = D.lastR || {}; const fb = r.style ? this.feedback(r) : null;
    if (r.quality > 0.8) D.stats.perfect++;
    if (kind === 'goal') {
      const az = Math.abs(ball.pos.z), y = ball.pos.y;
      const place = Math.round(18 * clamp(az / 2.2, 0, 1) + 7 * clamp(y / 1.7, 0, 1));
      const tech = (r.quality > 0.8 ? 10 : r.quality > 0.6 ? 5 : 0) + (r.bodyAngle < 30 ? 5 : 0);
      const pts = clamp(60 + place + tech, 0, 100); D.stats.goals++;
      user.pl.playOnce(Math.random() < 0.5 ? 'm_cheer_03' : 'm_cheer_01', { fade: 0.3 }); keeper.pl.release(4);
      sfx.cheer(); cheerT = 2.4;
      repDone(pts, 'Goal', az > 1.8 ? `Into the corner +${pts}` : `+${pts}`, 'var(--flood)', fb);
    } else {
      const map = {
        saved: ['Saved', 'He held it. Go further from his reach.'], parried: ['Parried', 'He got a hand to it.'], post: ['Off the woodwork', 'Inches away'],
        over: ['Over the bar', 'Too much power or poor contact'], wide: ['Wide', 'Aim inside the post'], short: ['No power', 'Hold longer for more power'],
        whiff: ['Missed it', 'Set the ball before you strike'], out: ['Out of play', 'Keep the ball under control'], timeout: ['Chance gone', 'Shoot when the chance is on'], tackled: ['Tackled', 'The defender caught you. Shoot earlier or knock it past him.'], claimed: ['Keeper claims', 'You let the ball run too far from you']
      };
      const [m, s] = map[kind] || ['Missed', ''];
      if (kind === 'saved' || kind === 'parried' || kind === 'claimed') D.stats.saved++; else D.stats.missed++;
      sfx.groan(); user.pl.playOnce('m_gestic_shrug_01', { fade: 0.3 });
      repDone(0, m, s, kind === 'post' ? 'var(--flood)' : 'var(--chalk)', fb);
    }
  },
  summary() { const s = D.stats; return [['Goals', `${s.goals} of ${D.reps}`], ['Saved or claimed', s.saved], ['Missed or blocked', s.missed], ['Clean strikes', s.perfect]]; }
};

/* ---------- drill: goalkeeping ---------- */
const SCEN_K = ['edge', 'angle', 'oneonone', 'penalty', 'edge', 'angle', 'oneonone', 'edge', 'penalty', 'oneonone'];
const saves = {
  start() {
    D.reps = 10; D.stats = { made: 0, saves: 0, conceded: 0, early: 0 };
    userGK.show(); opp.show(); userRing.visible = true;
    keeperInit(userGK, -1);
    this.setupRep(); camSnap();
  },
  progress() { return D.practice ? `Shot ${D.rep}` : `Shot ${Math.min(D.rep, D.reps)} of ${D.reps}`; },
  setupRep() {
    D.rep++; const sc = SCEN_K[(D.rep - 1) % SCEN_K.length]; D.sc = sc; D.state = 'play'; D.shot = null; D.repT = 0; D.diveT = null; D.posScore = null;
    const k = userGK; k.place(-HL + 0.6, 0, 0); keeperInit(k, -1); k.gk.mode = 'pos';
    let x, z;
    if (sc === 'edge') { x = -HL + rand(12, 15); z = rand(-5, 5); }
    else if (sc === 'angle') { x = -HL + rand(6, 8); z = (Math.random() < 0.5 ? -1 : 1) * rand(6, 8); }
    else if (sc === 'penalty') { x = -HL + 6; z = 0; }
    else { x = -HL + 24; z = rand(-3, 3); }
    opp.place(x + 0.8, z, Math.PI); resetBall(x + 0.35, z + 0.05);
    D.plan = { shootAt: sc === 'oneonone' ? rand(5, 8.5) : sc === 'penalty' ? 0 : rand(9.5, 12.5), touches: sc === 'penalty' ? 0 : 1 };
    D.runUp = sc === 'penalty' ? 1.0 : 0;
    setHud(this.progress());
    const label = { edge: 'Edge of the box', angle: 'Angled drive', oneonone: 'One-on-one', penalty: 'Penalty' }[sc];
    showMsg(label, sc === 'oneonone' ? 'Come off your line and close him down' : sc === 'penalty' ? 'Stay on your line until he strikes' : 'Get on the angle and get set', 'var(--chalk)', 1.3);
    drillCam(new V3(-HL + 6, 0, 0), userGK, -HL - 7.5, 4.5, 0, -HL + 9, 1, 0);
  },
  update(dt, inp) {
    D.repT += dt;
    const k = userGK, g = k.gk; const mv = mapMove(inp);
    // user keeper control
    if (g.mode === 'pos' || g.mode === 'set') {
      const beg = isBeginner();
      const rush = inp.b.down && !beg;
      const maxSp = rush ? 6.4 : inp.sprint ? 5.6 : 4.4;
      if (beg && inp.mag < 0.2) {
        // assisted positioning: on the angle, and set when the shooter strikes
        const { spot } = keeperIdealSpot(k, ball.pos); const want = new V3(spot.x - k.pos.x, 0, spot.z - k.pos.z); const d = want.length();
        const set = opp.state === 'strike' || !!D.shot;
        if (d > 0.05 && !set) want.multiplyScalar(Math.min(4.4, d * 4) / d); else want.set(0, 0, 0);
        k.steer(want, dt, set ? 30 : 18);
      } else k.steer(mv.clone().multiplyScalar(maxSp * inp.mag), dt, 45);
      k.faceLock = true; k.turnTo(ball.pos.x - k.pos.x, ball.pos.z - k.pos.z, dt, 10);
      if (k.pos.x < -HL + 0.2) { k.pos.x = -HL + 0.2; k.vel.x = Math.max(0, k.vel.x); }
      if (inp.a.pressed) {
        let dz = inp.aimPt ? clamp((inp.aimPt.z - k.pos.z) / 1.2, -1, 1) : mv.z; const before = !D.shot;
        if (beg) {
          // assisted dive: read the ball's path once it is struck
          if (D.shot && ball.vel.x < -1) { const T = (k.pos.x - ball.pos.x) / ball.vel.x; dz = ball.pos.z + ball.vel.z * clamp(T, 0, 2) - k.pos.z; if (Math.abs(dz) < 0.4) dz = 0; }
          else dz = 0;
        }
        if (Math.abs(dz) > 0.25) { const py = D.shot ? clamp(ball.pos.y + ball.vel.y * 0.25, 0, 2) : 0.9; keeperDive(k, dz, py > 1.3 ? 'high' : py < 0.45 ? 'low' : 'mid'); }
        else keeperCatchStance(k, D.shot ? clamp(ball.pos.y, 0.3, 1.9) : 1.0);
        D.diveT = NOW; D.diveEarly = before && opp.state === 'strike' ? 'Early' : before ? 'Guessed' : null;
      }
      if (inp.c.pressed && !beg) { g.mode = 'block'; g.t = 0; k.pl.act(() => P.block(clamp(g.t / 0.2, 0, 1)), { rate: 25 }); D.diveT = NOW; }
    } else if (g.mode === 'catch') { k.vel.multiplyScalar(Math.exp(-10 * dt)); if (g.t > 1.1 && !g.held) { g.mode = 'pos'; k.pl.act(() => keeperPose(k), { rate: 6 }); } }
    keeperUpdatePhysics(k, dt);
    k.integrate(dt); k.finish(dt);
    // shooter
    this.shooter(dt);
    opp.finish(dt);
    ballStep(dt);
    if (ball.held === k) keeperHoldBall(k);
    if (D.shot && D.state === 'play') {
      const c = ball.net ? null : keeperContact(k);
      if (c && !D.shot.touched) { D.shot.touched = true; g.wantCatch = g.mode === 'catch' || c.part === 'body'; const r = keeperSaveResponse(k, c); sfx.thud(); this.result(r === 'held' ? 'held' : 'parried'); }
      else if (ball.events.includes('post') || ball.events.includes('bar')) { sfx.post(); D.shot.wood = true; }
      if (D.state === 'play') {
        if (ball.net === -1) this.result('goal');
        else if (ball.pos.x < -HL - 0.3) this.result('missed');
        else if (NOW - D.shot.t > 3) this.result('missed');
      }
    }
    // smother: rush and collect the ball off the shooter's feet
    if (D.state === 'play' && !D.shot && (g.mode === 'pos' || g.mode === 'block') && dist2(k.footPoint(), ball.pos) < 0.7 && ball.pos.y < 0.6 && opp.state !== 'strike') {
      ball.held = k; ball.vel.set(0, 0, 0); g.held = true; sfx.thud(); this.result('smothered');
    }
    ball.events.length = 0;
    drillCam(new V3(-HL + 6, 0, (k.pos.z + ball.pos.z) * 0.3), k, -HL - 7.5, 4.6, k.pos.z * 0.35, -HL + 9, 1, (k.pos.z + ball.pos.z) * 0.2, 4);
  },
  shooter(dt) {
    const o = opp, k = userGK;
    if (D.state !== 'play') { if (o.state === 'strike') updateStrike(o, dt); else o.vel.multiplyScalar(Math.exp(-3 * dt)); o.integrate(dt); return; }
    if (o.state === 'strike') { updateStrike(o, dt); o.integrate(dt); return; }
    if (D.shot) { o.vel.multiplyScalar(Math.exp(-3 * dt)); o.integrate(dt); return; }
    const toGoal = new V3(-HL - o.pos.x, 0, -o.pos.z); const dist = toGoal.length(); toGoal.normalize();
    // penalty run-up
    if (D.sc === 'penalty') {
      if (D.repT < 1.4) { o.vel.set(0, 0, 0); o.faceLock = true; o.turnTo(-1, 0, dt, 6); if (!D.penSet) { o.pos.set(ball.pos.x + 2.2, 0, ball.pos.z + 1); D.penSet = true; } o.integrate(dt); return; }
      aiRun(o, dt, new V3(ball.pos.x + 0.45, 0, ball.pos.z + 0.12), 4.2, 14); o.integrate(dt); o.faceLock = false;
      if (dist2(o.pos, ball.pos) < 0.62) this.takeShot(dist);
      return;
    }
    // recover a loose ball first
    if (!o.hasBall() && dist2(o.footPoint(), ball.pos) > 0.55) {
      const lead = ball.pos.clone().addScaledVector(ball.vel, 0.25); aiRun(o, dt, lead, 6.4, 12); o.integrate(dt); o.faceLock = false;
      dribble(o, dt, new V3(toGoal.x, 0, toGoal.z), false);
      if (D.repT > 12) this.result('missed');
      return;
    }
    // dribble at goal, with a slight curve away from the keeper
    const kz = k.pos.z; const side = Math.sign(o.pos.z - kz) || 1;
    const wantDir = new V3(toGoal.x, 0, toGoal.z + side * 0.15).normalize();
    const sp = D.sc === 'oneonone' ? 6.2 : 4.6;
    o.steer(wantDir.clone().multiplyScalar(sp), dt, 8); o.integrate(dt);
    dribble(o, dt, wantDir, D.sc === 'oneonone');
    if (dist < D.plan.shootAt && o.hasBall() && D.repT > 0.6) this.takeShot(dist);
    // round the keeper if he commits early in a one-on-one
    if (D.sc === 'oneonone' && dist2(o.pos, k.pos) < 2.2 && k.gk.mode === 'dive' && o.hasBall()) this.takeShot(dist, true);
  },
  takeShot(dist, open) {
    const o = opp, k = userGK;
    // pick the bigger gap; punish a keeper who has already gone
    const gapL = k.pos.z - (-GW / 2), gapR = GW / 2 - k.pos.z;
    let side = gapR > gapL ? 1 : -1;
    if (k.gk.mode === 'dive') side = -k.gk.diveDir;
    else if (Math.random() < 0.25) side = -side;
    const offLine = k.pos.x + HL;
    let style = 'driven';
    if (offLine > 3.2 && dist > 7 && !open) style = 'chip';
    else if (D.sc === 'angle' && Math.random() < 0.5) style = 'finesse';
    const tz = side * rand(1.5, 2.25), ty = rand(0.2, 1.6);
    const aim = new V3(-HL - ball.pos.x, 0, tz - ball.pos.z).normalize();
    o.turnTo(aim.x, aim.z, 1, 99);
    const power = style === 'chip' ? 0.7 : D.sc === 'penalty' ? rand(0.65, 0.85) : rand(0.55, 0.8);
    startStrike(o, style, power, aim, { ai: true, aiSigma: 2.6, rating: 75, leg: 'R', onContact: (r) => {
      if (r.whiff) { this.result('missed'); return; }
      D.shot = { t: NOW, touched: false, style };
      // record the keeper's technique at the moment of the strike
      const { spot } = keeperIdealSpot(k, ball.pos);
      D.posErr = dist2(k.pos, spot); D.moving = k.speed();
    } });
    // shooters aim height by adjusting power slightly
    o.st.aiHeight = ty;
  },
  result(kind) {
    if (D.state !== 'play') return; D.state = 'over';
    const g = userGK.gk;
    const rows = [];
    const pe = D.posErr ?? 0;
    rows.push(['Position', pe < 0.6 ? 'On the angle' : pe < 1.3 ? 'Slightly off' : 'Out of position', pe < 0.6 ? 'good' : pe < 1.3 ? 'ok' : 'bad']);
    if (D.moving !== undefined) rows.push(['Feet at the strike', D.moving < 1 ? 'Set' : 'Still moving', D.moving < 1 ? 'good' : 'bad']);
    let reaction = 'No dive';
    if (D.diveT) {
      const rel = D.shot ? D.diveT - D.shot.t : -1;
      reaction = D.diveEarly ? 'Went early' : rel < 0 ? 'Went early' : rel < 0.32 ? 'Sharp' : 'Late';
    }
    rows.push(['Reaction', reaction, reaction === 'Sharp' ? 'good' : reaction === 'No dive' ? '' : 'bad']);
    let tip = '';
    if (pe > 1.2) tip = 'Stand on the line between the ball and the centre of your goal.';
    else if (D.moving > 1) tip = 'Stop moving as the shooter plants his foot. A set keeper reacts faster.';
    else if (reaction === 'Went early') tip = 'Wait for the strike. Shooters punish a keeper who goes early.';
    else if (reaction === 'Late') tip = 'React the moment the ball is struck.';
    else if (kind === 'goal') tip = 'Push off in the direction of the shot with the stick held toward it.';
    const fb = { title: 'Keeping technique', rows, tip };
    if (kind === 'held' || kind === 'parried' || kind === 'smothered') {
      const pts = kind === 'held' ? 100 : kind === 'smothered' ? 100 : 85; D.stats.saves++;
      sfx.cheer(); cheerT = 1.8;
      repDone(pts, kind === 'held' ? 'Held' : kind === 'smothered' ? 'Smothered' : 'Saved', kind === 'parried' ? `Parried clear +${pts}` : `+${pts}`, 'var(--flood)', fb);
    } else if (kind === 'missed') {
      D.stats.saves++; repDone(70, 'Off target', 'He missed. Your positioning made it hard. +70', 'var(--chalk)', fb);
    } else {
      D.stats.conceded++; sfx.groan(); opp.pl.playOnce('m_cheer_03', { fade: 0.3 });
      repDone(0, 'Goal', 'Conceded', 'var(--alert)', fb);
    }
  },
  summary() { const s = D.stats; return [['Saves', `${s.saves} of ${D.reps}`], ['Goals conceded', s.conceded]]; }
};
// AI shooters hit a target height: hook into resolveContact for AI
const _resolve = resolveContact;

/* ---------- drill: defending ---------- */
const defending = {
  start() {
    D.reps = 8; D.stats = { made: 0, won: 0, fouls: 0, beaten: 0, contained: 0, cards: 0 };
    user.show(); opp.show(); userRing.visible = true;
    this.setupRep(); camSnap();
  },
  progress() { return D.practice ? `Attack ${D.rep}` : `Attack ${Math.min(D.rep, D.reps)} of ${D.reps}`; },
  setupRep() {
    D.rep++; D.state = 'play'; D.repT = 0; D.tk = null; D.goalSideT = 0; D.closeT = 0; D.jockeyT = 0; D.containT = 0;
    user.place(-HL + 11, rand(-2, 2), 0);
    opp.place(rand(6, 9), rand(-5, 5), Math.PI); resetBall(opp.pos.x - 0.5, opp.pos.z);
    D.ai = { mode: 'advance', t: 0, move: null, weave: rand(0, 6), skill: 0.55 + D.rep * 0.04, nextMoveT: rand(0.3, 0.8) };
    setHud(this.progress());
    showMsg('Attack ' + D.rep, D.rep === 1 ? 'Hold K or X to jockey' : '', 'var(--chalk)', 1.1);
  },
  update(dt, inp) {
    D.repT += dt;
    const u = user, o = opp; const mv = mapMove(inp);
    const jockey = (isBeginner() ? dist2(u.pos, o.pos) < 4.5 : inp.b.down) && !inp.sprint && u.state === 'free'; D.userJockey = jockey;
    // defender
    if (u.state === 'free') {
      const maxSp = jockey ? 4.6 : inp.sprint ? 7.3 : 5.4;
      u.steer(mv.clone().multiplyScalar(maxSp * inp.mag), dt, jockey ? 42 : inp.sprint ? 32 : 42);
      u.integrate(dt);
      if (jockey) {
        u.faceLock = true; u.turnTo(o.pos.x - u.pos.x, o.pos.z - u.pos.z, dt, 12); u.animSpeed = 0;
        if (u.pl.proc !== D.jockeyFn) { D.jockeyFn = () => { const p = P.jockey(NOW); const lat = u.vel.dot(u.left()); const ph = NOW * 9; p.L.a += Math.sin(ph) * 0.18 * clamp(Math.abs(lat) / 3, 0, 1); p.R.a -= Math.sin(ph) * 0.18 * clamp(Math.abs(lat) / 3, 0, 1); return p; }; u.pl.act(D.jockeyFn, { rate: 12 }); }
        D.jockeyT += dt;
      } else { if (u.pl.proc === D.jockeyFn) u.pl.release(10); u.faceLock = false; u.animSpeed = null; }
      if (D.state === 'play' && inp.a.pressed) this.tackle('stand');
      if (D.state === 'play' && inp.c.pressed && !isBeginner()) this.tackle('slide');
    } else this.updateTackle(dt);
    // attacker
    this.attacker(dt);
    ballStep(dt);
    // metrics: goal-side and distance
    if (D.state === 'play') {
      const goalSide = u.pos.x < o.pos.x && Math.abs(u.pos.z - o.pos.z) < 2.4; if (goalSide) D.goalSideT += dt;
      const d = dist2(u.pos, o.pos); if (d > 1.2 && d < 3.2 && goalSide) D.containT += dt;
      if (d < 1.1) D.closeT += dt;
      // contained long enough: attacker turns back
      if (D.containT > 5.5 && D.ai.mode !== 'turnback') { D.ai.mode = 'turnback'; D.ai.t = 0; }
      // beaten: attacker clear and shooting
      if (o.pos.x < -HL + 8.5 && o.hasBall() && !(u.pos.x < o.pos.x && Math.abs(u.pos.z - o.pos.z) < 1.4)) this.attackerShoots();
      if (D.repT > 16) { this.result('contained'); }
    }
    ball.events.length = 0;
    u.finish(dt); o.finish(dt);
    const mx = (u.pos.x + o.pos.x) / 2, mz = (u.pos.z + o.pos.z) / 2;
    drillCam(new V3(mx, 0, mz), u, u.pos.x - 9, 6.5, mz * 0.6 + u.pos.z * 0.2, mx + 2.5, 0.8, mz, 3.2);
  },
  attacker(dt) {
    const o = opp, u = user, A = D.ai; A.t += dt;
    if (o.state === 'strike') { updateStrike(o, dt); o.integrate(dt); return; }
    if (D.state !== 'play') { o.vel.multiplyScalar(Math.exp(-2 * dt)); o.integrate(dt); if (o.state === 'down') { o.st.t += dt; } return; }
    if (!o.hasBall() && dist2(o.footPoint(), ball.pos) > 0.8 && A.mode !== 'turnback') {
      // chase a loose touch; the defender can nip in first
      const lead = ball.pos.clone().addScaledVector(ball.vel, 0.2); aiRun(o, dt, lead, 6.6, 12); o.integrate(dt); o.faceLock = false;
      dribble(o, dt, new V3(-1, 0, 0), false); D.exposed = 1;
      if (dist2(user.footPoint(), ball.pos) < 0.5 && user.state === 'free' && dist2(o.pos, ball.pos) > 0.9) { ball.vel.set(-2, 0, 0); this.result('won-stand'); }
      return;
    }
    const toGoal = new V3(-HL - o.pos.x, 0, -o.pos.z); const dg = toGoal.length(); toGoal.normalize();
    const rel = new V3(u.pos.x - o.pos.x, 0, u.pos.z - o.pos.z); const dd = rel.length();
    const defAhead = rel.dot(toGoal) > 0; // defender between attacker and goal
    let want = toGoal.clone(); let sp = 4.6; let sprint = false;
    if (A.mode === 'turnback') {
      want = new V3(1, 0, Math.sign(o.pos.z) * 0.2).normalize(); sp = 3.5;
      if (A.t > 1.4) { this.result('contained'); return; }
    } else if (A.mode === 'move' && A.move) {
      const m = A.move; m.t += dt;
      if (m.kind === 'feint') {
        if (m.t < 0.32) { want = new V3(toGoal.x, 0, m.fake * 0.9).normalize(); sp = 3.2; o.pl.act(() => { const p = P.jockey(0); p.spineRoll = m.fake * 0.35; p.hipsYaw = 0; p.spinePitch = 0.2; p.hipsY = -0.1; return p; }, { rate: 14 }); }
        else { o.pl.release(10); want = new V3(toGoal.x * 0.6, 0, -m.fake).normalize(); sp = 6.8; sprint = true; }
        if (m.t > 1.0) { A.mode = 'advance'; A.nextMoveT = A.t + rand(0.8, 1.6); }
      } else if (m.kind === 'knock') {
        want = new V3(toGoal.x, 0, m.side * 0.75).normalize(); sp = 7.2; sprint = true; if (m.t > 1.1) { A.mode = 'advance'; A.nextMoveT = A.t + rand(0.8, 1.6); }
      } else if (m.kind === 'stopgo') {
        if (m.t < 0.45) { sp = 0.6; } else { sp = 6.8; sprint = true; want = new V3(toGoal.x, 0, m.side * 0.45).normalize(); }
        if (m.t > 1.2) { A.mode = 'advance'; A.nextMoveT = A.t + rand(0.8, 1.6); }
      } else if (m.kind === 'cut') {
        want = new V3(toGoal.x * 0.3, 0, m.side).normalize(); sp = 5.2; if (m.t > 0.7) { A.mode = 'advance'; A.nextMoveT = A.t + rand(0.6, 1.2); }
      }
    } else {
      // advance with a gentle weave, keep the ball on the far side of the defender
      want = new V3(toGoal.x, 0, toGoal.z + Math.sin(A.t * 1.3 + A.weave) * 0.35).normalize(); sp = 4.4;
      if (defAhead && dd < 4.2 && A.t > A.nextMoveT) {
        const charging = !(user.st && false) && hlen(u.vel) > 4.2 && u.vel.dot(rel.clone().normalize().multiplyScalar(-1)) > 3;
        const r = Math.random();
        const sideOpen = Math.sign(o.pos.z - u.pos.z) || (Math.random() < 0.5 ? -1 : 1);
        let kind;
        if (charging) kind = 'knock';
        else if (dd < 1.6) kind = r < 0.5 ? 'cut' : 'feint';
        else kind = r < 0.45 ? 'feint' : r < 0.7 ? 'stopgo' : r < 0.85 ? 'knock' : 'cut';
        const side = kind === 'feint' ? -sideOpen : sideOpen;
        A.move = { kind, t: 0, fake: kind === 'feint' ? (Math.random() < 0.5 ? 1 : -1) : 0, side: side * (Math.random() < 0.7 ? 1 : -1) };
        if (kind === 'feint') A.move.fake = Math.sign(u.pos.z - o.pos.z) || 1; // fake toward the defender's side first
        A.mode = 'move';
      }
    }
    // read a committed tackle and skip past it
    if ((u.state === 'slide' || u.state === 'poke') && !A.dodged && u.st.t < 0.12 && dd < 3.4 && defAhead && dist2(o.footPoint(), ball.pos) < 1.3) {
      A.dodged = true;
      const p = u.state === 'slide' ? A.skill : A.skill * (D.exposed > 0.3 ? 0.25 : 0.45);
      if (Math.random() < p) {
        const side = Math.sign(o.pos.z - u.pos.z) || (Math.random() < 0.5 ? -1 : 1);
        ball.vel.set(-4.5, 0.6, side * 4.2); A.mode = 'move'; A.move = { kind: 'knock', t: 0, side, fake: 0 }; D.exposed = 0;
      }
    }
    if (u.state === 'free') A.dodged = false;
    // the defender's body physically blocks the path
    if (dd < 0.75 && defAhead) { sp *= 0.5; }
    o.steer(want.clone().multiplyScalar(sp), dt, sprint ? 11 : 9); o.integrate(dt); o.faceLock = false;
    // touches; shield the ball from the defender
    const touched = dribble(o, dt, want, sprint);
    // a balanced, goal-side jockey forces heavier touches
    if (touched && D.userJockey && defAhead && dd < 1.9) { const extra = rand(0.6, 1.3); ball.vel.addScaledVector(new V3(want.x, 0, want.z), extra); ball.vel.z += gauss() * 0.8; }
    if (touched && dd < 2.2) { const away = o.left(); const sgn = Math.sign(away.dot(rel)) || 1; ball.vel.addScaledVector(away, -sgn * 0.5); }
    if (o.hasBall()) D.exposed = Math.max(0, dist2(ball.pos, o.pos) - 0.55);
    else D.exposed = 1;
  },
  tackle(kind) {
    const u = user;
    if (lastInp && lastInp.aimPt) { const v = new V3(lastInp.aimPt.x - u.pos.x, 0, lastInp.aimPt.z - u.pos.z); if (v.lengthSq() > 0.1) u.heading = Math.atan2(-v.z, v.x); } u.state = kind === 'stand' ? 'poke' : 'slide'; u.st = { t: 0, dir: u.dir(), hit: false };
    if (kind === 'slide') u.pl.act(() => P.slide(clamp(u.st.t / 0.18, 0, 1)), { rate: 25 });
    else u.pl.act(() => P.poke(clamp(u.st.t / 0.36, 0, 1)), { rate: 25 });
    u.faceLock = true;
  },
  updateTackle(dt) {
    const u = user, o = opp, st = u.st; st.t += dt;
    if (u.state === 'slide') {
      const sp = Math.max(0, 8 * (1 - st.t / 0.6)); u.vel.copy(st.dir).multiplyScalar(sp); u.integrate(dt);
      u.pl.root.rotation.z = damp(u.pl.root.rotation.z, st.t < 0.75 ? 0.95 : 0, 14, dt); u.pl.root.position.y = 0.02;
      if (!st.hit && st.t > 0.05 && st.t < 0.55 && D.state === 'play') {
        const foot = u.pos.clone().addScaledVector(st.dir, 1.0);
        const hitBall = dist2(foot, ball.pos) < 0.45 && ball.pos.y < 0.5; const hitMan = dist2(foot, o.pos) < 0.6 || dist2(u.pos, o.pos) < 0.55;
        const together = hitBall && D.exposed < 0.4 && dist2(foot, o.pos) < 1.0;
        if (together && Math.random() < 0.7) { st.hit = true; sfx.thud(); this.result('foul'); }
        else if (hitBall && (!hitMan || D.exposed > 0.3)) { st.hit = true; ball.vel.copy(st.dir).multiplyScalar(7).add(new V3(rand(-1, 1), 1.2, rand(-2, 2))); sfx.thud(); this.result('won-slide'); }
        else if (hitMan) {
          st.hit = true; sfx.thud();
          const fromBehind = st.dir.dot(new V3(o.vel.x, 0, o.vel.z).normalize()) > 0.4;
          this.result(fromBehind ? 'foul-card' : 'foul');
        }
      }
      if (st.t > 1.15) { u.state = 'free'; u.faceLock = false; u.pl.release(8); u.pl.root.rotation.z = 0; u.pl.root.position.y = 0; }
    } else if (u.state === 'poke') {
      u.vel.multiplyScalar(Math.exp(-6 * dt)); u.integrate(dt);
      if (!st.hit && st.t > 0.1 && st.t < 0.26 && D.state === 'play') {
        const foot = u.pos.clone().addScaledVector(st.dir, 0.8);
        const db = dist2(foot, ball.pos), dm = dist2(foot, o.pos);
        if (db < 0.5 && (D.exposed > 0.25 || dm > 0.55)) { st.hit = true; ball.vel.copy(st.dir).multiplyScalar(4.5).add(new V3(0, 0.3, rand(-1, 1))); sfx.thud(); this.result('won-stand'); }
        else if (dm < 0.42) { st.hit = true; const fromBehind = st.dir.dot(new V3(o.vel.x, 0, o.vel.z).normalize()) > 0.5; sfx.thud(); if (fromBehind) this.result('foul'); else { st.stumble = true; } }
      }
      if (st.t > (st.stumble ? 0.85 : 0.5)) { u.state = 'free'; u.faceLock = false; u.pl.release(10); }
    }
  },
  attackerShoots() {
    const o = opp; if (D.state !== 'play') return;
    const aim = new V3(-HL - ball.pos.x, 0, rand(-2, 2) - ball.pos.z).normalize(); o.turnTo(aim.x, aim.z, 1, 99);
    startStrike(o, 'driven', 0.75, aim, { ai: true, aiSigma: 2 });
    this.result('beaten');
  },
  result(kind) {
    if (D.state !== 'play') return; D.state = 'over';
    const total = Math.max(0.1, D.repT);
    const gs = D.goalSideT / total, jk = D.jockeyT / total;
    const rows = [['Goal-side', Math.round(gs * 100) + '% of the time', gs > 0.6 ? 'good' : gs > 0.35 ? 'ok' : 'bad'], ['Jockeying', Math.round(jk * 100) + '% of the time', jk > 0.35 ? 'good' : jk > 0.15 ? 'ok' : 'bad'], ['Too tight', D.closeT > 1.2 ? 'Often' : 'Rarely', D.closeT > 1.2 ? 'bad' : 'good']];
    let tip = '';
    if (kind === 'beaten' && jk < 0.2) tip = 'Hold jockey when he runs at you. You react to feints much faster.';
    else if (kind === 'beaten') tip = 'Stay a step further off and wait for a loose touch.';
    else if (kind.startsWith('foul')) tip = 'Tackle the ball when it leaves his feet, and never slide from behind.';
    else if (kind === 'contained') tip = 'Good containment. Pounce on the ball when he takes a heavy touch.';
    const fb = { title: 'Defending technique', rows, tip };
    if (kind === 'won-stand' || kind === 'won-slide') {
      const pts = kind === 'won-stand' ? 100 : 90; D.stats.won++; sfx.cheer(); cheerT = 1.6;
      repDone(pts, 'Ball won', kind === 'won-stand' ? `Clean standing tackle +${pts}` : `Clean slide +${pts}`, 'var(--flood)', fb);
    } else if (kind === 'contained') {
      D.stats.contained++; repDone(65, 'Contained', 'He had to turn back +65', 'var(--chalk)', fb);
    } else if (kind === 'foul' || kind === 'foul-card') {
      D.stats.fouls++; sfx.foul(); opp.pl.act(() => P.fall(1), { rate: 10 });
      if (kind === 'foul-card') { D.stats.cards++; repDone(-30, 'Yellow card', 'Slide from behind. -30', '#ffd34d', fb); if (!D.practice && D.stats.cards >= 2) { nextRep(() => { hideFeedback(); showMsg('Red card', 'Second yellow. Session over.', 'var(--alert)', 2); endDrill(); }, 2.2); } }
      else repDone(-10, 'Foul', 'You caught the man. -10', 'var(--alert)', fb);
    } else { D.stats.beaten++; sfx.groan(); repDone(0, 'Beaten', 'He got past you', 'var(--chalk)', fb); }
  },
  summary() { const s = D.stats; return [['Balls won', `${s.won} of ${D.reps}`], ['Contained', s.contained], ['Fouls', s.fouls], ['Yellow cards', s.cards], ['Beaten', s.beaten]]; }
};

/* ---------- drill: passing ---------- */
const passing = {
  start() {
    D.time = 60; D.stats = { made: 0, completed: 0, wrong: 0, intercepted: 0, loose: 0 }; D.reps = Infinity;
    user.show().place(0, 0, 0); presser.show().place(4, 0, Math.PI); mates.forEach((m) => m.show());
    const spots = [[9, -6], [-7, -7], [6, 7]]; mates.forEach((m, i) => { m.place(spots[i][0], spots[i][1]); m.way = this.waypoint(); m.pl.setSpeed(0); });
    userRing.visible = true; D.state = 'possess'; D.hold = null; D.target = mates[0]; this.pickTarget(); D.pressSp = 2.6; D.laneT = 0; D.lanePt = new V3(3, 0, 0);
    resetBall(0.45, 0); D.lastRecv = 0; D.rep = 0;
    drillCam(new V3(0, 0, 0), user, 0, 13.5, 10.5, 0, 0, -0.5); camSnap(); setHud('1:00 left');
  },
  progress() { const s = Math.max(0, Math.ceil(D.time)); return D.practice ? 'Free practice' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`; },
  setupRep() { D.state = 'possess'; },
  waypoint() { for (let i = 0; i < 20; i++) { const a = rand(0, Math.PI * 2), r = rand(6, 13); const p = new V3(user.pos.x + Math.cos(a) * r, 0, user.pos.z + Math.sin(a) * r); if (Math.abs(p.x) < HL - 2 && Math.abs(p.z) < HW - 1.5) return p; } return new V3(rand(-12, 12), 0, rand(-8, 8)); },
  pickTarget() { const o = mates.filter((m) => m !== D.target); D.target = o[(Math.random() * o.length) | 0]; },
  update(dt, inp) {
    if (D.phase === 'play' && !D.practice) { D.time -= dt; setHud(this.progress()); if (D.time <= 0) { endDrill(); return; } }
    if (msgTimer <= 0 && !$('#feedback').hidden && D.fbT && NOW - D.fbT > 2.4) hideFeedback();
    const u = user; const mv = mapMove(inp);
    const recv = D.state === 'flight' ? (D.passTo || null) : null;
    mates.forEach((m) => {
      const to = new V3().subVectors(m.way, m.pos); to.y = 0; if (to.length() < 0.6) m.way = this.waypoint();
      if (m === recv && hlen(ball.vel) > 1) {
        // the receiver comes to meet the ball on its line
        const v = new V3(ball.vel.x, 0, ball.vel.z).normalize(); const rel = new V3(m.pos.x - ball.pos.x, 0, m.pos.z - ball.pos.z);
        const meet = ball.pos.clone().addScaledVector(v, Math.max(0, rel.dot(v))); meet.y = 0;
        aiRun(m, dt, meet, 4.8, 14);
      } else aiRun(m, dt, m.way, 3.2, 6);
      m.integrate(dt);
      m.faceLock = D.state !== 'flight' || m !== D.target; if (m.faceLock) m.turnTo(ball.pos.x - m.pos.x, ball.pos.z - m.pos.z, dt, 6);
      if (m.state === 'strike') updateStrike(m, dt);
      m.finish(dt);
    });
    // presser cuts the lane with a reaction delay
    D.laneT -= dt; if (D.laneT <= 0) { D.laneT = 0.7; D.lanePt = new V3().lerpVectors(u.pos, D.target.pos, 0.38); }
    const goal = D.state === 'flight' && dist2(presser.pos, ball.pos) < 3.5 ? ball.pos : D.state === 'possess' && dist2(presser.pos, u.pos) < 6 && Math.random() < 0 ? u.pos : D.lanePt;
    aiRun(presser, dt, goal, D.pressSp, 8); presser.integrate(dt); presser.finish(dt);
    // player
    if (u.state === 'free') {
      const maxSp = D.hold ? 2 : inp.sprint ? 6.6 : 5;
      u.steer(mv.clone().multiplyScalar(maxSp * inp.mag), dt, 42); u.integrate(dt);
      u.pos.x = clamp(u.pos.x, -HL + 1.5, HL - 1.5); u.pos.z = clamp(u.pos.z, -HW + 1, HW - 1);
      if (D.state === 'possess') {
        if (!D.hold) dribble(u, dt, mv, false);
        if (isBeginner()) {
          if (inp.a.pressed && D.phase === 'play' && dist2(u.footPoint(), ball.pos) < 1.2) {
            const ai = this.aim(mv, inp.mag, 'pass'); const L = dist2(u.pos, ai.point);
            const pressure = clamp(1 - dist2(presser.pos, u.pos) / 2.5, 0, 1);
            D.passTo = ai.to || D.target; D.passStyle = 'pass';
            startStrike(u, 'pass', 0.6, ai.dir, { rating: rating('passing'), target: ai.point, pressure, assist: true, speedOverride: clamp(6 + L * 0.85, 7, 16), onContact: (r) => { D.state = r.whiff ? 'possess' : 'flight'; D.flightT = NOW; D.lastPass = r; } });
          }
        } else for (const [k, style] of [['a', 'pass'], ['b', 'through'], ['c', 'lofted']]) if (inp[k].pressed && !D.hold && D.phase === 'play' && u.hasBall()) D.hold = { k, style, t: 0 };
        if (D.hold) {
          D.hold.t += dt; const pw = Math.min(1.15, D.hold.t / 0.9);
          setPower(pw, { pass: 'Ground pass', through: 'Through ball', lofted: 'Lofted pass' }[D.hold.style], 'Release to pass');
          const aimInfo = this.aim(mv, inp.mag, D.hold.style);
          targetRing.visible = true; targetRing.position.set(aimInfo.to ? aimInfo.to.pos.x : D.target.pos.x, 0.025, aimInfo.to ? aimInfo.to.pos.z : D.target.pos.z);
          if (!inp[D.hold.k].down) {
            const pressure = clamp(1 - dist2(presser.pos, u.pos) / 2.5, 0, 1);
            D.passTo = aimInfo.to; D.passStyle = D.hold.style;
            startStrike(u, D.hold.style, Math.min(1.1, pw), aimInfo.dir, { rating: rating('passing'), target: aimInfo.point, pressure, speedOverride: D.hold.style === 'lofted' ? undefined : 5 + 16 * Math.min(1.1, pw), onContact: (r) => { D.state = r.whiff ? 'possess' : 'flight'; D.flightT = NOW; D.lastPass = r; } });
            D.hold = null; setPower(null);
          }
        } else targetRing.visible = true, targetRing.position.set(D.target.pos.x, 0.025, D.target.pos.z);
      }
    } else if (u.state === 'strike') { updateStrike(u, dt); u.integrate(dt); }
    targetRing.scale.setScalar(1 + Math.sin(NOW * 6) * 0.06);
    ballStep(dt);
    if (D.state === 'flight') this.checkFlight();
    else if (D.state === 'return') { if (dist2(ball.pos, u.pos) < 1.6 || NOW - D.retT > 2.6) { if (dist2(ball.pos, u.pos) < 1.6) { const fp = u.footPoint(); ball.vel.set(u.vel.x + (fp.x - ball.pos.x) * 5, 0, u.vel.z + (fp.z - ball.pos.z) * 5); sfx.touch(); } D.state = 'possess'; ball.vel.multiplyScalar(0.2); if (NOW - D.retT > 2.6) resetBall(u.pos.x + 0.45 * Math.cos(u.heading), u.pos.z - 0.45 * Math.sin(u.heading)); this.pickTarget(); } }
    else if (D.state === 'reset') { if (NOW - D.retT > 1.1) { D.state = 'possess'; resetBall(u.pos.x + 0.45 * Math.cos(u.heading), u.pos.z - 0.45 * Math.sin(u.heading)); presser.pos.set(u.pos.x + 4.5, 0, u.pos.z + rand(-2, 2)); } }
    ball.events.length = 0;
    u.finish(dt);
    const cx = u.pos.x * 0.7, cz = u.pos.z * 0.7; drillCam(u.pos, u, cx, 13.5, cz + 10.5, cx, 0, cz - 0.5, 2.5);
  },
  aim(mv, mag, style) {
    const u = user; let to = null, dir;
    const cur = lastInp && lastInp.aimPt;
    if (cur) {
      let best = 4.5; mates.forEach((m) => { const d = dist2(m.pos, cur); if (d < best) { best = d; to = m; } });
      if (!to) { dir = new V3(cur.x - u.pos.x, 0, cur.z - u.pos.z).normalize(); return { to: null, dir, point: cur.clone() }; }
    } else if (mag > 0.3) {
      dir = mv.clone().normalize(); let best = Math.cos(15 * DEG);
      mates.forEach((m) => { const v = new V3(m.pos.x - u.pos.x, 0, m.pos.z - u.pos.z).normalize(); const d = v.dot(dir); if (d > best) { best = d; to = m; } });
    } else to = D.target;
    let point;
    if (to) {
      // aim where the runner will be when the ball arrives
      const avg = style === 'lofted' ? 10 : 9.5; let T = dist2(u.pos, to.pos) / avg;
      for (let i = 0; i < 3; i++) { const pp = to.pos.clone().addScaledVector(to.vel, T); T = dist2(u.pos, pp) / avg; }
      point = to.pos.clone().addScaledVector(to.vel, T * (style === 'through' ? 1.3 : 1));
      if (style === 'through') { const runDir = to.vel.lengthSq() > 0.5 ? to.vel.clone().normalize() : new V3(1, 0, 0); point.addScaledVector(runDir, 2.2); to.way = point.clone().addScaledVector(runDir, 1); }
      dir = new V3(point.x - u.pos.x, 0, point.z - u.pos.z).normalize();
    } else point = u.pos.clone().addScaledVector(dir, 10);
    return { to, dir, point };
  },
  checkFlight() {
    if (dist2(ball.pos, presser.pos) < 0.75 && ball.pos.y < 1.1) { D.stats.intercepted++; showMsg('Intercepted', 'Chip it, play it earlier, or pick a clearer lane', 'var(--alert)', 1.2); this.passFb('Intercepted'); sfx.groan(); this.reset(); return; }
    for (const m of mates) {
      if (dist2(ball.pos, m.pos) < 1.1 && ball.pos.y < 1.7) {
        const hs = hlen(ball.vel);
        if (hs > 17) { D.stats.loose++; showMsg('Too heavy', 'Less weight over short distances', 'var(--chalk)', 1.1); this.passFb('Too heavy'); ball.vel.multiplyScalar(0.4); this.reset(); return; }
        const quick = NOW - D.lastRecv < 3.2; let pts;
        if (m === D.target) { pts = 40 + (quick ? 15 : 0) + (D.passStyle === 'through' ? 10 : 0); D.stats.completed++; showMsg('Found him', `+${pts}${quick ? ' quick tempo' : ''}`, 'var(--flood)', 0.9); D.pressSp = Math.min(4.4, D.pressSp + 0.1); }
        else { pts = 20; D.stats.wrong++; showMsg('Kept it', 'Not the marked player +20', 'var(--chalk)', 0.9); }
        if (!D.practice) D.score += pts; D.stats.made++; D.rep++;
        this.passFb(m === D.target ? 'Completed' : 'Wrong man');
        D.lastRecv = NOW; sfx.touch();
        m.turnTo(user.pos.x - m.pos.x, user.pos.z - m.pos.z, 1, 99);
        ball.pos.set(m.pos.x + 0.4 * Math.cos(m.heading), BR, m.pos.z - 0.4 * Math.sin(m.heading));
        const back = new V3(user.pos.x - ball.pos.x, 0, user.pos.z - ball.pos.z); const L = back.length(); back.normalize();
        ball.vel.set(back.x * Math.min(13, 5 + L * 0.8), 0.2, back.z * Math.min(13, 5 + L * 0.8));
        D.state = 'return'; D.retT = NOW; setHud(this.progress()); return;
      }
    }
    if ((hlen(ball.vel) < 0.8 && ball.pos.y < 0.2) || Math.abs(ball.pos.x) > HL || Math.abs(ball.pos.z) > HW) { D.stats.loose++; showMsg('Loose pass', 'Too little on it, or no one there', 'var(--chalk)', 1); this.passFb('Loose'); this.reset(); }
  },
  passFb(result) {
    const r = D.lastPass; if (!r) return;
    const rows = [['Pass', { pass: 'Ground pass', through: 'Through ball', lofted: 'Lofted' }[r.style]], ['Result', result, result === 'Completed' ? 'good' : result === 'Wrong man' ? 'ok' : 'bad'], ['Weight', Math.round(r.power * 100) + '%'], ['Body shape', r.bodyAngle < 45 ? 'Facing the pass' : 'Passing across your body', r.bodyAngle < 45 ? 'good' : 'bad']];
    const tip = result === 'Intercepted' ? 'Pass before the presser gets into the lane, or loft it over him.' : result === 'Too heavy' ? 'Short passes need less weight.' : result === 'Loose' ? 'Hold a little longer for more weight.' : r.bodyAngle >= 45 ? 'Turn to face your target before passing.' : '';
    showFeedback('Passing technique', rows, tip); D.fbT = NOW;
  },
  reset() { D.state = 'reset'; D.retT = NOW; },
  summary() { const s = D.stats; return [['Passes to the marked player', s.completed], ['Passes to another teammate', s.wrong], ['Intercepted', s.intercepted], ['Loose or overhit', s.loose]]; }
};
/* ---------- call bubbles, space marker, status chip ---------- */
const bubbleTexCache = {};
function bubbleTex(text, color) {
  const key = text + color; if (bubbleTexCache[key]) return bubbleTexCache[key];
  const c = document.createElement('canvas'); c.width = 320; c.height = 120; const x = c.getContext('2d');
  x.font = '800 54px "Arial Narrow", Arial, sans-serif'; const w = Math.min(300, x.measureText(text).width + 44);
  const l = (320 - w) / 2; x.fillStyle = color; x.beginPath(); x.moveTo(l + 18, 8); x.arcTo(l + w, 8, l + w, 88, 18); x.arcTo(l + w, 88, l, 88, 18); x.lineTo(172, 88); x.lineTo(160, 114); x.lineTo(148, 88); x.arcTo(l, 88, l, 8, 18); x.arcTo(l, 8, l + w, 8, 18); x.closePath(); x.fill();
  x.fillStyle = '#0b1a1f'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 160, 50);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; bubbleTexCache[key] = t; return t;
}
const bubbles = [];
function bubble(actor, text, color = '#ffb547', dur = 1.3) {
  for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].a === actor) { scene.remove(bubbles[i].s); bubbles.splice(i, 1); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex(text, color), depthTest: false, transparent: true }));
  s.scale.set(1.9, 0.71, 1); s.renderOrder = 8; scene.add(s); bubbles.push({ s, a: actor, until: NOW + dur });
}
function updateBubbles() {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.s.position.set(b.a.pos.x, 2.55, b.a.pos.z); const w = clamp(camera.position.distanceTo(b.s.position) * 0.085, 0.7, 1.9); b.s.scale.set(w, w * 0.374, 1); b.s.material.opacity = clamp((b.until - NOW) / 0.25, 0, 1);
    if (NOW > b.until || !b.a.visible) { scene.remove(b.s); bubbles.splice(i, 1); }
  }
}
function clearBubbles() { for (const b of bubbles) scene.remove(b.s); bubbles.length = 0; }
const spaceMark = new THREE.Group();
{
  const ringM = new THREE.MeshBasicMaterial({ color: 0x3fd0c9, transparent: true, opacity: 0.9, depthWrite: false });
  const r = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.92, 40), ringM); r.rotation.x = -Math.PI / 2; spaceMark.add(r);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshBasicMaterial({ color: 0x3fd0c9, transparent: true, opacity: 0.16, depthWrite: false })); disc.rotation.x = -Math.PI / 2; spaceMark.add(disc);
  spaceMark.position.y = 0.03; spaceMark.visible = false; scene.add(spaceMark);
}
const runLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3(1, 0, 0)]), new THREE.LineDashedMaterial({ color: 0x3fd0c9, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.85 }));
runLine.visible = false; scene.add(runLine);
const chip = document.createElement('div'); chip.id = 'statusChip'; chip.hidden = true;
chip.style.cssText = 'position:absolute;left:50%;bottom:62px;transform:translateX(-50%);padding:7px 14px;border-radius:999px;background:rgba(6,15,18,.82);font:700 14px/1.2 Barlow,system-ui,sans-serif;letter-spacing:.02em;pointer-events:none;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(255,255,255,.12)';
$('#hud').appendChild(chip);
function setChip(text, color) { if (!text) { chip.hidden = true; return; } chip.hidden = false; if (chip.textContent !== text) chip.textContent = text; chip.style.color = color; }

/* ---------- drill: match play (3 v 2 plus keeper) ---------- */
const DEF_SPEED = 6.1;
const match = {
  start() {
    D.reps = 8; D.stats = { made: 0, goals: 0, shots: 0, calls: 0, received: 0, offside: 0, lost: 0, openT: 0, waitT: 0, oneTwos: 0 };
    this.mates = [mates[0], mates[1]]; this.defs = [opp, presser];
    for (const a of [user, keeper, ...this.mates, ...this.defs]) a.show();
    for (const m of this.mates) m.sticky = true;
    userRing.visible = true; keeperInit(keeper, 1);
    this.setupRep(); camSnap();
  },
  progress() { return D.practice ? `Attack ${D.rep}` : `Attack ${Math.min(D.rep, D.reps)} of ${D.reps}`; },
  setupRep() {
    D.rep++; D.state = 'play'; D.repT = 0; D.shot = null; D.hold = null; D.call = null; D.flight = null; D.lastR = null; D.offsideFlag = false; D.oneTwo = null; D.callOpen = null; D.recvT = -9; D.tackleTry = 0; D.bestT = 0; D.best = null; D.markT = 0; D.roles = null; D.repOpenT = 0; D.repWaitT = 0; D.repCalls = 0;
    hideFeedback(); shotMark.visible = false; spaceMark.visible = false; runLine.visible = false; clearBubbles();
    const z0 = rand(-3.5, 3.5); const [m1, m2] = this.mates; const [d1, d2] = this.defs;
    m1.place(-7, z0, 0); m2.place(-2, (z0 > 0 ? -1 : 1) * rand(6.5, 8.5), 0);
    user.place(rand(1, 4), clamp(z0 * 0.5 + rand(-2, 2), -4, 4), 0);
    d1.place(user.pos.x + 2.2, user.pos.z + rand(-0.6, 0.6), Math.PI); d2.place(5.5, (m1.pos.z + m2.pos.z) * 0.35, Math.PI);
    for (const d of this.defs) { d.tk = null; d.closeT = 0; }
    keeper.place(HL - 0.6, 0, Math.PI); keeperInit(keeper, 1);
    resetBall(m1.pos.x + 0.42, m1.pos.z); D.poss = m1; D.carrierT = 0;
    setHud(this.progress());
    showMsg('Attack ' + D.rep, D.rep === 1 ? 'Get into the space, then call for the ball' : '', 'var(--chalk)', 1.3);
  },
  // the second-last opponent: the keeper is last, so the deeper of the two defenders sets the line
  offsideLine() { return Math.max(...this.defs.map((d) => d.pos.x), ball.pos.x); },
  isOffside(a) { return a.pos.x > 0 && a.pos.x > this.offsideLine() + 0.1; },
  // can a pass from the carrier reach this point before a defender cuts it out?
  laneClear(from, point, speed) {
    const len = dist2(from, point); if (len < 0.5) return { ok: true };
    const seg = new THREE.Line3(new V3(from.x, 0, from.z), new V3(point.x, 0, point.z)); const c = new V3();
    for (const d of this.defs) {
      seg.closestPointToPoint(new V3(d.pos.x, 0, d.pos.z), true, c);
      const s = dist2(from, c); const tBall = s / (speed * 0.88); const tDef = Math.max(0, dist2(d.pos, c) - 0.75) / DEF_SPEED + 0.22;
      if (tDef < tBall && s > 0.8) return { ok: false, d };
    }
    return { ok: true };
  },
  planPass(from, to, kind) {
    const L0 = dist2(from.pos, to.pos); let point;
    if (kind === 'space') {
      const run = to.vel.lengthSq() > 4 ? new V3(to.vel.x, 0, to.vel.z).normalize() : new V3(1, 0, -to.pos.z * 0.05).normalize();
      const T = L0 / 11; point = to.pos.clone().addScaledVector(to.vel, T).addScaledVector(run, 2.6);
    } else { const T = L0 / 10; point = to.pos.clone().addScaledVector(to.vel, T * 0.5); }
    point.x = clamp(point.x, -HL + 2, HL - 2.2); point.z = clamp(point.z, -HW + 1.2, HW - 1.2); point.y = 0;
    const len = dist2(from.pos, point);
    const speed = kind === 'space' ? clamp(len * 0.62 + 5, 7.5, 14) : clamp(len * 0.7 + 4.5, 7, 14);
    const lane = this.laneClear(from.pos, point, speed);
    return { ok: lane.ok, point, speed, kind };
  },
  makePass(from, to, plan, opts = {}) {
    const aim = new V3(plan.point.x - ball.pos.x, 0, plan.point.z - ball.pos.z).normalize();
    if (from.ai) from.turnTo(aim.x, aim.z, 1, 99);
    D.poss = null; D.carrierT = 0;
    startStrike(from, 'pass', 0.6, aim, { ai: from.ai, aiSigma: 1.6, rating: from.ai ? from.rating : rating('passing'), assist: !from.ai && isBeginner(), target: plan.point, speedOverride: plan.speed, onContact: (r) => {
      if (r.whiff) { D.flight = null; return; }
      D.flight = { to, from, t: NOW, kind: plan.kind };
      if (to === user) D.offsideFlag = this.isOffside(user);
      if (!from.ai) { D.oneTwo = { mate: to, t: NOW }; D.lastPass = r; }
      if (opts.runTo) to.runTo = opts.runTo;
    } });
  },
  bestSpace() {
    // candidate spots in front of the ball; score openness, a clear lane, threat on goal and staying onside
    const car = D.poss || ball; const cp = car.pos || ball.pos; const line = this.offsideLine();
    let best = null, bs = -1e9;
    for (let x = Math.max(cp.x - 3, -8); x <= HL - 4; x += 1.5) for (let z = -HW + 2.5; z <= HW - 2.5; z += 1.5) {
      if (x > line - 0.4) continue;
      const p = new V3(x, 0, z); const dc = dist2(p, cp); if (dc < 5) continue;
      let open = 9; for (const d of this.defs) open = Math.min(open, dist2(d.pos, p));
      for (const m of this.mates) if (m !== car) open = Math.min(open, dist2(m.pos, p) + 1.5);
      const lane = this.laneClear(cp, p, clamp(dc * 0.85 + 5, 8, 17)).ok;
      const goal = Math.hypot(HL - 6 - x, z * 0.8);
      const sc = Math.min(open, 5) * 1.3 + (lane ? 3 : -3) - goal * 0.35 - dist2(p, user.pos) * 0.22 - Math.max(0, dc - 16) * 0.5;
      if (sc > bs) { bs = sc; best = p; }
    }
    return best;
  },
  userOpen() {
    if (!D.poss || D.poss === user) return null;
    let near = 9; for (const d of this.defs) near = Math.min(near, dist2(d.pos, user.pos));
    const off = this.isOffside(user); const lane = this.planPass(D.poss, user, 'feet').ok;
    return { off, near, lane, open: !off && lane && near > 2.0 };
  },
  call(kind) {
    D.stats.calls++; D.repCalls++;
    const st = this.userOpen(); D.callOpen = st ? st.open : null;
    D.call = { kind, t: NOW, respondAt: NOW + rand(0.18, 0.32), tries: 0 };
    bubble(user, kind === 'space' ? 'IN BEHIND!' : 'PASS!', '#ffb547', 1.1);
  },
  update(dt, inp) {
    D.repT += dt;
    const u = user; const mv = mapMove(inp); const beg = isBeginner(); const playing = D.state === 'play';
    // ---------- the user ----------
    if (u.state === 'free') {
      const onBall = D.poss === u;
      const maxSp = (inp.sprint ? 7.5 : 5.4) * (onBall ? 0.93 : 1) * (D.hold ? 0.6 : 1);
      if (D.flight && D.flight.to === u && hlen(ball.vel) > 1 && inp.mag < 0.3) {
        // receive assist: with no input, step onto the line of the pass to meet it
        const v = new V3(ball.vel.x, 0, ball.vel.z).normalize(); const rel = new V3(u.pos.x - ball.pos.x, 0, u.pos.z - ball.pos.z);
        const meet = ball.pos.clone().addScaledVector(v, Math.max(0, rel.dot(v))); meet.y = 0; aiRun(u, dt, meet, 6.2, 30);
      } else u.steer(mv.clone().multiplyScalar(maxSp * inp.mag), dt, inp.sprint ? 34 : 45);
      u.integrate(dt);
      if (playing) {
        if (!onBall && !D.flight && !D.shot && !ball.held && ball.pos.y < 0.6 && dist2(u.footPoint(), ball.pos) < 0.7 && !(D.poss && D.poss !== u)) { D.poss = u; }
        if (D.poss === u) {
          dribble(u, dt, mv, inp.sprint && inp.mag > 0.5 && !D.hold);
          if (dist2(u.pos, ball.pos) > 1.6) D.poss = null;
          this.userOnBall(dt, inp, mv, beg);
        } else {
          // off the ball: demand it
          const callBtn = beg ? (inp.a.pressed || inp.b.pressed) : inp.b.pressed;
          if (callBtn) this.call(beg && hlen(u.vel) > 3.5 && u.vel.x > 2 ? 'space' : 'feet');
          else if (inp.c.pressed) this.call('space');
        }
      }
    } else if (u.state === 'strike') { updateStrike(u, dt); u.integrate(dt); }
    if (D.poss !== u && !(u.state === 'strike')) setPower(null);
    // ---------- teammates ----------
    for (const m of this.mates) this.mateAI(m, dt);
    // ---------- defenders ----------
    this.defenderAI(dt);
    // ---------- ball, keeper ----------
    ballStep(dt);
    if (ball.held === keeper) keeperHoldBall(keeper);
    const oneOnOne = D.poss === u && u.pos.x > HL - 13 && this.defs.every((d) => d.pos.x < u.pos.x - 0.5 || dist2(d.pos, u.pos) > 3);
    const kres = keeperAI(keeper, dt, { shooter: u, oneOnOne, loose: !D.poss && !D.shot && hlen(ball.vel) < 4 && ball.pos.x > HL - 6, shooterHasBall: !!D.poss });
    keeper.integrate(dt); keeper.finish(dt);
    if (playing && kres === 'claimed') this.result(D.flight ? 'claimed' : 'claimed');
    if (D.state === 'play') this.flightCheck();
    if (D.state === 'play') this.shotCheck();
    if (D.state === 'play') this.looseCheck();
    if (D.state === 'play' && D.repT > 28) this.result('timeout');
    ball.events.length = 0;
    // ---------- indicators ----------
    this.indicators(dt, inp, mv, beg);
    u.finish(dt); for (const m of this.mates) m.finish(dt); for (const d of this.defs) d.finish(dt);
    // camera follows the ball, framed toward goal
    const f = new V3((ball.pos.x * 2 + u.pos.x) / 3, 0, (ball.pos.z * 2 + u.pos.z) / 3);
    drillCam(f, u, f.x - 10, 6.8, f.z * 0.6, f.x + 7, 0.4, f.z * 0.5, 3.5);
  },
  userOnBall(dt, inp, mv, beg) {
    const u = user;
    if (!D.hold && dist2(u.footPoint(), ball.pos) < 1.5) {
      if (inp.a.pressed) {
        if (beg) {
          const far = HL - ball.pos.x; const pw = far > 18 ? 0.8 : 0.7; const am = shotAimPoint(inp, mv, ball.pos, pw, true, u.heading);
          this.shoot('driven', pw, am, 'a', true);
        } else D.hold = { k: 'a', style: 'driven', t: 0 };
      } else if (inp.b.pressed || inp.c.pressed) {
        const through = inp.c.pressed && !inp.b.pressed;
        // choose the teammate in the direction held, or the best option
        const dir = inp.mag > 0.3 ? mv.clone().normalize() : null; let to = null, best = -9;
        for (const m of this.mates) {
          const v = new V3(m.pos.x - u.pos.x, 0, m.pos.z - u.pos.z); const L = v.length(); v.normalize();
          const sc = dir ? v.dot(dir) * 3 - L * 0.02 : (this.laneClear(u.pos, m.pos, 12).ok ? 2 : 0) + m.pos.x * 0.08;
          if (sc > best) { best = sc; to = m; }
        }
        if (to) {
          const run = new V3(1, 0, -to.pos.z * 0.04).normalize();
          const plan = through ? (() => { const p = to.pos.clone().addScaledVector(run, 4.5); p.x = Math.min(p.x, HL - 3); const len = dist2(u.pos, p); return { point: p, speed: clamp(len * 0.7 + 5.5, 8, 15), kind: 'space' }; })() : this.planPass(u, to, 'feet');
          this.makePass(u, to, plan, through ? { runTo: plan.point } : {});
        }
      }
    }
    if (D.hold) {
      D.hold.t += dt; const pw = Math.min(1.15, D.hold.t / 0.95);
      setPower(pw, 'Driven shot', pw > 1 ? 'Too much power' : 'Release to strike');
      if (!inp.a.down) { const am = shotAimPoint(inp, mv, ball.pos, pw, false, u.heading); this.shoot('driven', Math.min(1.1, pw), am, 'a', false); D.hold = null; setPower(null); }
    }
  },
  shoot(style, pw, am, k, assist) {
    const aim = new V3(HL - ball.pos.x, 0, am.tz - ball.pos.z).normalize();
    let pressure = 0; for (const d of this.defs) pressure = Math.max(pressure, clamp(1 - dist2(d.pos, user.pos) / 2.2, 0, 1));
    D.poss = null; D.aimAt = am.pt;
    startStrike(user, style, pw, aim, { rating: rating('shooting'), btn: k, assist, pressure, targetY: am.baseY, onContact: (r) => {
      D.lastR = r; if (r.whiff) { return; }
      D.shot = { t: NOW, r, touched: false }; D.stats.shots++; keeperOnShot(keeper, user);
    } });
  },
  mateAI(m, dt) {
    if (m.state === 'strike') { updateStrike(m, dt); m.integrate(dt); return; }
    if (D.state !== 'play') { m.vel.multiplyScalar(Math.exp(-3 * dt)); m.integrate(dt); m.faceLock = false; return; }
    const u = user;
    if (D.poss === m) { this.carrierAI(m, dt); return; }
    m.faceLock = false;
    // receiving: go and meet the ball on its line
    if (D.flight && D.flight.to === m && hlen(ball.vel) > 1) {
      const v = new V3(ball.vel.x, 0, ball.vel.z).normalize(); const rel = new V3(m.pos.x - ball.pos.x, 0, m.pos.z - ball.pos.z);
      const meet = m.runTo || ball.pos.clone().addScaledVector(v, Math.max(0, rel.dot(v))); meet.y = 0;
      if (m.runTo && dist2(m.pos, m.runTo) < 1) m.runTo = null;
      aiRun(m, dt, meet, m.runTo ? 7 : 5.2, 14); m.integrate(dt); return;
    }
    // loose ball nearby: go and get it
    if (!D.poss && !D.flight && !D.shot && !ball.held) {
      const nearest = [u, ...this.mates].reduce((a, b) => (dist2(a.pos, ball.pos) < dist2(b.pos, ball.pos) ? a : b));
      if (nearest === m) { aiRun(m, dt, ball.pos.clone().addScaledVector(ball.vel, 0.25), 6.5, 12); m.integrate(dt); return; }
    }
    // support: width and depth, always onside
    const car = D.poss || u; const line = this.offsideLine();
    let tx, tz;
    if (m === this.mates[1]) { tx = car.pos.x + (car === u && u.pos.x > HL - 14 ? 2 : 3.5); tz = Math.sign(m.pos.z || 1) * 7.5; if (car === u && u.pos.x > HL - 12) { tx = HL - 5.5; tz = -Math.sign(u.pos.z || 1) * 3.2; } }
    else { tx = car.pos.x - 5.5; tz = car.pos.z + (car.pos.z > 0 ? -5 : 5); }
    tx = Math.min(tx, line - 0.6); tz = clamp(tz, -HW + 1.5, HW - 1.5);
    aiRun(m, dt, new V3(tx, 0, tz), 5, 8); m.integrate(dt);
    if (m.speed() < 0.5) { m.faceLock = true; m.turnTo(ball.pos.x - m.pos.x, ball.pos.z - m.pos.z, dt, 5); }
  },
  carrierAI(m, dt) {
    D.carrierT += dt; const u = user;
    // first-time return in a one-two
    if (D.call && NOW >= D.call.respondAt) {
      const plan = this.planPass(m, u, D.call.kind);
      if (plan.ok || D.call.tries >= 3) { if (plan.ok) { this.makePass(m, u, plan); D.call = null; return; } }
      if (!plan.ok && D.call.tries === 0) bubble(m, this.isOffside(u) ? 'OFFSIDE' : 'MARKED', '#ff8a7a', 0.9);
      D.call.tries++; D.call.respondAt = NOW + 0.45;
    }
    if (D.call && NOW - D.call.t > 2.2) D.call = null;
    // keep the ball: drive forward until pressed, then shield and hold it up
    let press = null, pd = 9; for (const d of this.defs) { const dd = dist2(d.pos, m.pos); if (dd < pd) { pd = dd; press = d; } }
    let want = new V3(1, 0, -m.pos.z * 0.04).normalize(); let sp = m.pos.x < Math.min(4, this.offsideLine() - 3) ? 4.2 : 1.2;
    if (press && pd < 2.6) { const away = new V3(m.pos.x - press.pos.x, 0, m.pos.z - press.pos.z).normalize(); want = new V3(away.x * 0.4, 0, away.z + 0.0001).normalize(); sp = 2.2; }
    m.steer(want.multiplyScalar(sp), dt, 8); m.integrate(dt); m.faceLock = false;
    dribble(m, dt, want, false);
    // switch play to the other mate now and then if nobody calls
    const other = this.mates.find((x) => x !== m);
    if (!D.call && D.carrierT > 3.6 && Math.random() < dt * 0.6 && other) { const plan = this.planPass(m, other, 'feet'); if (plan.ok && dist2(other.pos, m.pos) > 6) this.makePass(m, other, plan); }
  },
  defenderAI(dt) {
    const u = user; const [d1, d2] = this.defs;
    for (const d of this.defs) if (d.tk) { d.tk.t += dt; d.vel.multiplyScalar(Math.exp(-6 * dt)); d.integrate(dt); if (d.tk.t > 0.55) { d.tk = null; d.pl.release(10); d.faceLock = false; } }
    if (D.state !== 'play') { for (const d of this.defs) if (!d.tk) { d.vel.multiplyScalar(Math.exp(-3 * dt)); d.integrate(dt); } return; }
    // reaction delay: roles and targets refresh a few times a second
    D.markT -= dt;
    if (D.markT <= 0 || !D.roles) {
      D.markT = 0.3;
      const car = D.poss; const ref = car ? car.pos : ball.pos;
      const presser_ = [d1, d2].reduce((a, b) => (dist2(a.pos, ref) < dist2(b.pos, ref) ? a : b)); const other = presser_ === d1 ? d2 : d1;
      // the marker takes the most dangerous runner, the user first
      const runners = [u, ...this.mates].filter((a) => a !== car);
      const mark = runners.reduce((a, b) => ((HL - a.pos.x) - (a === u ? 3 : 0) < (HL - b.pos.x) - (b === u ? 3 : 0) ? a : b));
      D.roles = { press: presser_, mark: other, markOn: mark, ref: ref.clone(), carrier: car };
    }
    const R = D.roles; const goal = new V3(HL, 0, 0);
    for (const d of this.defs) {
      if (d.tk) continue;
      let target, sp = DEF_SPEED;
      // a pass in flight: whoever can get there first goes for it
      if (D.flight && hlen(ball.vel) > 1) {
        let best = null;
        for (let t = 0.1; t <= 1.6; t += 0.1) { const p = ball.pos.clone().addScaledVector(ball.vel, t * (1 - 0.08 * t)); if ((dist2(d.pos, p) - 0.7) / DEF_SPEED <= t - 0.2) { best = p; break; } }
        if (best) { aiRun(d, dt, best, 6.8, 14); d.integrate(dt); d.faceLock = false; continue; }
      }
      if (!D.poss && !D.flight && !D.shot && !ball.held && dist2(d.pos, ball.pos) < 7) { target = ball.pos.clone(); sp = 6.6; }
      else if (d === R.press && R.carrier) {
        const c = R.carrier; const toG = new V3(goal.x - c.pos.x, 0, goal.z - c.pos.z).normalize();
        const gap = c === u ? 1.25 : 1.9; target = c.pos.clone().addScaledVector(toG, gap); sp = c === u ? 6.3 : 5;
      } else {
        const a = R.markOn || u; const toG = new V3(goal.x - a.pos.x, 0, goal.z - a.pos.z).normalize();
        target = a.pos.clone().addScaledVector(toG, 1.4); const tb = new V3(ball.pos.x - a.pos.x, 0, ball.pos.z - a.pos.z).normalize(); target.addScaledVector(tb, 0.6);
        // hold a line: do not get dragged too deep while the ball is far away
        target.x = Math.max(target.x, Math.min(ball.pos.x + 2, HL - 4));
      }
      target.x = Math.min(target.x, HL - 1.5);
      aiRun(d, dt, target, sp, 10); d.integrate(dt);
      d.faceLock = true; d.turnTo(ball.pos.x - d.pos.x, ball.pos.z - d.pos.z, dt, 8);
    }
    // tackles on the user: sprinting at a defender gives him the ball
    if (D.poss === u && u.state === 'free') {
      for (const d of this.defs) {
        if (d.tk || NOW - D.tackleTry < 0.55) continue;
        const db = dist2(d.footPoint(), ball.pos);
        d.closeT = db < 1.3 ? (d.closeT || 0) + dt : 0;
        if (db < 1.05 && d.closeT > 0.35 && NOW - D.recvT > 0.45) {
          D.tackleTry = NOW;
          const sprinting = lastInp && lastInp.sprint && u.speed() > 5.8;
          const exposed = dist2(u.footPoint(), ball.pos) > 0.6;
          // shielding: slow, with your body between the defender and the ball
          const shield = u.speed() < 2.5 && dist2(d.pos, u.pos) < dist2(d.pos, ball.pos);
          let p = 0.12 + (sprinting ? 0.38 : 0) + (exposed ? 0.2 : 0); if (shield) p *= 0.45; if (isBeginner()) p *= 0.5;
          d.tk = { t: 0 }; d.faceLock = true; d.turnTo(ball.pos.x - d.pos.x, ball.pos.z - d.pos.z, 1, 99); d.pl.act(() => P.poke(clamp(d.tk ? d.tk.t / 0.36 : 1, 0, 1)), { rate: 25 });
          if (Math.random() < p) { const away = new V3(ball.pos.x - d.pos.x, 0, ball.pos.z - d.pos.z).normalize(); ball.vel.set(-Math.abs(away.x) * 4 - 1, 0.4, away.z * 4); sfx.thud(); D.poss = null; D.lostBy = sprinting ? 'sprint' : 'tackle'; this.result('lost'); }
          break;
        }
      }
    }
  },
  flightCheck() {
    const F = D.flight; if (!F) return;
    for (const d of this.defs) if (dist2(d.footPoint(), ball.pos) < 0.7 && ball.pos.y < 1.2 && NOW - F.t > 0.08) { ball.vel.multiplyScalar(0.25); D.flight = null; this.result('intercepted'); return; }
    const to = F.to;
    if (dist2(to.footPoint(), ball.pos) < 0.85 && ball.pos.y < 1.0) {
      if (to === user) {
        if (D.offsideFlag) { this.result('offside'); return; }
        const fp = user.footPoint(); ball.vel.set(user.vel.x + (fp.x - ball.pos.x) * 5, 0, user.vel.z + (fp.z - ball.pos.z) * 5); sfx.touch();
        D.poss = user; D.flight = null; D.stats.received++; D.recvT = NOW;
        if (D.oneTwo && NOW - D.oneTwo.t < 5) { D.stats.oneTwos++; D.wasOneTwo = true; bubble(user, 'ONE-TWO', '#4fbf7a', 1); }
      } else {
        D.poss = to; D.flight = null; D.carrierT = 0; to.runTo = null;
        to.turnTo(ball.pos.x - to.pos.x, ball.pos.z - to.pos.z, 1, 99); const fp = to.footPoint(); ball.vel.set(to.vel.x + (fp.x - ball.pos.x) * 5, 0, to.vel.z + (fp.z - ball.pos.z) * 5);
        // a call already made gets an immediate first-time return
        if (D.call) D.call.respondAt = NOW + 0.12;
      }
      return;
    }
    if ((hlen(ball.vel) < 0.7 && ball.pos.y < 0.2 && NOW - F.t > 0.5) || NOW - F.t > 4) D.flight = null;
  },
  shotCheck() {
    if (!D.shot) return;
    for (const d of this.defs) if (!D.shot.touched && NOW - D.shot.t > 0.06 && dist2(d.pos, ball.pos) < 0.5 && ball.pos.y < 1.7 && !ball.net) { D.shot.touched = true; ball.vel.set(-Math.abs(ball.vel.x) * 0.3, 1.5, rand(-4, 4)); sfx.thud(); this.result('blocked'); return; }
    const c = ball.net ? null : keeperContact(keeper);
    if (c && !D.shot.touched) { D.shot.touched = true; const r = keeperSaveResponse(keeper, c); sfx.thud(); this.result(r === 'held' ? 'saved' : 'parried'); return; }
    if (ball.events.includes('post') || ball.events.includes('bar')) { sfx.post(); D.shot.woodwork = true; }
    if (ball.net === 1) this.result('goal');
    else if (ball.pos.x > HL + 0.3) this.result(D.shot.woodwork ? 'post' : ball.pos.y > GH ? 'over' : 'wide');
    else if (NOW - D.shot.t > 3 && hlen(ball.vel) < 1) this.result('short');
  },
  looseCheck() {
    if (D.poss || D.flight || D.shot || ball.held || user.state === 'strike' || this.mates.some((m) => m.state === 'strike')) return;
    if (Math.abs(ball.pos.z) > HW || ball.pos.x > HL + 0.2 || ball.pos.x < -HL) { this.result('out'); return; }
    for (const d of this.defs) if (dist2(d.footPoint(), ball.pos) < 0.6 && ball.pos.y < 0.8) { D.lostBy = 'loose'; this.result('lost'); return; }
    for (const m of this.mates) if (m.state === 'free' && dist2(m.footPoint(), ball.pos) < 0.6 && ball.pos.y < 0.8) { D.poss = m; D.carrierT = 0; return; }
  },
  indicators(dt, inp, mv, beg) {
    const u = user; const waiting = D.state === 'play' && D.poss && D.poss !== u;
    if (waiting) {
      D.bestT -= dt; if (D.bestT <= 0) { D.bestT = 0.3; D.best = this.bestSpace(); }
      const st = this.userOpen(); D.repWaitT += dt; D.stats.waitT += dt; if (st && st.open) { D.repOpenT += dt; D.stats.openT += dt; }
      const callKey = keysLabel(scheme().btn.match[beg ? 'a' : 'b']);
      if (st.off) setChip(`Offside: get back level with the defender`, '#ffd34d');
      else if (st.open) setChip(`Open: call for it (${device === 'keyboard' ? callKey : beg ? 'A' : 'X'})`, '#7be0a0');
      else setChip(st.lane ? 'Marked: lose your defender' : 'Lane blocked: move into the blue ring', '#ff8a7a');
      userRing.material.color.setHex(st.off ? 0xffd34d : st.open ? 0x4fbf7a : 0xff5a4f);
      if (D.best && !(st.open && dist2(D.best, u.pos) < 3)) {
        spaceMark.visible = true; spaceMark.position.x = D.best.x; spaceMark.position.z = D.best.z; spaceMark.scale.setScalar(1 + Math.sin(NOW * 5) * 0.07);
        const pa = runLine.geometry.attributes.position.array; pa[0] = u.pos.x; pa[1] = 0.04; pa[2] = u.pos.z; pa[3] = D.best.x; pa[4] = 0.04; pa[5] = D.best.z; runLine.geometry.attributes.position.needsUpdate = true; runLine.computeLineDistances(); runLine.visible = true;
      } else { spaceMark.visible = false; runLine.visible = false; }
    } else {
      spaceMark.visible = false; runLine.visible = false; userRing.material.color.setHex(0xffb547);
      if (D.state === 'play' && D.poss === u) setChip(HL - ball.pos.x < 26 ? 'On the ball: shoot, or pass and go again' : 'On the ball: drive forward or play a one-two', '#f2efe6');
      else setChip(D.state === 'play' && D.flight && D.flight.to === u ? 'Ball coming to you' : '', '#f2efe6');
    }
    // live shot reticle
    if (D.state === 'play' && D.poss === u && u.state === 'free' && HL - ball.pos.x < 30) {
      const pw = D.hold ? Math.min(1.15, D.hold.t / 0.95) : beg ? 0.75 : 0.6;
      const am = shotAimPoint(inp, mv, ball.pos, pw, beg, u.heading); showShotMark(am.tz, shotHeight('driven', pw, am.baseY), !!D.hold || beg);
    } else if (!D.shot && u.state !== 'strike') shotMark.visible = false;
  },
  feedback(kind) {
    const rows = []; const wait = Math.max(0.1, D.repWaitT); const openPct = Math.round(100 * D.repOpenT / wait);
    if (D.repWaitT > 0.5) rows.push(['Time in space', openPct + '%', openPct > 45 ? 'good' : openPct > 20 ? 'ok' : 'bad']);
    rows.push(['Called for it', D.repCalls ? (D.callOpen === false ? 'While marked' : 'When open') : 'No call', D.repCalls ? (D.callOpen === false ? 'bad' : 'good') : 'bad']);
    const r = D.lastR; if (r && r.style && !r.whiff) { const q = r.quality ?? 0; rows.push(['Strike', q > 0.75 ? 'Clean' : q > 0.45 ? 'Decent' : 'Scuffed', q > 0.75 ? 'good' : q > 0.45 ? 'ok' : 'bad']); rows.push(['Body shape', r.bodyAngle < 40 ? 'Open to goal' : 'Across your body', r.bodyAngle < 40 ? 'good' : 'bad']); }
    const tips = {
      offside: 'Stay level with the last defender until the pass is played. Call for the through ball as you start your run.',
      intercepted: 'You called while marked. Move into the blue ring, away from your marker, then call.',
      lost: D.lostBy === 'sprint' ? 'Do not sprint at a defender with the ball. Slow down, or pass and go again.' : 'Release the ball earlier, or shield it by slowing down.',
      timeout: D.repCalls ? 'Get open sooner. Check away from your marker, then come short or spin in behind.' : 'Call for the ball. Your teammates only pass when you ask.',
      claimed: 'Through balls into the box need a run that gets there before the keeper.',
      saved: 'Aim the reticle away from the keeper, toward a corner.', parried: 'Aim the reticle away from the keeper, toward a corner.',
      wide: 'Keep the reticle inside the posts. It turns red when you are aiming wide.', over: 'Too much power: the reticle climbs over the bar. Release earlier.',
      blocked: 'Shift the ball away from the defender before you shoot.', out: 'Keep the ball under control.'
    };
    let tip = tips[kind] || '';
    if (kind === 'goal' && D.callOpen === false) tip = 'Goal, but you called while marked. Get open first and you will get the ball more often.';
    return { title: 'Movement and finish', rows, tip };
  },
  result(kind) {
    if (D.state !== 'play') return; D.state = 'over'; D.hold = null; setPower(null);
    const fb = this.feedback(kind);
    const moveBonus = (D.callOpen ? 10 : 0) + (D.wasOneTwo ? 5 : 0); D.wasOneTwo = false;
    if (kind === 'goal') {
      const az = Math.abs(ball.pos.z), y = ball.pos.y;
      const pts = clamp(85 + Math.round(18 * clamp(az / 2.2, 0, 1) + 7 * clamp(y / 1.7, 0, 1)) + moveBonus, 0, 125);
      D.stats.goals++; user.pl.playOnce(Math.random() < 0.5 ? 'm_cheer_03' : 'm_cheer_01', { fade: 0.3 }); sfx.cheer(); cheerT = 2.4;
      repDone(pts, 'Goal', `+${pts}`, 'var(--flood)', fb);
    } else {
      const map = {
        saved: ['Saved', 'Good chance created', 25], parried: ['Parried', 'Good chance created', 25], post: ['Off the woodwork', 'So close', 22], wide: ['Wide', '', 12], over: ['Over the bar', '', 12], short: ['No power', '', 8], blocked: ['Blocked', '', 10],
        offside: ['Offside', 'You were beyond the last defender when the pass was played', 0], intercepted: ['Intercepted', 'The defender read it', 0], lost: ['Ball lost', D.lostBy === 'sprint' ? 'Sprinting into a defender' : 'Tackled', 0], claimed: ['Keeper claims', '', 0], timeout: ['Attack broke down', D.repCalls ? 'Too slow' : 'You never called for the ball', 0], out: ['Out of play', '', 0]
      };
      const [m, s, p] = map[kind] || ['Over', '', 0];
      if (kind === 'offside') { D.stats.offside++; sfx.foul(); bubble(user, 'OFFSIDE', '#ffd34d', 1.6); }
      if (kind === 'lost' || kind === 'intercepted') D.stats.lost++;
      if (p === 0) sfx.groan();
      repDone(p, m, s, 'var(--chalk)', fb);
    }
  },
  summary() { const s = D.stats; const pct = s.waitT > 0 ? Math.round(100 * s.openT / s.waitT) + '%' : '—'; return [['Goals', `${s.goals} of ${D.reps}`], ['Shots', s.shots], ['Passes received', s.received], ['Calls for the ball', s.calls], ['Time in space', pct], ['Offside', s.offside], ['Ball lost or cut out', s.lost], ['One-twos', s.oneTwos]]; }
};
const DRILL_IMPL = { match, finishing, saves, tackling: defending, passing };

function drillTick(dt, inp) {
  const impl = DRILL_IMPL[D.id];
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) hideMsg(); }
  if (D.phase === 'count') {
    D.t += dt; const left = 2.1 - D.t; const n = Math.ceil(left / 0.7);
    if (n !== D.lastN && n > 0) { D.lastN = n; showMsg(String(n), DRILLS[D.id].unit, 'var(--chalk)', 0.6); sfx.tick(); }
    if (left <= 0) { D.phase = 'play'; showMsg('Go', '', 'var(--flood)', 0.5); sfx.whistle(); }
    impl.update(dt, NOINPUT); return;
  }
  if (D.phase === 'done') {
    D.doneT += dt;
    if (D.doneT > 1.8 && !D.shown) { D.shown = true; if (D.practice) { enterHub(); toast('Practice finished.'); } else showResults(); return; }
    impl.update(dt, NOINPUT); return;
  }
  if (D.wait > 0) { D.wait -= dt; if (D.wait <= 0 && D.after) { const f = D.after; D.after = null; f(); } }
  impl.update(dt, inp);
}

/* ---------- progression ---------- */
function finishSession(id, score) {
  rollDaily();
  const d = DRILLS[id], p = S.profile, attr = d.attr; const perf = clamp(score / 1000, 0, 1); const before = p.ratings[attr];
  const md = isBeginner() ? 'beginner' : 'pro'; const mult = MODE_REWARD[md];
  let gain = clamp((perf - (before / 100) * 0.85) * 7, 0, 3) * mult;
  const room = Math.max(0, S.settings.dailyRatingCap - (S.daily.gains[attr] || 0)); const ratingCapped = gain > room;
  gain = Math.round(Math.min(gain, room) * 10) / 10; p.ratings[attr] = Math.min(99, before + gain); S.daily.gains[attr] = (S.daily.gains[attr] || 0) + gain;
  let pts = Math.round((20 + perf * 300) * mult); const pRoom = Math.max(0, S.settings.dailyPointsCap - S.daily.points); const pointsCapped = pts > pRoom; pts = Math.min(pts, pRoom); S.daily.points += pts;
  const best = score > (S.best[id] || 0); if (best) S.best[id] = score;
  S.sessions.push({ drill: id, score, perf, gain, pts, t: Date.now(), day: today(), mode: md });
  if (pts > 0) credit(pts, `Training: ${d.name}, ${md === 'pro' ? 'Pro' : 'Beginner'} (${score} / 1,000)`); else save();
  return { md, attr, before, after: p.ratings[attr], gain, ratingCapped, pts, pointsCapped, best };
}
function showResults() {
  const id = D.id; const score = clamp(Math.round(D.score), 0, 1000); const r = finishSession(id, score);
  const rows = DRILL_IMPL[id].summary().map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  const sh = openModal(`
    <div class="label">${esc(DRILLS[id].name)} · ${r.md === 'pro' ? 'Pro' : 'Beginner'} · session complete</div>
    <h2 style="margin-top:8px">${score >= 750 ? 'Outstanding' : score >= 500 ? 'Good session' : score >= 250 ? 'Keep working' : 'Tough session'}</h2>
    <div class="res-score">${fmt(score)}<small> / 1,000</small> ${r.best ? '<span class="tag good" style="vertical-align:middle">New best</span>' : ''}</div>
    <div class="rows"><div><span>${esc(ATTRS[r.attr])} rating</span><b>${r.before.toFixed(1)} → ${r.after.toFixed(1)} ${r.gain > 0 ? `<span class="tag good">+${r.gain.toFixed(1)}</span>` : ''}</b></div><div><span>Points earned</span><b>+${fmt(r.pts)}</b></div>${rows}</div>
    ${r.ratingCapped ? `<p class="muted" style="margin-top:10px">Daily rating limit reached for ${esc(ATTRS[r.attr]).toLowerCase()}. Train again tomorrow to keep improving.</p>` : ''}
    ${r.pointsCapped ? '<p class="muted" style="margin-top:6px">Daily points limit reached. Ratings still count today.</p>' : ''}
    ${r.md === 'beginner' ? '<p class="muted" style="margin-top:6px">Beginner sessions earn 70% of the points and rating. Switch to Pro on your player card for full rewards.</p>' : ''}
    <div class="btn-row"><button class="btn primary" type="button" data-again>Go again</button><button class="btn" type="button" data-practice>Practice this drill</button><button class="btn" type="button" data-hub>Back to training ground</button></div>`, { closable: false });
  sh.querySelector('[data-again]').addEventListener('click', () => startDrill(id));
  sh.querySelector('[data-practice]').addEventListener('click', () => startDrill(id, true));
  sh.querySelector('[data-hub]').addEventListener('click', () => { closeModal(); enterHub(); });
}

/* ---------- grants officer ---------- */
function grantState() {
  const need = S.settings.grantSessions, n = S.sessions.length; const last = S.grants[0];
  if (S.grants.some((g) => g.status === 'pending')) return { ok: false, why: 'Your last application is waiting for sign-off.' };
  if (last && last.status === 'approved') { const days = (Date.now() - last.t) / 86400000; if (days < S.settings.grantCooldownDays) return { ok: false, why: `Next application opens in ${Math.ceil(S.settings.grantCooldownDays - days)} days.` }; }
  if (last && last.status === 'declined' && n - last.sessionsAt < 3) return { ok: false, why: `Train ${3 - (n - last.sessionsAt)} more sessions before reapplying.`, progress: (n - last.sessionsAt) / 3 };
  if (n < need) return { ok: false, why: `Train ${need - n} more ${need - n === 1 ? 'session' : 'sessions'} to apply.`, progress: n / need };
  return { ok: true, why: 'You can apply now.' };
}
function evaluateGrant() {
  const p = S.profile, ses = S.sessions; const days = new Set(ses.slice(-40).map((s) => s.day)).size;
  const consistency = Math.round(clamp(days / 7, 0, 1) * 22 + clamp(ses.length / 20, 0, 1) * 18);
  const gainSum = Object.keys(ATTRS).reduce((a, k) => a + (p.ratings[k] - p.startRatings[k]), 0); const improvement = Math.round(clamp(gainSum / 10, 0, 1) * 40);
  const recent = ses.slice(-5); const form = recent.length ? recent.reduce((a, s) => a + s.perf, 0) / recent.length : 0; const formScore = Math.round(clamp(form, 0, 1) * 20);
  const total = consistency + improvement + formScore; const amount = total < 30 ? 0 : Math.round((S.settings.maxGrant * total / 100) / 50) * 50;
  const reasons = [`Consistency ${consistency} / 40: ${ses.length} ${ses.length === 1 ? 'session' : 'sessions'} over ${days} ${days === 1 ? 'day' : 'days'}.`, `Improvement ${improvement} / 40: ratings up ${gainSum.toFixed(1)} points in total since sign-up.`, `Recent form ${formScore} / 20: average score ${Math.round(form * 1000)} over the last ${recent.length} sessions.`];
  const status = amount === 0 ? 'declined' : amount > S.settings.maxGrant * 0.6 ? 'pending' : 'approved';
  return { t: Date.now(), total, amount, reasons, status, sessionsAt: ses.length };
}
function applyGrant() {
  const st = grantState(); if (!st.ok) return;
  const g = evaluateGrant(); S.grants.unshift(g);
  if (g.status === 'approved') credit(g.amount, `Development grant (score ${g.total} / 100)`); else save();
  const verdict = g.status === 'approved' ? '<span class="tag good">Approved</span>' : g.status === 'pending' ? '<span class="tag">Waiting for sign-off</span>' : '<span class="tag warn">Not this time</span>';
  openModal(`<div class="label">Development Fund</div><h2 style="margin-top:8px">Grant decision</h2>
    <div class="agent"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><b>Grants Officer · AI agent</b>${verdict}</div><ul>${g.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <p style="margin:10px 0 0"><b>Total ${g.total} / 100.</b> ${g.status === 'declined' ? 'Scores under 30 do not qualify. Train regularly and push your ratings up, then apply again.' : g.status === 'pending' ? `Recommended grant: ${fmt(g.amount)} points. Grants this large need a human reviewer to approve them.` : `${fmt(g.amount)} points added to your wallet.`}</p></div>
    <div class="btn-row"><button class="btn primary" type="button" data-close>Done</button></div>`);
  renderHub();
}

/* ---------- hub ---------- */
function renderHub() {
  $('#balanceTop').textContent = fmt(S.balance); $('#soundBtn').textContent = S.sound ? 'Sound on' : 'Sound off';
  const p = S.profile; if (!p) return; const pos = POSITIONS[p.position];
  $('#heroEyebrow').textContent = `${pos.name} · No. ${p.number} · Game Arena Academy`; $('#heroTitle').textContent = p.name;
  $('#heroLine').textContent = `${pos.blurb} Every drill scores your technique, not just the result.`;
  const days = new Set(S.sessions.map((s) => s.day)).size;
  $('#playerCard').innerHTML = `
    <div class="pcard-top"><div><div class="ovr">${Math.floor(overall(p))}</div><div class="label" style="margin-top:6px">Overall</div></div>
      <div style="text-align:right;min-width:0"><div class="pos-code">${esc(p.position)} · ${esc(p.number)}</div><div class="pname">${esc(p.name)}</div></div></div>
    ${Object.keys(ATTRS).map((k) => `<div class="attr ${pos.main === k ? 'main' : ''}"><span class="k">${ATTRS[k]}</span><span class="n">${Math.floor(p.ratings[k])}</span><div class="meter"><i style="width:${p.ratings[k]}%"></i></div></div>`).join('')}
    <div class="facts"><div><span class="label">Sessions</span><b>${S.sessions.length}</b></div><div><span class="label">Days trained</span><b>${days}</b></div></div>
    <div class="facts" style="grid-template-columns:1fr"><div><span class="label">Control mode</span><div class="btn-row" style="margin-top:8px"><button class="btn ${isBeginner() ? 'primary' : ''}" type="button" data-mode="beginner">Beginner</button><button class="btn ${isBeginner() ? '' : 'primary'}" type="button" data-mode="pro">Pro</button></div><p class="muted" style="margin-top:8px;font-size:13px">${isBeginner() ? 'One button, assisted. 70% rewards.' : 'Full technique. Full rewards.'}</p></div></div>
    <div class="btn-row"><button class="btn" type="button" data-look>Change look</button></div>`;
  $('#drillList').innerHTML = Object.entries(DRILLS).map(([id, d]) => {
    const rec = d.pos === p.position;
    return `<article class="drill ${rec ? 'rec' : ''}">
      ${rec ? '<span class="tag">Your position</span>' : `<span class="tag soon">For ${POSITIONS[d.pos].name.toLowerCase()}s</span>`}
      <h3>${esc(d.name)}</h3><div class="meta">${ATTRS[d.attr]} <span>·</span> ${d.unit} <span>·</span> Best ${S.best[id] ? fmt(S.best[id]) : '—'}</div>
      <p>${esc(d.desc)}</p>
      <div class="acts"><button class="go" type="button" data-drill="${id}">Start session</button><button class="go practice" type="button" data-practice="${id}">Practice</button></div>
    </article>`;
  }).join('');
  rollDaily();
  $('#walletPanel').innerHTML = `<h2>Wallet</h2><div class="bal">${fmt(S.balance)}<small>points</small></div>
    <p class="muted" style="margin-top:8px">Today: ${fmt(S.daily.points)} of ${fmt(S.settings.dailyPointsCap)} training points earned.</p>
    <div class="btn-row"><button class="btn primary" type="button" data-lagos>Transfer from LagosLife</button><button class="btn" type="button" disabled>Top up with cash <span class="tag soon">Coming soon</span></button></div>`;
  const st = grantState(); const lastG = S.grants[0];
  $('#grantPanel').innerHTML = `<h2>Development grant</h2><p class="muted">The Grants Officer rewards players who train consistently and improve. Up to ${fmt(S.settings.maxGrant)} points.</p>
    ${st.progress !== undefined ? `<div class="progress"><i style="width:${clamp(st.progress, 0, 1) * 100}%"></i></div>` : ''}
    <p class="muted" style="color:var(--chalk);margin-top:8px">${esc(st.why)}</p>
    ${lastG ? `<p class="muted" style="margin-top:8px">Last decision: ${lastG.status === 'approved' ? `approved, ${fmt(lastG.amount)} points` : lastG.status === 'pending' ? `${fmt(lastG.amount)} points waiting for sign-off` : 'not approved'}.</p>` : ''}
    <div class="btn-row"><button class="btn ${st.ok ? 'primary' : ''}" type="button" data-grant ${st.ok ? '' : 'disabled'}>Apply for a grant</button></div>`;
  $('#ledger').innerHTML = S.ledger.slice(0, 6).map((l) => `<li><span class="d">${esc(l.desc)}</span><span class="a ${l.amount < 0 ? 'neg' : ''}">${l.amount >= 0 ? '+' : ''}${fmt(l.amount)}</span><time>${new Date(l.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></li>`).join('') || '<li class="muted">No points yet.</li>';
}
$('#hub').addEventListener('click', (e) => {
  const dr = e.target.closest('[data-drill]'); if (dr) { const id = dr.dataset.drill; if (!S.controls) openControls(() => openGuide(id, false)); else openGuide(id, false); return; }
  const pr = e.target.closest('[data-practice]'); if (pr) { const id = pr.dataset.practice; if (!S.controls) openControls(() => openGuide(id, true)); else openGuide(id, true); return; }
  if (e.target.closest('[data-lagos]')) openLagos();
  if (e.target.closest('[data-grant]')) applyGrant();
  if (e.target.closest('[data-look]')) openLook();
  const mb = e.target.closest('[data-mode]'); if (mb) setMode(mb.dataset.mode);
});

/* ---------- onboarding ---------- */
function lookOptions(sel) { return LOOKS.map((l, i) => `<label><input type="radio" name="look" value="${i}" ${i === sel ? 'checked' : ''}><b>Look ${i + 1}</b><span>${esc(l.label)}</span></label>`).join(''); }
function openOnboarding() {
  const sh = openModal(`
    <div class="label">Game Arena · Training Ground</div>
    <h2 style="margin-top:8px">Sign up and pick your position</h2>
    <p class="muted">You get ${fmt(S.settings.startingGrant)} free points to start. Train your position to raise your rating and earn more.</p>
    <form id="signup" novalidate>
      <div class="field"><label class="label" for="pName">Player name</label><input id="pName" type="text" maxlength="22" autocomplete="nickname" placeholder="e.g. Tunde Bakare" required></div>
      <div class="field"><span class="label">Position</span><div class="positions">${Object.entries(POSITIONS).map(([k, v], i) => `<label><input type="radio" name="pos" value="${k}" ${i === 3 ? 'checked' : ''}><b>${v.name}</b><span>${v.blurb}</span></label>`).join('')}</div></div>
      <div class="field"><span class="label">Your look</span><div class="positions">${lookOptions(0)}</div></div>
      <label class="check"><input type="checkbox" id="pAge"><span>I am 18 or older. Game Arena is for adults only.</span></label>
      <div class="err" id="suErr"></div>
      <div class="btn-row"><button class="btn primary" type="submit">Join the training ground</button></div>
    </form>`, { closable: false });
  sh.querySelector('#signup').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = sh.querySelector('#pName').value.trim(); const pos = (sh.querySelector('input[name=pos]:checked') || {}).value; const look = Number((sh.querySelector('input[name=look]:checked') || {}).value || 0);
    if (name.length < 2) { sh.querySelector('#suErr').textContent = 'Enter a player name of at least 2 characters.'; sh.querySelector('#pName').focus(); return; }
    if (!sh.querySelector('#pAge').checked) { sh.querySelector('#suErr').textContent = 'You need to confirm you are 18 or older to play.'; return; }
    const ratings = { shooting: 40, passing: 40, defending: 40, keeping: 40 }; ratings[POSITIONS[pos].main] = 48;
    S.profile = { name, position: pos, ratings, startRatings: { ...ratings }, createdAt: Date.now(), look, number: POSITIONS[pos].num, mode: 'beginner' };
    credit(S.settings.startingGrant, 'Starting grant');
    refreshUserLook(); closeModal(); enterHub(); sfx.ui();
    user.pl.playOnce('m_cheer_03', { fade: 0.3 });
    toast(`Welcome, ${name}. ${fmt(S.settings.startingGrant)} starting points added.`);
  });
}
function openLook() {
  const p = S.profile;
  const sh = openModal(`<div class="label">Player</div><h2 style="margin-top:8px">Your look and number</h2>
    <form id="lookForm" novalidate><div class="field"><span class="label">Look</span><div class="positions">${lookOptions(p.look || 0)}</div></div>
    <div class="field"><label class="label" for="pNum">Shirt number</label><input id="pNum" type="number" min="1" max="99" value="${p.number}"></div>
    <div class="err" id="lkErr"></div><div class="btn-row"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-close>Cancel</button></div></form>`);
  sh.querySelector('#lookForm').addEventListener('submit', (e) => {
    e.preventDefault(); const n = Math.round(Number(sh.querySelector('#pNum').value));
    if (!(n >= 1 && n <= 99)) { sh.querySelector('#lkErr').textContent = 'Pick a number from 1 to 99.'; return; }
    p.look = Number((sh.querySelector('input[name=look]:checked') || {}).value || 0); p.number = n; save(); refreshUserLook(); closeModal(); enterHub(); toast('Look updated.');
  });
}
function openLagos() {
  const rate = S.settings.lagosRate;
  const sh = openModal(`<div class="label">Wallet</div><h2 style="margin-top:8px">Transfer from LagosLife</h2>
    <p class="muted">Bring your LagosLife points into Game Arena. Current rate: 1 LagosLife point = ${rate} Game Arena ${rate === 1 ? 'point' : 'points'}.</p>
    <form id="llForm" novalidate><div class="field"><label class="label" for="llAmt">LagosLife points</label><input id="llAmt" type="number" min="1" step="1" inputmode="numeric" value="500"><small id="llPrev"></small></div>
    <div class="err" id="llErr"></div><div class="btn-row"><button class="btn primary" type="submit">Transfer</button><button class="btn" type="button" data-close>Cancel</button></div></form>
    <p class="muted" style="margin-top:14px">Prototype: no LagosLife account is linked yet, so this adds the points directly.</p>`);
  const amt = sh.querySelector('#llAmt'), prevEl = sh.querySelector('#llPrev');
  const upd = () => { const v = Math.floor(Number(amt.value) || 0); prevEl.textContent = v > 0 ? `You will receive ${fmt(v * rate)} Game Arena points.` : ''; };
  amt.addEventListener('input', upd); upd();
  sh.querySelector('#llForm').addEventListener('submit', (e) => {
    e.preventDefault(); const v = Math.floor(Number(amt.value) || 0);
    if (v < 1) { sh.querySelector('#llErr').textContent = 'Enter at least 1 LagosLife point.'; return; }
    if (v > 1000000) { sh.querySelector('#llErr').textContent = 'Transfers are limited to 1,000,000 LagosLife points at a time.'; return; }
    const got = Math.round(v * rate); credit(got, `LagosLife transfer: ${fmt(v)} at ${rate}`); closeModal(); renderHub(); toast(`${fmt(got)} points added from LagosLife.`);
  });
}
function openAdmin() {
  const pending = S.grants.filter((g) => g.status === 'pending');
  const sh = openModal(`<div class="label">Admin</div><h2 style="margin-top:8px">Game settings</h2>
    <p class="muted">Changes apply straight away, with no app update. In the full game these live on the server and only staff can change them.</p>
    <form id="adminForm" novalidate><div class="settings">${Object.keys(DEFAULT_SETTINGS).map((k) => `<div class="field"><label class="label" for="set_${k}">${SETTING_INFO[k][0]}</label><input id="set_${k}" type="number" min="0" step="${k === 'lagosRate' ? '0.01' : '1'}" value="${S.settings[k]}"><small>${SETTING_INFO[k][1]}</small></div>`).join('')}</div>
    <div class="err" id="adErr"></div><div class="btn-row"><button class="btn primary" type="submit">Save settings</button></div></form>
    <h3>Waiting for your sign-off</h3>
    ${pending.length ? pending.map((g) => `<div class="agent"><b>Development grant · ${fmt(g.amount)} points</b> <span class="tag">Score ${g.total} / 100</span><ul>${g.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><div class="btn-row"><button class="btn primary" type="button" data-approve="${g.t}">Approve</button><button class="btn" type="button" data-reject="${g.t}">Reject</button></div></div>`).join('') : '<p class="muted">Nothing waiting. Grants above 60% of the largest grant land here.</p>'}
    <h3>Change log</h3><ul class="log">${S.settingsLog.slice(0, 8).map((l) => `<li>${esc(l.text)} <span class="muted" style="font-size:12px">· ${new Date(l.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></li>`).join('') || '<li class="muted">No changes yet.</li>'}</ul>
    <h3>Prototype data</h3><p class="muted">Start again with a new player. This clears the profile, points and history saved in this browser.</p>
    <div class="btn-row"><button class="btn" type="button" id="resetBtn">Reset prototype data</button></div>`, { wide: true });
  sh.querySelector('#adminForm').addEventListener('submit', (e) => {
    e.preventDefault(); const changes = [];
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      const v = Number(sh.querySelector('#set_' + k).value);
      if (!Number.isFinite(v) || v < 0) { sh.querySelector('#adErr').textContent = `${SETTING_INFO[k][0]} must be a number of 0 or more.`; return; }
      const nv = k === 'lagosRate' ? Math.round(v * 100) / 100 : Math.round(v); if (nv !== S.settings[k]) changes.push(`${SETTING_INFO[k][0]}: ${S.settings[k]} → ${nv}`); S.settings[k] = nv;
    }
    changes.forEach((c) => S.settingsLog.unshift({ t: Date.now(), text: `Admin changed ${c}` })); save(); renderHub(); closeModal();
    toast(changes.length ? `${changes.length} ${changes.length === 1 ? 'setting' : 'settings'} saved.` : 'No changes to save.');
  });
  sh.querySelectorAll('[data-approve],[data-reject]').forEach((b) => b.addEventListener('click', () => {
    const t = Number(b.dataset.approve || b.dataset.reject); const g = S.grants.find((x) => x.t === t); if (!g) return;
    if (b.dataset.approve) { g.status = 'approved'; credit(g.amount, 'Development grant (approved by admin)'); S.settingsLog.unshift({ t: Date.now(), text: `Admin approved a ${fmt(g.amount)} point grant` }); }
    else { g.status = 'declined'; S.settingsLog.unshift({ t: Date.now(), text: `Admin rejected a ${fmt(g.amount)} point grant` }); }
    save(); renderHub(); openAdmin();
  }));
  const rb = sh.querySelector('#resetBtn');
  rb.addEventListener('click', () => {
    if (!rb.dataset.armed) { rb.dataset.armed = '1'; rb.textContent = 'Tap again to confirm reset'; rb.classList.add('primary'); return; }
    const ks = S.settings, kl = S.settingsLog; S = blank(); S.settings = ks; S.settingsLog = kl; save(); closeModal(); enterHub(); openOnboarding();
  });
}
$('#ctlBtn').addEventListener('click', () => { if (mode === 'drill' && !paused) togglePause(); openControls(); });
$('#adminBtn').addEventListener('click', () => { if (mode === 'drill' && !paused) togglePause(); openAdmin(); });
$('#soundBtn').addEventListener('click', () => { S.sound = !S.sound; save(); $('#soundBtn').textContent = S.sound ? 'Sound on' : 'Sound off'; if (S.sound) sfx.ui(); });

/* ---------- main loop ---------- */
function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.75 ? 62 : w / h < 1.1 ? 52 : 42; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
let orbit = 0.6;
const QUALITY = [Math.min(window.devicePixelRatio || 1, 1.5), 1.25, 1, 0.8, 0.65];
let qLevel = 0, qTime = 0, qFrames = 0, qGrace = 1;
function adaptQuality(raw) {
  if (document.hidden) return; qTime += raw; qFrames++; if (qTime < 2) return;
  const avg = qTime / qFrames; qTime = 0; qFrames = 0; if (qGrace > 0) { qGrace--; return; }
  if (avg > 0.03) { const cur = QUALITY[qLevel]; let j = qLevel + 1; while (j < QUALITY.length && QUALITY[j] >= cur) j++; if (j < QUALITY.length) { qLevel = j; renderer.setPixelRatio(QUALITY[qLevel]); resize(); } }
}
function hubTick(dt) {
  if (!reduceMotion) orbit += dt * 0.12;
  // frame the player in the hero: right of the title on wide screens, high up on phones
  // camera in front of the player (he faces about 34 degrees left of +x), title sits to his left on screen
  const wide = camera.aspect > 1.1; const face = -Math.PI / 2 + 0.6; const a = Math.atan2(-Math.sin(face), Math.cos(face)) + Math.sin(orbit) * 0.4;
  const R = wide ? 4.2 : 5.4; const px = 0.6, pz = 0.4;
  const cx = px + Math.cos(a) * R, cz = pz + Math.sin(a) * R;
  const rx = -Math.sin(a), rz = Math.cos(a); const shift = wide ? 1.5 : 0;
  camTo(cx, wide ? 1.5 : 1.1, cz, px + rx * shift, wide ? 1.0 : 0.5, pz + rz * shift, 2);
  if (user && user.visible) { user.vel.set(0, 0, 0); user.finish(dt); ballStep(dt); }
}
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(); adaptQuality(raw); const dt = Math.min(raw, 0.05);
  tick(dt);
  renderer.render(scene, camera);
}
function tick(dt) {
  NOW += dt;
  if (mode === 'drill' && D) { const inp = readInput(); if (S.controls === 'player' && !paused) chaseYaw -= inp.x * 2.4 * dt; if (!paused) drillTick(dt, inp); if (!$('#overlay').hidden || paused) padMenuNav(dt); }
  else if (mode === 'hub') { readInput(); padMenuNav(dt); hubTick(dt); }
  if (userRing.visible) { const b = D && D.id === 'saves' ? userGK : user; userRing.position.set(b.pos.x, 0.02, b.pos.z); }
  const showAim = mode === 'drill' && D && lastInp && !paused;
  aimMark.visible = !!(showAim && lastInp.aimPt && !lastInp.goalPt); if (aimMark.visible) aimMark.position.set(lastInp.aimPt.x, 0.03, lastInp.aimPt.z);
  goalMark.visible = !!(showAim && lastInp.goalPt); if (goalMark.visible) goalMark.position.copy(lastInp.goalPt);
  ballSync(); netUpdate(dt); updateBubbles(); updateCrowd(dt, NOW); camUpdate(dt);
  if (dbgCam) { camera.position.copy(dbgCam[0]); camera.lookAt(dbgCam[1]); }
}

// Boot
camSnap(); frame();
loadAssets('assets/', (f) => { $('#loadBar').style.width = Math.round(f * 100) + '%'; })
  .then(() => {
    buildActors(); $('#loading').remove();
    enterHub(); camSnap();
    if (!S.profile) openOnboarding();
  })
  .catch((err) => { $('#loading').innerHTML = 'The players did not load.<small>' + esc(err.message) + '. Reload the page to try again.</small>'; });

window.GameArena = {
  state: () => S, startDrill, enterHub, drill: () => D,
  perf() { const t0 = performance.now(); for (let i = 0; i < 60; i++) tick(1 / 60); const t1 = performance.now(); for (let i = 0; i < 5; i++) renderer.render(scene, camera); const t2 = performance.now(); return { tickMs: (t1 - t0) / 60, renderMs: (t2 - t1) / 5, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
  mouse, matchOpen: () => match.userOpen(), defs: () => match.defs, mates: () => match.mates, dbgCam(p, l) { dbgCam = p ? [new V3(...p), new V3(...l)] : null; },
  step(n) { for (let i = 0; i < n; i++) tick(1 / 60); },
  project(x, y, z) { const v = new V3(x, y, z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, user: () => user, gk: () => userGK, opp: () => opp, keeper: () => keeper, ball,
  sim(sec, f) {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      const raw = typeof f === 'function' ? f(i / 60, D) : (f || {});
      const mk = (k) => { const v = !!raw[k]; const o = { down: v, pressed: v && !prev[k], released: !v && prev[k] }; prev[k] = v; return o; };
      const inp = { x: raw.x || 0, y: raw.y || 0, mag: Math.min(1, Math.hypot(raw.x || 0, raw.y || 0)), sprint: !!raw.sprint, a: mk('a'), b: mk('b'), c: mk('c') };
      NOW += 1 / 60;
      if (mode === 'drill' && D && !paused) drillTick(1 / 60, inp);
      ballSync(); netUpdate(1 / 60); updateBubbles();
    }
    camSnap(); camUpdate(0.001);
  }
};
})();
