/* Character: realistic skinned footballer driven by a direction-based pose system.
   Body space: +z forward, +y up, +x the player's left. */
(function () {
'use strict';
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const _q1 = new Q(), _q2 = new Q(), _q3 = new Q(), _v1 = new V3(), _v2 = new V3();
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

/* ---------- kit shader ---------- */
function kitMaterial(src, kind, uniforms) {
  const m = src.clone();
  m.userData.kit = uniforms;
  if (kind === 'top' || kind === 'bottom' || kind === 'boots') { m.normalMap = null; m.metalnessMap = null; m.roughnessMap = null; m.metalness = 0; m.roughness = kind === 'boots' ? 0.45 : 0.82; }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vBindPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindPos = position;');
    let frag = 'varying vec3 vBindPos;\nuniform vec3 uMain;\nuniform vec3 uTrim;\nuniform vec3 uSock;\nuniform vec3 uSkin;\n' + sh.fragmentShader;
    let code = '';
    const luma = 'float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));';
    if (kind === 'top') code = 'if (vBindPos.y < 0.94 && abs(vBindPos.x) < 0.3) discard; if (vBindPos.z > 0.105 && vBindPos.y > 1.335 && vBindPos.y < 1.475 && vBindPos.x > -0.185 && vBindPos.x < -0.085) discard; if (vBindPos.z > 0.05 && vBindPos.y > 1.49 && abs(vBindPos.x) < 0.095) discard;' + 'float lum = 0.5 + 0.5 * dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));' + 'float sleeve = smoothstep(0.235, 0.26, abs(vBindPos.x)); float collar = smoothstep(1.47, 1.5, vBindPos.y) * (1.0 - sleeve); float cuff = step(0.44, abs(vBindPos.x)); vec3 c = mix(uMain, uTrim, max(collar, cuff * 0.9)); c = mix(c, uMain * 0.82, sleeve * (1.0 - cuff) * 0.35); diffuseColor.rgb = c * (0.72 + 0.32 * lum);';
    if (kind === 'bottom') code = luma + 'float y = vBindPos.y; vec3 shorts = uTrim * (0.6 + 0.55 * lum); vec3 knee = uSkin * vec3(0.62, 0.45, 0.36); vec3 sock = mix(uSock, uTrim, step(0.47, y)) * (0.75 + 0.35 * lum); diffuseColor.rgb = y > 0.66 ? shorts : (y > 0.53 ? knee : sock);';
    if (kind === 'body') code = 'float sock = step(vBindPos.y, 0.5) * step(0.06, vBindPos.y) * step(abs(vBindPos.x), 0.3); float band = step(0.44, vBindPos.y) * sock; vec3 sk = diffuseColor.rgb * uSkin; diffuseColor.rgb = mix(sk, mix(uSock, uTrim, band), sock);';
    if (kind === 'skin') code = 'diffuseColor.rgb *= uSkin;';
    if (kind === 'boots') code = luma + 'diffuseColor.rgb = mix(vec3(0.05), uTrim, step(0.045, vBindPos.y) * 0.85) * (0.6 + 0.6 * lum);';
    frag = frag.replace('#include <map_fragment>', '#include <map_fragment>\n' + code);
    sh.fragmentShader = frag;
  };
  m.customProgramCacheKey = () => 'kit-' + kind;
  return m;
}

/* ---------- pose helpers ---------- */
// limb direction in body space: swing forward (+) / back (-), abduct outward (+)
function legDir(swing, abd, side, out) { const ca = Math.cos(abd); return (out || new V3()).set(side * Math.sin(abd), -Math.cos(swing) * ca, Math.sin(swing) * ca); }
const armDir = legDir;
function blankLimb() { return { a: 0, b: 0, abd: 0, foot: 1.4, twist: 0 }; }
function blankPose() {
  return {
    hipsY: 0, hipsYaw: 0, hipsPitch: 0, hipsRoll: 0,
    spinePitch: 0, spineYaw: 0, spineRoll: 0, headPitch: 0, headYaw: 0,
    // legs: a = thigh swing, b = knee flex (shin swing = a - b), abd, foot = foot angle from shin
    L: { a: 0, b: 0.05, abd: 0.04, foot: 1.45 }, R: { a: 0, b: 0.05, abd: 0.04, foot: 1.45 },
    // arms: a = upper swing, b = elbow flex, abd = upper abduction
    AL: { a: 0, b: 0.25, abd: 0.12 }, AR: { a: 0, b: 0.25, abd: 0.12 },
    fist: 0.6
  };
}
function mixPose(p, q, t, out) {
  out = out || blankPose();
  for (const k of ['hipsY', 'hipsYaw', 'hipsPitch', 'hipsRoll', 'spinePitch', 'spineYaw', 'spineRoll', 'headPitch', 'headYaw', 'fist']) out[k] = lerp(p[k], q[k], t);
  for (const l of ['L', 'R', 'AL', 'AR']) for (const k of ['a', 'b', 'abd', 'foot']) if (p[l][k] !== undefined) out[l][k] = lerp(p[l][k], q[l][k] !== undefined ? q[l][k] : p[l][k], t);
  return out;
}
function copyPose(p) { return mixPose(p, p, 0); }

/* ---------- pose library ---------- */
const P = {};
P.idle = (t = 0) => { const p = blankPose(); const br = Math.sin(t * 1.6) * 0.015; p.hipsY = -0.015; p.L.b = 0.12; p.R.b = 0.12; p.L.a = 0.06; p.R.a = 0.06; p.L.abd = 0.07; p.R.abd = 0.07; p.spinePitch = 0.04 + br; p.AL.abd = 0.16; p.AR.abd = 0.16; p.AL.b = 0.3; p.AR.b = 0.3; return p; };
P.run = (ph, s) => {
  // s: 0 walk .. 1 sprint
  const p = blankPose();
  const amp = lerp(0.42, 0.78, s);
  for (const [k, o] of [['L', 0], ['R', Math.PI]]) {
    const f = ph + o; const sw = Math.sin(f);
    const l = p[k];
    l.a = amp * sw + 0.08;
    const swingPhase = Math.max(0, Math.cos(f - 0.35));
    l.b = lerp(0.25, 0.45, s) + lerp(0.7, 1.6, s) * swingPhase * swingPhase + 0.1 * Math.max(0, -sw);
    l.foot = 1.35 + 0.35 * Math.max(0, -Math.cos(f));
    l.abd = 0.03;
  }
  p.AL.a = -amp * 0.95 * Math.sin(ph); p.AR.a = -amp * 0.95 * Math.sin(ph + Math.PI);
  p.AL.b = lerp(0.9, 1.45, s); p.AR.b = p.AL.b; p.AL.abd = 0.14; p.AR.abd = 0.14;
  p.hipsY = -0.02 - 0.05 * s + 0.035 * Math.abs(Math.cos(ph)) * (0.5 + s);
  p.hipsYaw = 0.12 * Math.sin(ph) * (0.5 + s); p.spineYaw = -0.18 * Math.sin(ph) * (0.5 + s);
  p.spinePitch = 0.08 + 0.22 * s; p.headPitch = -0.1 - 0.12 * s;
  p.hipsRoll = 0.04 * Math.sin(ph);
  return p;
};
P.keeperReady = (t = 0) => {
  const p = blankPose(); const b = Math.sin(t * 7) * 0.012;
  p.hipsY = -0.2 + b; p.L.a = 0.55; p.R.a = 0.55; p.L.b = 1.05; p.R.b = 1.05; p.L.abd = 0.16; p.R.abd = 0.16; p.L.foot = 1.75; p.R.foot = 1.75;
  p.spinePitch = 0.38; p.headPitch = -0.35;
  p.AL.a = 0.65; p.AR.a = 0.65; p.AL.abd = 0.55; p.AR.abd = 0.55; p.AL.b = 1.0; p.AR.b = 1.0; p.fist = 0.2;
  return p;
};
P.jockey = (t = 0) => {
  const p = blankPose();
  p.hipsY = -0.16; p.L.a = 0.45; p.R.a = 0.25; p.L.b = 0.95; p.R.b = 0.8; p.L.abd = 0.18; p.R.abd = 0.18;
  p.spinePitch = 0.32; p.headPitch = -0.3; p.hipsYaw = 0.35; p.spineYaw = -0.2;
  p.AL.a = 0.2; p.AR.a = 0.1; p.AL.abd = 0.45; p.AR.abd = 0.45; p.AL.b = 0.8; p.AR.b = 0.8;
  return p;
};
// Strike: kicking leg = 'R' or 'L'. stage 0..1 through backswing, contact at 0.5, follow-through.
P.strike = (stage, leg = 'R', style = 'driven') => {
  const p = blankPose(); const sup = leg === 'R' ? 'L' : 'R'; const kA = leg === 'R' ? 'AR' : 'AL', oA = leg === 'R' ? 'AL' : 'AR';
  const sideSign = leg === 'R' ? -1 : 1; // kicking side in body x
  const keys = style === 'pass'
    ? [[0, -0.1, 0.4, 0], [0.32, -0.55, 1.1, 0.05], [0.5, 0.35, 0.2, 0.0], [0.75, 0.6, 0.25, -0.05], [1, 0.1, 0.3, 0]]
    : style === 'chip'
      ? [[0, -0.1, 0.4, 0], [0.32, -0.75, 1.6, 0.1], [0.5, 0.25, 0.5, 0.05], [0.75, 0.55, 0.6, 0], [1, 0.1, 0.3, 0]]
      : [[0, -0.1, 0.4, 0], [0.32, -0.7, 1.65, 0.12], [0.5, 0.45, 0.35, 0.05], [0.72, 1.15, 0.45, -0.05], [1, 0.25, 0.4, 0]];
  let i = 0; while (i < keys.length - 2 && stage > keys[i + 1][0]) i++;
  const k0 = keys[i], k1 = keys[i + 1]; const u = smooth(Math.min(1, Math.max(0, (stage - k0[0]) / (k1[0] - k0[0]))));
  const L = p[leg];
  L.a = lerp(k0[1], k1[1], u); L.b = lerp(k0[2], k1[2], u); L.abd = (style === 'pass' ? 0.28 : 0.06) + lerp(k0[3], k1[3], u);
  L.foot = style === 'pass' ? 1.5 : lerp(1.45, 2.4, Math.min(1, stage * 2.2));
  const S = p[sup]; S.a = 0.12 - 0.1 * Math.sin(stage * Math.PI); S.b = 0.3 + 0.25 * Math.sin(stage * Math.PI); S.abd = 0.05;
  const bal = Math.sin(Math.min(1, stage * 1.6) * Math.PI * 0.9);
  p[oA].a = 0.5 * bal; p[oA].abd = 0.35 + 0.65 * bal; p[oA].b = 0.5;
  p[kA].a = -0.45 * bal; p[kA].abd = 0.3 + 0.55 * bal; p[kA].b = 0.4;
  const over = style === 'chip' ? -0.18 : style === 'driven' ? 0.22 : 0.12;
  p.spinePitch = over * Math.sin(stage * Math.PI) + 0.06; p.headPitch = -0.35 * Math.sin(stage * Math.PI);
  p.spineYaw = sideSign * -0.25 * Math.sin(stage * Math.PI * 1.2); p.hipsYaw = sideSign * 0.3 * (0.5 - stage);
  p.hipsY = -0.06 * Math.sin(stage * Math.PI); p.hipsRoll = sideSign * -0.08 * Math.sin(stage * Math.PI);
  return p;
};
// Goalkeeper dive (root roll applied separately). reach 0..1, height: 'high' | 'mid' | 'low'
P.dive = (reach, height = 'mid') => {
  const p = blankPose();
  const up = height === 'high' ? 1 : height === 'low' ? 0.55 : 0.8;
  // arms stretched past the head toward the dive side (body +y after roll points along the dive)
  p.AL.a = lerp(0.6, Math.PI * 0.92 * up + 0.1, reach); p.AR.a = lerp(0.6, Math.PI * 0.92 * up, reach);
  p.AL.abd = lerp(0.5, 0.18, reach); p.AR.abd = lerp(0.5, 0.18, reach); p.AL.b = lerp(1, 0.12, reach); p.AR.b = lerp(1, 0.15, reach); p.fist = 0.15;
  p.L.a = lerp(0.55, 0.1, reach); p.R.a = lerp(0.55, -0.15, reach); p.L.b = lerp(1, 0.25, reach); p.R.b = lerp(1, 0.5, reach);
  p.L.abd = 0.06; p.R.abd = 0.1;
  p.spinePitch = lerp(0.35, 0.05, reach); p.headPitch = -0.2;
  p.hipsY = lerp(-0.2, 0, reach);
  return p;
};
P.slide = (u) => {
  const p = blankPose();
  p.R.a = lerp(0.3, 0.45, u); p.R.b = lerp(0.6, 0.05, u); p.R.foot = 1.8;
  p.L.a = lerp(0.2, 0.15, u); p.L.b = lerp(0.6, 1.75, u); p.L.abd = 0.22;
  p.AL.a = lerp(0, -0.7, u); p.AL.abd = lerp(0.2, 0.5, u); p.AL.b = 0.3;
  p.AR.a = lerp(0, 0.4, u); p.AR.abd = lerp(0.2, 0.7, u); p.AR.b = 0.5;
  p.spinePitch = lerp(0.1, 0.35, u); p.headPitch = -0.4 * u;
  return p;
};
P.poke = (u) => { // standing tackle: reach leg toward ball
  const p = P.jockey(); const s = Math.sin(u * Math.PI);
  p.R.a = lerp(0.25, 1.05, s); p.R.b = lerp(0.8, 0.15, s); p.R.abd = lerp(0.18, 0.35, s); p.hipsYaw = lerp(0.35, -0.1, s); p.spinePitch = 0.3 + 0.1 * s; p.L.b = 1.0;
  return p;
};
P.catchBall = (hY) => { // hands forward at ball height (hY relative to chest -1..1)
  const p = P.keeperReady(); p.hipsY = -0.12;
  p.AL.a = 1.35 + hY * 0.5; p.AR.a = 1.35 + hY * 0.5; p.AL.abd = 0.18; p.AR.abd = 0.18; p.AL.b = 0.55; p.AR.b = 0.55; p.fist = 0.3;
  return p;
};
P.celebrate = (t) => { const p = P.run(t * 9, 0.7); p.AL.a = 2.7; p.AR.a = 2.7; p.AL.abd = 0.5; p.AR.abd = 0.5; p.AL.b = 0.2; p.AR.b = 0.2; p.spinePitch = -0.1; p.headPitch = 0.2; return p; };
P.dejected = () => { const p = P.idle(); p.spinePitch = 0.35; p.headPitch = 0.45; p.AL.a = 0.1; p.AR.a = 0.1; p.AL.abd = 0.25; p.AR.abd = 0.25; p.AL.b = 1.6; p.AR.b = 1.6; return p; };

/* ---------- character ---------- */
const LIMBS = {
  L: ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'], R: ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'],
  AL: ['LeftArm', 'LeftForeArm', 'LeftHand'], AR: ['RightArm', 'RightForeArm', 'RightHand']
};
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

class Character {
  constructor(template, opts = {}) {
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    this.inner = new THREE.Group(); this.root.add(this.inner);
    const model = THREE.SkeletonUtils.clone(template);
    model.rotation.y = Math.PI / 2; // asset faces +z; game forward is +x
    this.inner.add(model); this.model = model;
    this.uniforms = { uMain: { value: new THREE.Color(opts.main ?? 0xffb547) }, uTrim: { value: new THREE.Color(opts.trim ?? 0x13222a) }, uSock: { value: new THREE.Color(opts.sock ?? opts.main ?? 0xffb547) }, uSkin: { value: new THREE.Color(opts.skin ?? 0x8a5a44) } };
    this.bones = {};
    model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        const n = o.material.name;
        if (n === 'Wolf3D_Headwear') o.visible = false;
        else if (n === 'Wolf3D_Beard') o.visible = !!opts.beard;
        else if (n === 'Wolf3D_Outfit_Top') { o.material = kitMaterial(o.material, 'top', this.uniforms); o.material.side = THREE.DoubleSide; }
        else if (n === 'Wolf3D_Outfit_Bottom') o.material = kitMaterial(o.material, 'bottom', this.uniforms);
        else if (n === 'Wolf3D_Body') o.material = kitMaterial(o.material, 'body', this.uniforms);
        else if (n === 'Wolf3D_Skin') o.material = kitMaterial(o.material, 'skin', this.uniforms);
        else if (n === 'Wolf3D_Outfit_Footwear') o.material = kitMaterial(o.material, 'boots', this.uniforms);
      }
    });
    if (opts.gloves) this.addGloves(opts.gloves);
    // rest data in model space
    model.updateMatrixWorld(true);
    const mInv = new Q(); model.getWorldQuaternion(mInv).invert();
    this.rest = {};
    for (const name in this.bones) {
      const b = this.bones[name];
      const wq = new Q(); b.getWorldQuaternion(wq); wq.premultiply(mInv);
      this.rest[name] = { local: b.quaternion.clone(), world: wq, pos: b.position.clone() };
    }
    const wp = (n) => { const v = new V3(); this.bones[n].getWorldPosition(v); return model.worldToLocal(v); };
    for (const k in LIMBS) {
      const ch = LIMBS[k];
      for (let i = 0; i < ch.length - 1; i++) this.rest[ch[i]].dir = wp(ch[i + 1]).sub(wp(ch[i])).normalize();
    }
    this.hipsRestY = this.bones.Hips.position.y;
    this.pose = blankPose();
    this.heading = 0;
  }
  addGloves(color) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    for (const side of ['Left', 'Right']) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), m); g.scale.set(1, 1.5, 0.75); g.position.y = 0.07; g.castShadow = true;
      this.bones[side + 'Hand'].add(g);
    }
  }
  setKit(main, trim, sock) { this.uniforms.uMain.value.set(main); this.uniforms.uTrim.value.set(trim); this.uniforms.uSock.value.set(sock ?? main); }
  // Apply a pose object (body-space parameters)
  apply(p) {
    const B = this.bones, R = this.rest;
    for (const n in B) B[n].quaternion.copy(R[n].local);
    // hips
    const hOff = new Q().setFromEuler(new THREE.Euler(p.hipsPitch, p.hipsYaw, p.hipsRoll, 'YXZ'));
    B.Hips.quaternion.copy(R.Hips.local).premultiply(hOff);
    B.Hips.position.copy(R.Hips.pos); B.Hips.position.y = this.hipsRestY + p.hipsY;
    // spine: distribute (local frames ~ body axes)
    const sp = new Q().setFromEuler(new THREE.Euler(p.spinePitch / 3, p.spineYaw / 3, p.spineRoll / 3, 'YXZ'));
    for (const n of ['Spine', 'Spine1', 'Spine2']) B[n].quaternion.multiply(sp);
    B.Neck.quaternion.multiply(new Q().setFromEuler(new THREE.Euler(p.headPitch * 0.4, p.headYaw * 0.4, 0)));
    B.Head.quaternion.multiply(new Q().setFromEuler(new THREE.Euler(p.headPitch * 0.6, p.headYaw * 0.6, 0)));
    this.model.updateMatrixWorld(true);
    // limbs
    const mq = new Q(); this.model.getWorldQuaternion(mq);
    const setDir = (name, dirBody, frameQ) => {
      const r = R[name]; const b = B[name];
      _v1.copy(r.dir); _v2.copy(dirBody).normalize();
      _q1.setFromUnitVectors(_v1, _v2);            // body-space swing from rest direction
      _q2.copy(frameQ).multiply(_q1).multiply(r.world); // model-space target
      _q2.premultiply(mq);                           // world target
      b.parent.getWorldQuaternion(_q3); _q3.invert();
      b.quaternion.copy(_q3.multiply(_q2));
      b.updateMatrixWorld(true);
    };
    const hipsFrame = hOff;
    const chestFrame = new Q().copy(hOff).multiply(new Q().setFromEuler(new THREE.Euler(p.spinePitch, p.spineYaw, p.spineRoll, 'YXZ')));
    for (const k of ['L', 'R']) {
      const l = p[k], side = k === 'L' ? 1 : -1, ch = LIMBS[k];
      setDir(ch[0], legDir(l.a, l.abd, side, new V3()), hipsFrame);
      setDir(ch[1], legDir(l.a - l.b, l.abd * 0.6, side, new V3()), hipsFrame);
      setDir(ch[2], legDir(l.a - l.b + l.foot, 0, side, new V3()), hipsFrame);
    }
    for (const k of ['AL', 'AR']) {
      const a = p[k], side = k === 'AL' ? 1 : -1, ch = LIMBS[k];
      setDir(ch[0], armDir(a.a, a.abd, side, new V3()), chestFrame);
      setDir(ch[1], armDir(a.a + a.b, a.abd * 0.5, side, new V3()), chestFrame);
    }
    // fingers: curl into a loose fist
    const curl = new Q().setFromAxisAngle(new V3(1, 0, 0), p.fist * 1.1);
    for (const s of ['Left', 'Right']) for (const f of FINGERS) for (let i = 1; i <= 3; i++) { const b = B[s + 'Hand' + f + i]; if (b) b.quaternion.multiply(curl); }
  }
}

window.FootballChar = { Character, P, blankPose, mixPose, copyPose, legDir };
})();
