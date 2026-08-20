import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const WATER_Y = 0
const SUN_DIR = new THREE.Vector3(0.55, 0.2, -0.81).normalize()
const SUN_POS = SUN_DIR.clone().multiplyScalar(340)

// ---------- helpers ----------

function makeRadialTexture(size, stops) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [offset, color] of stops) g.addColorStop(offset, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function islandTopY(d) {
  return -0.5 + 14 * 0.12 * Math.sqrt(Math.max(0, 1 - (d / 14) * (d / 14)))
}

function floorHeight(x, z) {
  let h = -4.6
  h += Math.sin(x * 0.16 + 2.1) * Math.cos(z * 0.13 - 1.2) * 0.7
  h += Math.sin(x * 0.34 + z * 0.27) * 0.35
  h += Math.cos(x * 0.53 - z * 0.47) * 0.18
  const d = Math.hypot(x, z)
  h += Math.max(0, 1 - Math.abs(d - 27) / 9) * 1.4
  h += Math.max(0, 1 - d / 17) * 3.4
  return h
}

// ---------- water / sky shaders ----------

const WATER_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  vec3 pos = position;
  float h = 0.0;
  float dhx = 0.0;
  float dhz = 0.0;
  vec2 d1 = vec2(0.98, 0.20); float f1 = 0.18; float s1 = 0.9; float a1 = 0.22;
  vec2 d2 = vec2(0.30, 0.95); float f2 = 0.27; float s2 = 1.3; float a2 = 0.14;
  vec2 d3 = vec2(0.85, -0.52); float f3 = 0.42; float s3 = 1.7; float a3 = 0.08;
  vec2 d4 = vec2(-0.6, 0.8); float f4 = 1.05; float s4 = 2.6; float a4 = 0.03;
  {
    float p = dot(pos.xz, d1) * f1 + uTime * s1;
    h += a1 * sin(p); dhx += a1 * f1 * d1.x * cos(p); dhz += a1 * f1 * d1.y * cos(p);
  }
  {
    float p = dot(pos.xz, d2) * f2 + uTime * s2;
    h += a2 * sin(p); dhx += a2 * f2 * d2.x * cos(p); dhz += a2 * f2 * d2.y * cos(p);
  }
  {
    float p = dot(pos.xz, d3) * f3 + uTime * s3;
    h += a3 * sin(p); dhx += a3 * f3 * d3.x * cos(p); dhz += a3 * f3 * d3.y * cos(p);
  }
  {
    float p = dot(pos.xz, d4) * f4 + uTime * s4;
    h += a4 * sin(p); dhx += a4 * f4 * d4.x * cos(p); dhz += a4 * f4 * d4.y * cos(p);
  }
  pos.y += h;
  vNormalW = normalize(vec3(-dhx, 1.0, -dhz));
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const WATER_FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 N = normalize(vNormalW);
  float fres = pow(1.0 - abs(dot(N, V)), 3.0);
  float pattern = sin(vWorldPos.x * 0.35 + vWorldPos.z * 0.28) * sin(vWorldPos.z * 0.4 + vWorldPos.x * 0.15);
  vec3 col = mix(uDeep, uShallow, 0.35 + 0.2 * pattern);
  col = mix(col, uSunColor * 0.55, fres * 0.55);
  vec3 R = reflect(-normalize(uSunDir), N);
  float spec = pow(max(dot(R, V), 0.0), 220.0) * 2.6;
  float glint = pow(max(dot(R, V), 0.0), 24.0) * 0.25;
  col += uSunColor * (spec + glint);
  float edge = 1.0 - smoothstep(58.0, 85.0, length(vWorldPos.xz));
  gl_FragColor = vec4(col, (0.55 + fres * 0.2) * edge);
}
`

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uDeep;
varying vec3 vDir;
void main() {
  float t = smoothstep(-0.04, 0.55, vDir.y);
  vec3 col = mix(uHorizon, uZenith, t);
  vec3 under = mix(uDeep, uHorizon, 0.4);
  col = mix(under, col, smoothstep(-0.15, 0.02, vDir.y));
  float s = max(dot(vDir, normalize(uSunDir)), 0.0);
  col += vec3(1.0, 0.72, 0.42) * (pow(s, 64.0) * 1.4 + pow(s, 8.0) * 0.3);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------- geometry builders ----------

function makePalmFrondsGeometry() {
  const parts = []
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.PlaneGeometry(1.8, 0.4, 6, 1)
    const pos = frond.attributes.position
    for (let j = 0; j < pos.count; j++) {
      const u = Math.abs(pos.getX(j)) / 0.9
      pos.setY(j, pos.getY(j) - u * u * 0.7)
    }
    frond.translate(0.85, 0, 0)
    frond.rotateX(Math.PI / 2)
    frond.rotateY((i / 6) * Math.PI * 2 + 0.4)
    parts.push(frond)
  }
  return BufferGeometryUtils.mergeGeometries(parts)
}

function makeFishGeometry() {
  const body = new THREE.ConeGeometry(0.17, 0.52, 6)
  body.rotateX(Math.PI / 2)
  const tail = new THREE.ConeGeometry(0.13, 0.24, 4)
  tail.rotateX(-Math.PI / 2)
  tail.translate(0, 0, -0.36)
  return BufferGeometryUtils.mergeGeometries([body, tail])
}

function makeKelpGeometry() {
  const parts = []
  const stem = new THREE.CylinderGeometry(0.025, 0.05, 1, 5)
  stem.translate(0, 0.5, 0)
  parts.push(stem)
  for (let i = 0; i < 4; i++) {
    const frond = new THREE.PlaneGeometry(0.2 + (3 - i) * 0.05, 0.5)
    frond.rotateY((i / 4) * Math.PI * 2 + 0.5)
    frond.translate(0, 0.28 + i * 0.2, 0.06)
    parts.push(frond)
  }
  return BufferGeometryUtils.mergeGeometries(parts)
}

function makeCoralGeometry(type, dummyRand) {
  const parts = []
  if (type === 0) {
    for (let b = 0; b < 5; b++) {
      const h = 0.5 + dummyRand() * 0.6
      const br = new THREE.CylinderGeometry(0.035, 0.08, h, 5)
      const a = (b / 5) * Math.PI * 2 + dummyRand() * 0.4
      const dir = new THREE.Vector3(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45).normalize()
      br.translate(0, h / 2, 0)
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      br.applyQuaternion(q)
      br.translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05)
      parts.push(br)
      const tip = new THREE.SphereGeometry(0.06, 5, 4)
      tip.translate(dir.x * h * 0.5 + Math.cos(a) * 0.05, dir.y * h * 0.5, dir.z * h * 0.5 + Math.sin(a) * 0.05)
      parts.push(tip)
    }
  } else if (type === 1) {
    const blob = new THREE.IcosahedronGeometry(0.55, 1)
    const pos = blob.attributes.position
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j)
      const s = 1 + 0.18 * Math.sin(x * 5 + y * 3) * Math.cos(z * 4.3)
      pos.setXYZ(j, x * s, y * s * 0.8, z * s)
    }
    blob.translate(0, 0.4, 0)
    parts.push(blob)
  } else if (type === 2) {
    for (let t = 0; t < 6; t++) {
      const h = 0.45 + dummyRand() * 0.5
      const tube = new THREE.CylinderGeometry(0.07, 0.09, h, 7)
      tube.translate((dummyRand() - 0.5) * 0.5, h / 2, (dummyRand() - 0.5) * 0.5)
      parts.push(tube)
    }
  } else {
    for (let f = 0; f < 3; f++) {
      const fan = new THREE.PlaneGeometry(0.7, 0.5, 3, 3)
      fan.rotateX(-0.5 - f * 0.25)
      fan.rotateY(f * 0.5 - 0.5)
      fan.translate(0.3, 0.45, 0)
      parts.push(fan)
    }
  }
  return BufferGeometryUtils.mergeGeometries(parts, false)
}

// ---------- weathered lighthouse textures ----------

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function toTexture(canvas, sx = 1) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(sx, 1)
  t.anisotropy = 4
  return t
}

function makeTowerCanvas() {
  const W = 512, H = 1024
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ddd5c0'
  ctx.fillRect(0, 0, W, H)
  const wrap = (x, fn) => {
    for (const ox of [-W, 0, W]) {
      ctx.save()
      ctx.translate(ox, 0)
      fn()
      ctx.restore()
    }
  }
  // faded sun / grime patches
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * W
    const y = Math.random() * H
    const r = 70 + Math.random() * 170
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(255,252,238,0.12)' : 'rgba(115,112,92,0.12)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // horizontal formwork lines
  for (let y = 32; y < H; y += 64) {
    ctx.fillStyle = 'rgba(92,86,68,0.20)'
    ctx.fillRect(0, y, W, 2)
    ctx.fillStyle = 'rgba(255,252,240,0.12)'
    ctx.fillRect(0, y + 2, W, 1)
  }
  // rain / rust streaks
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * W
    const y0 = Math.random() * 380
    const len = 140 + Math.random() * 700
    const w = 1 + Math.random() * 3
    const a = 0.04 + Math.random() * 0.10
    const rust = Math.random() < 0.24
    const top = rust ? `rgba(138,84,46,${Math.min(1, a * 1.8)})` : `rgba(90,94,80,${a})`
    wrap(x, () => {
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len)
      g.addColorStop(0, top)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x, y0, w, len)
    })
  }
  // grime build-up at the bottom
  const gB = ctx.createLinearGradient(0, H, 0, H - 260)
  gB.addColorStop(0, 'rgba(66,68,56,0.42)')
  gB.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gB
  ctx.fillRect(0, H - 260, W, 260)
  // peeling paint patches
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * W
    const y = 320 + Math.random() * 704
    const w = 3 + Math.random() * 15
    const h = 3 + Math.random() * 11
    const dark = Math.random() < 0.55
    const col = dark ? `rgba(110,94,72,${0.25 + Math.random() * 0.3})` : `rgba(240,234,216,${0.3 + Math.random() * 0.35})`
    wrap(x, () => {
      ctx.fillStyle = col
      ctx.fillRect(x, y, w, h)
    })
  }
  // grain
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * W
    const y = Math.random() * H
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '58,58,48' : '255,255,245'},${0.02 + Math.random() * 0.05})`
    ctx.fillRect(x, y, 1, 1)
  }
  return c
}

function makeBandCanvas() {
  const W = 512, H = 128
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#9c3125'
  ctx.fillRect(0, 0, W, H)
  const wrap = (x, fn) => {
    for (const ox of [-W, 0, W]) {
      ctx.save()
      ctx.translate(ox, 0)
      fn()
      ctx.restore()
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * W
    const y = Math.random() * H
    const r = 40 + Math.random() * 90
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(150,52,38,0.25)' : 'rgba(70,22,14,0.25)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * W
    const y0 = Math.random() * 40
    const len = 30 + Math.random() * 90
    const w = 1 + Math.random() * 2.5
    const dark = Math.random() < 0.6
    const a = 0.05 + Math.random() * 0.13
    wrap(x, () => {
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len)
      g.addColorStop(0, dark ? `rgba(52,20,12,${a})` : `rgba(226,190,150,${a * 0.7})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x, y0, w, len)
    })
  }
  // chips showing the undercoat
  for (let i = 0; i < 64; i++) {
    const x = Math.random() * W
    const y = Math.random() * H
    const w = 2 + Math.random() * 7
    const h = 2 + Math.random() * 6
    wrap(x, () => {
      ctx.fillStyle = `rgba(228,220,200,${0.35 + Math.random() * 0.5})`
      ctx.fillRect(x, y, w, h)
    })
  }
  // dark edges
  ctx.fillStyle = 'rgba(38,16,10,0.5)'
  ctx.fillRect(0, 0, W, 3)
  ctx.fillRect(0, H - 3, W, 3)
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * W
    const y = Math.random() * H
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '40,18,12' : '255,235,210'},${0.03 + Math.random() * 0.05})`
    ctx.fillRect(x, y, 1, 1)
  }
  return c
}

function makeStoneCanvas() {
  const S = 256
  const c = makeCanvas(S, S)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#4e4c44'
  ctx.fillRect(0, 0, S, S)
  const rows = [
    { y: 0, h: 64, w: [58, 72, 44, 82] },
    { y: 64, h: 60, w: [90, 48, 62, 56] },
    { y: 124, h: 68, w: [40, 88, 60, 68] },
    { y: 192, h: 64, w: [76, 52, 70, 58] }
  ]
  rows.forEach((row, ri) => {
    let x = 0
    row.w.forEach((bw, bi) => {
      const l = 98 + ((ri * 37 + bi * 53) % 42)
      ctx.fillStyle = `rgb(${l},${l - 3},${l - 10})`
      ctx.fillRect(x + 2, row.y + 2, bw - 4, row.h - 4)
      for (let i = 0; i < 5; i++) {
        const mx = x + 4 + ((bi * 71 + ri * 13 + i * 29) % Math.max(1, bw - 12))
        const my = row.y + 4 + ((bi * 41 + ri * 17 + i * 53) % Math.max(1, row.h - 12))
        ctx.fillStyle = `rgba(30,30,26,${0.08 + (i % 3) * 0.04})`
        ctx.fillRect(mx, my, 5 + (i % 4) * 3, 4 + (i % 3) * 3)
      }
      ctx.fillStyle = 'rgba(255,255,240,0.08)'
      ctx.fillRect(x + 2, row.y + 2, bw - 4, 2)
      x += bw
    })
  })
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '25,25,20' : '255,255,240'},${0.02 + Math.random() * 0.04})`
    ctx.fillRect(x, y, 1, 1)
  }
  return c
}

function makeWoodCanvas(base = '#6d5c45') {
  const S = 256
  const c = makeCanvas(S, S)
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  for (let py = 0; py < S; py += 32) {
    const l = Math.round((Math.random() - 0.5) * 20)
    ctx.fillStyle = `rgba(${105 + l},${88 + l},${66 + l},0.35)`
    ctx.fillRect(0, py, S, 32)
    ctx.fillStyle = 'rgba(28,22,14,0.55)'
    ctx.fillRect(0, py, S, 2)
    ctx.fillRect((py * 73) % S, py, 2, 32)
  }
  for (let i = 0; i < 55; i++) {
    const x = Math.random() * S
    ctx.strokeStyle = `rgba(44,35,23,${0.05 + Math.random() * 0.09})`
    ctx.beginPath()
    ctx.moveTo(x, 0)
    for (let y = 16; y <= S; y += 16) ctx.lineTo(x + Math.sin(y * 0.09 + i) * 3, y)
    ctx.stroke()
  }
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = 14 + Math.random() * 44
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(168,170,160,0.13)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = 'rgba(32,29,24,0.8)'
    ctx.beginPath()
    ctx.arc(Math.random() * S, Math.random() * S, 1.3, 0, Math.PI * 2)
    ctx.fill()
  }
  return c
}

function makeRoofCanvas() {
  const S = 256
  const c = makeCanvas(S, S)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#6d281d'
  ctx.fillRect(0, 0, S, S)
  const wrap = (x, fn) => {
    for (const ox of [-S, 0, S]) {
      ctx.save()
      ctx.translate(ox, 0)
      fn()
      ctx.restore()
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const r = 30 + Math.random() * 70
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(120,44,30,0.3)' : 'rgba(40,14,8,0.3)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S
    const w = 1 + Math.random() * 3
    const a = 0.06 + Math.random() * 0.13
    wrap(x, () => {
      const g = ctx.createLinearGradient(0, 0, 0, S)
      g.addColorStop(0, `rgba(28,10,6,${a})`)
      g.addColorStop(0.75, `rgba(28,10,6,${a * 0.6})`)
      g.addColorStop(1, `rgba(70,95,58,${a * 0.9})`)
      ctx.fillStyle = g
      ctx.fillRect(x, 0, w, S)
    })
  }
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '26,10,6' : '255,225,200'},${0.02 + Math.random() * 0.04})`
    ctx.fillRect(x, y, 1, 1)
  }
  return c
}

// ---------- detailed lighthouse ----------

const LH_ANCHOR_X = 2
const LH_ANCHOR_Z = -2

function makeLighthouse(texAssets) {
  const g = new THREE.Group()
  const AX = LH_ANCHOR_X
  const AZ = LH_ANCHOR_Z
  g.position.set(AX, islandTopY(Math.hypot(AX, AZ)) - 0.04, AZ)
  const gy = (wx, wz) => islandTopY(Math.hypot(wx, wz)) - g.position.y

  // weathered procedural textures
  const towerTex = toTexture(makeTowerCanvas())
  const bandTex = toTexture(makeBandCanvas())
  const stoneTex = toTexture(makeStoneCanvas(), 3)
  const woodTex = toTexture(makeWoodCanvas())
  const fenceTex = toTexture(makeWoodCanvas('#8a8272'))
  const roofTex = toTexture(makeRoofCanvas())
  texAssets.push(towerTex, bandTex, stoneTex, woodTex, fenceTex, roofTex)

  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 0.4, roughness: 0.95 })
  const paintMat = new THREE.MeshStandardMaterial({ map: towerTex, bumpMap: towerTex, bumpScale: 0.3, roughness: 0.72 })
  const bandMat = new THREE.MeshStandardMaterial({ map: bandTex, bumpMap: bandTex, bumpScale: 0.3, roughness: 0.7 })
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, bumpMap: roofTex, bumpScale: 0.35, roughness: 0.78 })
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, bumpMap: woodTex, bumpScale: 0.35, roughness: 0.85 })
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, bumpMap: fenceTex, bumpScale: 0.35, roughness: 0.9 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x333a42, roughness: 0.55, metalness: 0.4 })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa8c8d8, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
  const winGlassMat = new THREE.MeshStandardMaterial({ color: 0x16242e, roughness: 0.2, metalness: 0.55 })

  const add = (mesh, cast = true) => {
    mesh.castShadow = cast
    mesh.receiveShadow = true
    g.add(mesh)
    return mesh
  }

  // stone terrace + rim
  const terrace = add(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.55, 0.5, 26), stoneMat))
  terrace.position.y = 0.25
  const trim = add(new THREE.Mesh(new THREE.CylinderGeometry(2.36, 2.4, 0.14, 26), stoneMat))
  trim.position.y = 0.57
  const ring = add(new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.04, 0.34, 18), stoneMat))
  ring.position.y = 0.72

  // tower (jittered profile for a hand-built look)
  const TOWER_Y0 = 0.89
  const TOWER_H = 3.81
  const towerR = (y) => 0.78 - 0.26 * ((y - TOWER_Y0) / TOWER_H)
  const towerGeo = new THREE.CylinderGeometry(0.52, 0.78, TOWER_H, 30, 14)
  {
    const p = towerGeo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      const z = p.getZ(i)
      const a = Math.atan2(z, x)
      const s = 1 + 0.014 * Math.sin(a * 3 + 1.7) + 0.01 * Math.sin(a * 7 - 0.6) + 0.007 * Math.sin(y * 2.3 + a * 5 + 0.8)
      p.setX(i, x * s)
      p.setZ(i, z * s)
    }
    towerGeo.computeVertexNormals()
  }
  const tower = add(new THREE.Mesh(towerGeo, paintMat))
  tower.position.y = TOWER_Y0 + TOWER_H / 2

  const band = (y0, y1, off) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(towerR(y1) + off, towerR(y0) + off, y1 - y0, 30), bandMat)
    m.position.y = (y0 + y1) / 2
    add(m)
  }
  band(1.95, 2.55, 0.03)
  band(3.95, 4.45, 0.03)
  band(3.3, 3.42, 0.025)

  // cornice, gallery deck, corbels, railing
  const cornice = add(new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.74, 0.16, 20), paintMat))
  cornice.position.y = 4.78
  const deck = add(new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.1, 0.16, 24), darkMat))
  deck.position.y = 4.94
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2 + Math.PI / 8
    const cg = new THREE.Group()
    cg.position.set(Math.sin(th) * 0.5, 4.72, Math.cos(th) * 0.5)
    cg.rotation.y = th
    const cb = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.52), darkMat)
    cb.position.z = 0.26
    cb.rotation.x = -0.5
    cb.castShadow = true
    cg.add(cb)
    g.add(cg)
  }
  for (let i = 0; i < 14; i++) {
    const th = (i / 14) * Math.PI * 2
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.5, 6), darkMat)
    post.position.set(Math.sin(th) * 0.95, 5.27, Math.cos(th) * 0.95)
    add(post)
  }
  const railTop = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.018, 6, 28), darkMat)
  railTop.rotation.x = Math.PI / 2
  railTop.position.y = 5.5
  add(railTop)
  const railMid = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.013, 6, 28), darkMat)
  railMid.rotation.x = Math.PI / 2
  railMid.position.y = 5.26
  add(railMid)

  // lantern room
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.64, 12, 1, true), glassMat)
  glass.position.y = 5.34
  g.add(glass)
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.64, 0.06), darkMat)
    mull.position.set(Math.sin(th) * 0.45, 5.34, Math.cos(th) * 0.45)
    mull.rotation.y = th
    add(mull)
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc266, emissiveIntensity: 2.4, roughness: 0.3 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), lampMat)
  lamp.position.y = 5.34
  g.add(lamp)
  const topRing = add(new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.47, 0.1, 18), darkMat))
  topRing.position.y = 5.71

  // roof + finial
  const roof = add(new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.6, 18), roofMat))
  roof.position.y = 6.06
  const finialBall = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), darkMat), false)
  finialBall.position.y = 6.38
  const finialRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 6, 12), darkMat)
  finialRing.rotation.x = Math.PI / 2
  finialRing.position.y = 6.3
  add(finialRing)
  const spire = add(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.32, 6), darkMat), false)
  spire.position.y = 6.52

  // beam + lamp light
  const beamGroup = new THREE.Group()
  beamGroup.position.y = 5.34
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe8b0, transparent: true, opacity: 0.13,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  })
  const beamGeo = new THREE.CylinderGeometry(1.9, 0.04, 15, 10, 1, true)
  const beam1 = new THREE.Mesh(beamGeo, beamMat)
  beam1.rotation.x = Math.PI / 2
  beam1.position.z = 7.5
  beamGroup.add(beam1)
  const beam2 = new THREE.Mesh(beamGeo, beamMat)
  beam2.rotation.x = -Math.PI / 2
  beam2.position.z = -7.5
  beamGroup.add(beam2)
  g.add(beamGroup)
  const lampLight = new THREE.PointLight(0xffd9a0, 120, 70, 2)
  lampLight.position.y = 5.34
  g.add(lampLight)

  // door (facing +z) with arch, steps
  const dz = towerR(1.61) + 0.01
  const doorFrame = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.2, 0.1), paintMat))
  doorFrame.position.set(0, 1.61, dz)
  const arch = add(new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.05, 6, 14, Math.PI), paintMat), false)
  arch.position.set(0, 2.05, dz)
  const door = add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.0, 0.06), woodMat))
  door.position.set(0, 1.55, dz + 0.045)
  const doorWin = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 10), winGlassMat)
  doorWin.rotation.x = Math.PI / 2
  doorWin.position.set(0, 1.75, dz + 0.08)
  g.add(doorWin)
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), darkMat)
  handle.position.set(0.15, 1.45, dz + 0.08)
  g.add(handle)
  const step1 = add(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.18, 0.52), stoneMat))
  step1.position.set(0, 0.59, 1.32)
  const step2 = add(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.16, 0.4), stoneMat))
  step2.position.set(0, 0.76, 1.2)
  const step3 = add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.3), stoneMat))
  step3.position.set(0, 0.93, 1.1)

  // windows
  const addWindow = (th, y, w = 0.24, h = 0.34) => {
    const r = towerR(y)
    const wg = new THREE.Group()
    wg.rotation.y = th
    const trimW = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), paintMat)
    trimW.position.set(0, y, r + 0.02)
    trimW.castShadow = true
    wg.add(trimW)
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.055), winGlassMat)
    pane.position.set(0, y, r + 0.025)
    wg.add(pane)
    g.add(wg)
  }
  addWindow(Math.PI / 2, 2.7)
  addWindow(-Math.PI / 2, 2.2)
  addWindow(Math.PI * 0.8, 3.6, 0.2, 0.28)

  // keeper's shed
  const shed = new THREE.Group()
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 1.0), woodMat)
    body.position.y = 0.425
    body.castShadow = true
    body.receiveShadow = true
    shed.add(body)
    const shape = new THREE.Shape([
      new THREE.Vector2(-0.68, 0),
      new THREE.Vector2(0.68, 0),
      new THREE.Vector2(0, 0.46)
    ])
    const gableGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.04, bevelEnabled: false })
    gableGeo.translate(0, 0, -0.52)
    const gable = new THREE.Mesh(gableGeo, woodMat)
    gable.position.y = 0.85
    gable.castShadow = true
    shed.add(gable)
    for (const s of [1, -1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 1.14), roofMat)
      panel.position.set(s * 0.34, 1.08, 0)
      panel.rotation.z = s === 1 ? Math.PI - 0.592 : 0.592
      panel.castShadow = true
      shed.add(panel)
    }
    const sdoor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.56, 0.05), woodMat)
    sdoor.position.set(0.32, 0.28, 0.51)
    shed.add(sdoor)
    const swin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.05), winGlassMat)
    swin.position.set(-0.3, 0.45, 0.51)
    shed.add(swin)
    const swinH = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.06), paintMat)
    swinH.position.set(-0.3, 0.45, 0.515)
    shed.add(swinH)
    const swinV = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.26, 0.06), paintMat)
    swinV.position.set(-0.3, 0.45, 0.515)
    shed.add(swinV)
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), stoneMat)
    chimney.position.set(0.38, 1.15, -0.25)
    chimney.castShadow = true
    shed.add(chimney)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.14, 1.12), stoneMat)
    plinth.position.y = 0.07
    plinth.castShadow = true
    plinth.receiveShadow = true
    shed.add(plinth)
  }
  shed.position.set(3.4, gy(AX + 3.4, AZ + 2.9) - 0.05, 2.9)
  shed.rotation.y = -2.14
  g.add(shed)

  // barrel + crate
  const barrel = new THREE.Group()
  {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.34, 10), woodMat)
    b.position.y = 0.17
    b.castShadow = true
    barrel.add(b)
    for (const yy of [0.08, 0.26]) {
      const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.012, 5, 12), darkMat)
      ringB.rotation.x = Math.PI / 2
      ringB.position.y = yy
      barrel.add(ringB)
    }
  }
  barrel.position.set(3.9, gy(AX + 3.9, AZ + 1.6) - 0.02, 1.6)
  g.add(barrel)
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), woodMat)
  crate.position.set(2.4, gy(AX + 2.4, AZ + 3.4) + 0.15, 3.4)
  crate.rotation.y = 0.7
  crate.castShadow = true
  crate.receiveShadow = true
  g.add(crate)

  // fence leading away from the terrace
  {
    const dir = new THREE.Vector2(AX, AZ).normalize()
    const posts = []
    for (let i = 0; i < 4; i++) {
      const s = 3.1 + i * 0.95
      const wx = AX + dir.x * s
      const wz = AZ + dir.y * s
      const y = gy(wx, wz)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.6, 6), fenceMat)
      post.position.set(wx - AX, y + 0.3, wz - AZ)
      post.castShadow = true
      g.add(post)
      posts.push(new THREE.Vector3(wx - AX, y, wz - AZ))
    }
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < posts.length - 1; i++) {
      for (const hh of [0.22, 0.44]) {
        const a = posts[i]
        const b = posts[i + 1]
        const len = a.distanceTo(b) + 0.06
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, len, 5), fenceMat)
        const mid = a.clone().add(b).multiplyScalar(0.5)
        rail.position.set(mid.x, mid.y + hh, mid.z)
        rail.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize())
        g.add(rail)
      }
    }
  }

  // rocks hugging the terrace
  {
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8074, roughness: 0.9, flatShading: true })
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.4
      const s = 2.6 + (i % 3) * 0.15
      const wx = AX + Math.cos(a) * s
      const wz = AZ + Math.sin(a) * s
      const r = new THREE.Mesh(rockGeo, rockMat)
      r.position.set(wx - AX, gy(wx, wz) + 0.08, wz - AZ)
      r.rotation.set(Math.random(), Math.random() * Math.PI, Math.random())
      r.scale.set(0.5 + Math.random() * 0.5, 0.35 + Math.random() * 0.3, 0.5 + Math.random() * 0.5)
      r.castShadow = true
      r.receiveShadow = true
      g.add(r)
    }
  }

  return { group: g, beamGroup, lampLight }
}

// ---------- animals ----------

const smooth01 = (x) => {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

function makeTurtle() {
  const g = new THREE.Group()
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x3f7a55, roughness: 0.72, flatShading: true })
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x6a9a6a, roughness: 0.8 })
  const plastronMat = new THREE.MeshStandardMaterial({ color: 0xd8cfae, roughness: 0.7 })

  // shell: dense polygons + scute relief displacement
  const shellGeo = new THREE.SphereGeometry(0.9, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2)
  {
    const sp = shellGeo.attributes.position
    const ringB = [0.27, 0.57, 0.85]
    const ringC = [0, 0.42, 0.71, 0.95]
    for (let i = 0; i < sp.count; i++) {
      let x = sp.getX(i)
      let y = sp.getY(i)
      let z = sp.getZ(i)
      const len = Math.hypot(x, y, z)
      x /= len
      y /= len
      z /= len
      const r = Math.hypot(x, z)
      const a = Math.atan2(z, x)
      const frac = (((a / (Math.PI / 3)) + 0.5) % 1 + 1) % 1
      const angLine = 1 - smooth01(Math.min(frac, 1 - frac) / 0.13)
      const ringIdx = r < ringB[0] ? 0 : r < ringB[1] ? 1 : r < ringB[2] ? 2 : 3
      let dome = 1 - ((r - ringC[ringIdx]) / 0.34) * ((r - ringC[ringIdx]) / 0.34)
      dome = Math.max(0, dome)
      let rLine = 0
      for (const b of ringB) rLine += 1 - smooth01(Math.abs(r - b) / 0.07)
      const comb = dome * (1 - 0.8 * angLine) + rLine * 0.45
      const bump = 0.085 * comb + 0.02 * Math.sin(x * 9 + 1.3) * Math.cos(z * 8 - 0.4)
      sp.setXYZ(i, x * (1 + bump), y * (1 + bump * 1.2), z * (1 + bump))
    }
    shellGeo.computeVertexNormals()
    shellGeo.scale(1.15, 0.5, 1.35)
  }
  const shell = new THREE.Mesh(shellGeo, shellMat)
  g.add(shell)

  // plastron (belly plate)
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.5, 12), plastronMat)
  belly.scale.set(1.08, 0.34, 1.28)
  g.add(belly)

  // head (joint pivot)
  const headPivot = new THREE.Group()
  headPivot.position.set(0, 0.05, 1.05)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skinMat)
  head.scale.set(1.0, 0.85, 1.25)
  head.position.set(0, 0.02, 0.15)
  headPivot.add(head)
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), skinMat)
  snout.scale.set(1.0, 0.75, 1.0)
  snout.position.set(0, -0.02, 0.42)
  headPivot.add(snout)
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.7 })
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), darkMat)
  nose.position.set(0, 0.03, 0.57)
  headPivot.add(nose)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4 })
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eyeMat)
    eye.position.set(side * 0.13, 0.1, 0.28)
    headPivot.add(eye)
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.24), darkMat)
  mouth.position.set(0, -0.06, 0.4)
  headPivot.add(mouth)
  g.add(headPivot)

  // flippers (paddle shapes, front large / rear small)
  const flippers = []
  const mkPaddle = (w, h, d, len) => {
    const geo = new THREE.BoxGeometry(len, h, d)
    geo.translate(len / 2, 0, 0)
    return geo
  }
  const frontGeo = mkPaddle(0.9, 0.07, 0.42, 0.9)
  const rearGeo = mkPaddle(0.62, 0.055, 0.3, 0.62)
  for (const [sx, sz] of [[-1, 1], [1, 1]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx * 0.72, -0.12, sz * 0.34)
    pivot.rotation.y = sx > 0 ? 0 : Math.PI
    pivot.add(new THREE.Mesh(frontGeo, skinMat))
    g.add(pivot)
    flippers.push({ pivot, front: true, side: sx })
  }
  for (const [sx, sz] of [[-1, -1], [1, -1]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx * 0.68, -0.12, sz * 0.32)
    pivot.rotation.y = sx > 0 ? 0 : Math.PI
    pivot.add(new THREE.Mesh(rearGeo, skinMat))
    g.add(pivot)
    flippers.push({ pivot, front: false, side: sx })
  }

  // tail (joint pivot)
  const tailPivot = new THREE.Group()
  tailPivot.position.set(0, -0.05, -1.25)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 6), skinMat)
  tail.rotation.x = -Math.PI / 2
  tail.position.z = -0.2
  tailPivot.add(tail)
  g.add(tailPivot)

  g.scale.setScalar(1.2)
  return { group: g, flippers, head: headPivot, tailPivot }
}

function makeGull() {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0xf5f6f8, roughness: 0.7, side: THREE.DoubleSide })
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 5), mat)
  body.rotateX(Math.PI / 2)
  g.add(body)
  const wingGeo = new THREE.PlaneGeometry(0.9, 0.28)
  wingGeo.rotateX(Math.PI / 2)
  wingGeo.translate(0.48, 0, 0)
  const pivotL = new THREE.Group()
  pivotL.add(new THREE.Mesh(wingGeo, mat))
  const pivotR = new THREE.Group()
  pivotR.rotation.y = Math.PI
  pivotR.add(new THREE.Mesh(wingGeo.clone(), mat))
  g.add(pivotL, pivotR)
  return { group: g, pivotL, pivotR }
}

// ---------- scene ----------

export function useOceanScene(containerRef) {
  let renderer, scene, camera, orbit, frame
  let disposed = false
  const autoRotate = ref(true)
  const texAssets = []

  // state
  let fishSchools = []
  let turtle, turtleAngle = 0
  let jellies = []
  let gulls = []
  let kelpWindShader = null
  let bubbleData = null
  let beamGroup = null
  let lampLight = null
  let waterMat = null

  function toggleAutoRotate() {
    autoRotate.value = !autoRotate.value
  }

  function init() {
    if (!containerRef.value) return
    const container = containerRef.value
    const width = container.clientWidth
    const height = container.clientHeight

    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x9ac8d8, 70, 260)
    camera = new THREE.PerspectiveCamera(55, width / height, 0.3, 700)
    camera.position.set(12, 6.5, 34)

    orbit = new OrbitControls(camera, renderer.domElement)
    orbit.target.set(0, 1, 0)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.05
    orbit.minDistance = 6
    orbit.maxDistance = 130
    orbit.autoRotateSpeed = 0.25

    // ---- sky ----
    const sunTex = makeRadialTexture(128, [
      [0, 'rgba(255,250,235,1)'],
      [0.4, 'rgba(255,214,150,0.55)'],
      [1, 'rgba(255,190,120,0)']
    ])
    texAssets.push(sunTex)
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(380, 32, 20),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: {
          uSunDir: { value: SUN_DIR },
          uHorizon: { value: new THREE.Color(0xffb37a) },
          uZenith: { value: new THREE.Color(0x28518f) },
          uDeep: { value: new THREE.Color(0x0a2c3e) }
        },
        side: THREE.BackSide,
        depthWrite: false
      })
    )
    scene.add(sky)
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }))
    sunSprite.position.copy(SUN_POS)
    sunSprite.scale.setScalar(46)
    scene.add(sunSprite)

    // ---- lights ----
    scene.add(new THREE.AmbientLight(0x4a7a9a, 0.85))
    scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x0a3444, 0.5))
    const sunLight = new THREE.DirectionalLight(0xffd9a8, 2.3)
    sunLight.position.set(90, 34, -120)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.set(2048, 2048)
    sunLight.shadow.camera.left = -45
    sunLight.shadow.camera.right = 45
    sunLight.shadow.camera.top = 45
    sunLight.shadow.camera.bottom = -45
    sunLight.shadow.camera.near = 1
    sunLight.shadow.camera.far = 320
    scene.add(sunLight)

    // ---- sea floor ----
    {
      const geo = new THREE.PlaneGeometry(170, 170, 64, 64)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position
      const colors = new Float32Array(pos.count * 3)
      const sandA = new THREE.Color(0xd8c08a)
      const sandB = new THREE.Color(0xa8906a)
      const sandC = new THREE.Color(0x7a6a52)
      const c = new THREE.Color()
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const z = pos.getZ(i)
        const h = floorHeight(x, z)
        pos.setY(i, h)
        const t = THREE.MathUtils.clamp((h + 6) / 3, 0, 1)
        c.copy(sandC).lerp(sandA, t)
        c.lerp(sandB, 0.35 * Math.max(0, Math.sin(x * 0.9 + z * 0.7)))
        colors[i * 3] = c.r
        colors[i * 3 + 1] = c.g
        colors[i * 3 + 2] = c.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      geo.computeVertexNormals()
      const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.95, metalness: 0
      }))
      floor.receiveShadow = true
      scene.add(floor)
    }

    // ---- water surface ----
    waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x0d4a5c) },
        uShallow: { value: new THREE.Color(0x1d7a86) },
        uSunDir: { value: SUN_DIR },
        uSunColor: { value: new THREE.Color(0xffd9a8) }
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    {
      const geo = new THREE.PlaneGeometry(170, 170, 72, 72)
      geo.rotateX(-Math.PI / 2)
      const water = new THREE.Mesh(geo, waterMat)
      water.position.y = WATER_Y
      scene.add(water)
    }

    // ---- island ----
    {
      const geo = new THREE.SphereGeometry(14, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
      geo.scale(1, 0.12, 1)
      const island = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 0.95 }))
      island.position.y = -0.5
      island.castShadow = true
      island.receiveShadow = true
      scene.add(island)

      // palm trees
      const palmGeo = makePalmFrondsGeometry()
      const palmMat = new THREE.MeshStandardMaterial({ color: 0x2f8a4a, roughness: 0.8, side: THREE.DoubleSide })
      const palms = [
        [4.5, 0], [6.5, 1.2], [8, -2.5], [5.5, -4], [-6, 3], [-4, -5.5]
      ]
      for (const [dx, dz] of palms) {
        const d = Math.hypot(dx, dz)
        const palm = new THREE.Group()
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.17, 3.2, 6),
          new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 })
        )
        trunk.position.y = 1.6
        trunk.rotation.z = (Math.random() - 0.5) * 0.15
        palm.add(trunk)
        const crown = new THREE.Mesh(palmGeo, palmMat)
        crown.position.y = 3.05
        crown.rotation.y = Math.random() * Math.PI * 2
        crown.castShadow = true
        palm.add(crown)
        palm.position.set(dx, islandTopY(d), dz)
        scene.add(palm)
      }
      // boulders
      const rockGeo = new THREE.DodecahedronGeometry(0.6, 0)
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8074, roughness: 0.9, flatShading: true })
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 5)
      const dummy = new THREE.Object3D()
      for (let i = 0; i < 5; i++) {
        const a = i * 1.9 + 2.0
        const d = 2.5 + (i % 3) * 1.5
        const s = 0.4 + Math.random() * 0.5
        dummy.position.set(Math.cos(a) * d, islandTopY(d) + s * 0.2, Math.sin(a) * d)
        dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random())
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        rocks.setMatrixAt(i, dummy.matrix)
      }
      rocks.instanceMatrix.needsUpdate = true
      rocks.castShadow = true
      scene.add(rocks)
    }

    // ---- lighthouse (detailed, weathered) ----
    {
      const lh = makeLighthouse(texAssets)
      beamGroup = lh.beamGroup
      lampLight = lh.lampLight
      scene.add(lh.group)
    }

    // ---- kelp (GPU wind, from forest pattern) ----
    {
      const count = 90
      const kelpGeo = makeKelpGeometry()
      const kelpMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide
      })
      kelpMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 }
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
             uniform float uTime;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             vec4 kelpPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
             float kelpPhase = kelpPos.x * 0.31 + kelpPos.z * 0.27;
             float kelpW = transformed.y * transformed.y;
             transformed.x += kelpW * sin(uTime * 1.1 + kelpPhase) * 0.16;
             transformed.z += kelpW * cos(uTime * 0.8 + kelpPhase * 1.4) * 0.13;`
          )
        kelpWindShader = shader
      }
      const kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, count)
      const dummy = new THREE.Object3D()
      let placed = 0
      for (let attempt = 0; attempt < count * 4 && placed < count; attempt++) {
        const a = Math.random() * Math.PI * 2
        const d = 16 + Math.random() * 24
        const x = Math.cos(a) * d
        const z = Math.sin(a) * d
        const y = floorHeight(x, z)
        if (y > -1.6) continue
        const sY = 2 + Math.random() * 2.6
        dummy.position.set(x, y, z)
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
        dummy.scale.set(0.8 + Math.random() * 0.6, sY, 0.8 + Math.random() * 0.6)
        dummy.updateMatrix()
        kelp.setMatrixAt(placed, dummy.matrix)
        kelp.setColorAt(placed, new THREE.Color(0x2f8a4a).multiplyScalar(0.6 + Math.random() * 0.55))
        placed++
      }
      kelp.count = placed
      kelp.instanceMatrix.needsUpdate = true
      if (kelp.instanceColor) kelp.instanceColor.needsUpdate = true
      scene.add(kelp)
    }

    // ---- coral reef ----
    {
      const dummyRand = Math.random
      const types = [0, 1, 2, 3].map((t) => ({
        geo: makeCoralGeometry(t, dummyRand),
        mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true, side: THREE.DoubleSide })
      }))
      const palettes = [0xff6a4a, 0xffb03a, 0xff4a7a, 0x4ac0d9, 0xc86aff]
      const dummy = new THREE.Object3D()
      types.forEach((t, ti) => {
        const n = 35
        const im = new THREE.InstancedMesh(t.geo, t.mat, n)
        let placed = 0
        for (let attempt = 0; attempt < n * 5 && placed < n; attempt++) {
          const a = Math.random() * Math.PI * 2
          const d = 15 + Math.random() * 24
          const x = Math.cos(a) * d
          const z = Math.sin(a) * d
          const y = floorHeight(x, z)
          if (y > -1.7) continue
          const s = 0.7 + Math.random() * 1.0
          dummy.position.set(x, y, z)
          dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
          dummy.scale.setScalar(s)
          dummy.updateMatrix()
          im.setMatrixAt(placed, dummy.matrix)
          im.setColorAt(placed, new THREE.Color(palettes[Math.floor(Math.random() * palettes.length)]).multiplyScalar(0.75 + Math.random() * 0.4))
          placed++
        }
        im.count = placed
        im.instanceMatrix.needsUpdate = true
        if (im.instanceColor) im.instanceColor.needsUpdate = true
        scene.add(im)
      })
      // scattered rocks
      const rockGeo = new THREE.DodecahedronGeometry(1, 0)
      const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x6a7a72, roughness: 0.9, flatShading: true }), 25)
      let placed = 0
      for (let attempt = 0; attempt < 120 && placed < 25; attempt++) {
        const a = Math.random() * Math.PI * 2
        const d = 14 + Math.random() * 30
        const x = Math.cos(a) * d
        const z = Math.sin(a) * d
        const y = floorHeight(x, z)
        dummy.position.set(x, y - 0.15, z)
        dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random())
        dummy.scale.set(0.5 + Math.random() * 1.2, 0.4 + Math.random() * 0.9, 0.5 + Math.random() * 1.2)
        dummy.updateMatrix()
        rocks.setMatrixAt(placed, dummy.matrix)
        placed++
      }
      rocks.count = placed
      rocks.instanceMatrix.needsUpdate = true
      scene.add(rocks)
    }

    // ---- fish schools (instanced) ----
    {
      const fishGeo = makeFishGeometry()
      const fishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.25 })
      const schools = [
        { R: 20, y: -2.2, speed: 0.14, phase: 0, tint: 0xff8a3a, n: 60, scale: 1 },
        { R: 24, y: -3.2, speed: -0.1, phase: 2.4, tint: 0x4ab8ff, n: 60, scale: 1 },
        { R: 15, y: -2.7, speed: 0.2, phase: 4.2, tint: 0xffc23a, n: 40, scale: 0.55 }
      ]
      for (const sc of schools) {
        const im = new THREE.InstancedMesh(fishGeo, fishMat.clone(), sc.n)
        const offsets = []
        for (let i = 0; i < sc.n; i++) {
          offsets.push(new THREE.Vector3(
            (Math.random() - 0.5) * 13,
            (Math.random() - 0.5) * 2.6,
            (Math.random() - 0.5) * 8
          ))
          const v = 0.7 + Math.random() * 0.6
          im.setColorAt(i, new THREE.Color(sc.tint).multiplyScalar(v))
        }
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        im.instanceColor.needsUpdate = true
        scene.add(im)
        fishSchools.push({ im, offsets, ...sc })
      }
    }

    // ---- sea turtle ----
    {
      const t = makeTurtle()
      scene.add(t.group)
      // surfacing bubble trail (pool)
      const bubbleCount = 20
      const bubblePos = new Float32Array(bubbleCount * 3)
      const bubbleAge = new Float32Array(bubbleCount).fill(99)
      const bubbleVel = new Float32Array(bubbleCount)
      const bubbleGeo = new THREE.BufferGeometry()
      bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3))
      const bubbleMat = new THREE.PointsMaterial({
        color: 0x9adcff, size: 0.09, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
      const bubblePts = new THREE.Points(bubbleGeo, bubbleMat)
      scene.add(bubblePts)
      turtle = {
        ...t,
        diveT: 0,
        bubbles: { pts: bubblePts, pos: bubblePos, age: bubbleAge, vel: bubbleVel, count: bubbleCount, timer: 0 }
      }
    }

    // ---- jellyfish ----
    for (let i = 0; i < 8; i++) {
      const hue = [0xff7ab8, 0xc88aff, 0x7ad8ff, 0xff9a6a, 0x9affc8, 0x8aff9a, 0xffa0e0, 0xa0c8ff][i % 8]
      const mat = new THREE.MeshStandardMaterial({
        color: hue, emissive: hue, emissiveIntensity: 0.45,
        transparent: true, opacity: 0.42, roughness: 0.3, side: THREE.DoubleSide
      })
      const g = new THREE.Group()
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat)
      g.add(bell)
      const tentMat = new THREE.MeshStandardMaterial({
        color: hue, emissive: hue, emissiveIntensity: 0.3,
        transparent: true, opacity: 0.3
      })
      for (let tIdx = 0; tIdx < 6; tIdx++) {
        const tent = new THREE.Mesh(new THREE.BoxGeometry(0.022, 1.4, 0.022), tentMat)
        const a = (tIdx / 6) * Math.PI * 2
        tent.position.set(Math.cos(a) * 0.28, -0.7, Math.sin(a) * 0.28)
        g.add(tent)
      }
      scene.add(g)
      jellies.push({
        group: g,
        base: new THREE.Vector3(
          Math.cos(i * 2.2) * (18 + (i % 3) * 7),
          -1.2 - (i % 3) * 0.8,
          Math.sin(i * 2.2) * (18 + (i % 3) * 7)
        ),
        phase: Math.random() * Math.PI * 2,
        drift: 0.15 + Math.random() * 0.15
      })
    }

    // ---- gulls ----
    for (let i = 0; i < 7; i++) {
      const gull = makeGull()
      scene.add(gull.group)
      gulls.push({
        ...gull,
        R: 11 + i * 2.2,
        y: 7.5 + i * 1.6,
        speed: 0.4 + i * 0.05,
        phase: i * 1.3
      })
    }

    // ---- bubbles (3 vents) ----
    {
      const count = 350
      const positions = new Float32Array(count * 3)
      const vels = new Float32Array(count)
      const vents = [
        new THREE.Vector3(22, floorHeight(22, -10), -10),
        new THREE.Vector3(-26, floorHeight(-26, 16), 16),
        new THREE.Vector3(8, floorHeight(8, 30), 30)
      ]
      const ventIdx = new Uint8Array(count)
      for (let i = 0; i < count; i++) {
        const v = ventIdx[i] = i % 3
        positions[i * 3] = vents[v].x + (Math.random() - 0.5) * 1.2
        positions[i * 3 + 1] = vents[v].y + Math.random() * Math.max(0.5, WATER_Y - 0.3 - vents[v].y)
        positions[i * 3 + 2] = vents[v].z + (Math.random() - 0.5) * 1.2
        vels[i] = 0.5 + Math.random() * 0.7
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const mat = new THREE.PointsMaterial({
        color: 0x9adcff, size: 0.09, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
      const pts = new THREE.Points(geo, mat)
      scene.add(pts)
      bubbleData = { pts, vels, vents, ventIdx }
    }

    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)
    dispose.onCleanup = () => {
      window.removeEventListener('resize', onResize)
    }

    // ---- animation ----
    let CLOCK_DELTA = 0.016
    const clock = { last: performance.now() }
    const _v = new THREE.Vector3()
    const _n = new THREE.Vector3()
    const _q = new THREE.Quaternion()
    const Z_AXIS = new THREE.Vector3(0, 0, 1)
    const dummy = new THREE.Object3D()

    function animate() {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const now = performance.now()
      CLOCK_DELTA = Math.min((now - clock.last) / 1000, 0.05)
      clock.last = now
      const t = clock.last / 1000

      orbit.autoRotate = autoRotate.value
      if (waterMat) waterMat.uniforms.uTime.value = t
      if (kelpWindShader) kelpWindShader.uniforms.uTime.value = t
      if (beamGroup) {
        beamGroup.rotation.y = t * 0.9
        lampLight.intensity = 100 + 60 * Math.max(0, Math.sin(t * 0.9 * 2))
      }

      // fish schools
      for (const sc of fishSchools) {
        const a = t * sc.speed + sc.phase
        const cx = Math.cos(a) * sc.R
        const cz = Math.sin(a) * sc.R
        const cy = sc.y + Math.sin(t * 0.3 + sc.phase) * 0.5
        _n.set(-Math.sin(a), 0, Math.cos(a)).normalize()
        _q.setFromUnitVectors(Z_AXIS, _n)
        for (let i = 0; i < sc.n; i++) {
          const o = sc.offsets[i]
          const wobble = Math.sin(t * 1.6 + i * 0.9) * 0.3
          dummy.position.set(
            cx + o.x * Math.cos(a) - o.z * Math.sin(a) + wobble,
            cy + o.y,
            cz + o.x * Math.sin(a) + o.z * Math.cos(a)
          )
          dummy.quaternion.copy(_q)
          dummy.scale.setScalar((0.8 + (i % 5) * 0.08) * sc.scale)
          dummy.updateMatrix()
          sc.im.setMatrixAt(i, dummy.matrix)
        }
        sc.im.instanceMatrix.needsUpdate = true
      }

      // turtle (cruise / dive / surface + bubble trail)
      if (turtle) {
        const diveT = (Math.sin(t * 0.28 + 5.5) + 1) / 2
        const rising = diveT < turtle.diveT
        turtle.diveT = diveT
        const radius = 16.5 + (1 - diveT) * 6.5
        const ta = t * 0.08
        const tx = Math.cos(ta) * radius
        const tz = Math.sin(ta) * radius
        let ty = -1.7 - diveT * 2.3 + Math.sin(t * 0.4) * 0.25
        ty = Math.max(ty, floorHeight(tx, tz) + 1.1)
        turtle.group.position.set(tx, ty, tz)
        _n.set(-Math.sin(ta), 0, Math.cos(ta))
        _q.setFromUnitVectors(Z_AXIS, _n)
        turtle.group.quaternion.copy(_q)
        turtle.group.rotateZ(0.12 + diveT * 0.18)
        // head: turn + dive/surface nod
        turtle.head.rotation.y = Math.sin(t * 0.5) * 0.18
        turtle.head.rotation.x = (0.5 - diveT) * 0.6 + Math.sin(t * 0.3) * 0.08
        // flippers: front crawl (asymmetric stroke), rear opposite small
        const p = t * 2.1
        const stroke = Math.sin(p) * (0.6 - 0.4 * Math.sin(p))
        const rear = Math.sin(p + Math.PI / 2) * 0.3
        for (const f of turtle.flippers) {
          if (f.front) {
            f.pivot.rotation.x = stroke
            f.pivot.rotation.z = 0.1 + 0.08 * Math.sin(p + f.side)
          } else {
            f.pivot.rotation.x = -rear
          }
        }
        turtle.tailPivot.rotation.x = Math.sin(t * 1.3) * 0.25
        // bubbles while surfacing
        const bub = turtle.bubbles
        if (rising && diveT > 0.3 && diveT < 0.85) {
          bub.timer += CLOCK_DELTA
          if (bub.timer > 0.33) {
            bub.timer = 0
            for (let i = 0; i < bub.count; i++) {
              if (bub.age[i] >= 2) {
                const back = new THREE.Vector3(0, 0.2, -1.6).applyQuaternion(turtle.group.quaternion)
                bub.pos[i * 3] = turtle.group.position.x + back.x + (Math.random() - 0.5) * 0.5
                bub.pos[i * 3 + 1] = turtle.group.position.y + back.y + 0.3
                bub.pos[i * 3 + 2] = turtle.group.position.z + back.z + (Math.random() - 0.5) * 0.5
                bub.age[i] = 0
                bub.vel[i] = 0.4 + Math.random() * 0.5
                break
              }
            }
          }
        }
        for (let i = 0; i < bub.count; i++) {
          if (bub.age[i] < 2) {
            bub.age[i] += CLOCK_DELTA
            bub.pos[i * 3 + 1] += bub.vel[i] * CLOCK_DELTA
            bub.pos[i * 3] += Math.sin(performance.now() * 0.01 + i) * 0.002
          }
        }
        bub.pts.geometry.attributes.position.needsUpdate = true
      }

      // jellyfish
      for (const j of jellies) {
        const p = Math.sin(t * 1.4 + j.phase)
        j.group.position.set(
          j.base.x + Math.cos(t * j.drift + j.phase) * 2.5,
          j.base.y + Math.sin(t * 0.35 + j.phase) * 0.9,
          j.base.z + Math.sin(t * j.drift * 1.3 + j.phase) * 2.5
        )
        const s = 1 + p * 0.12
        const sy = 1 - p * 0.2
        j.group.scale.set(s, sy, s)
        j.group.rotation.y = t * 0.2 + j.phase
      }

      // gulls
      for (const g of gulls) {
        const a = t * g.speed + g.phase
        g.group.position.set(Math.cos(a) * g.R, g.y + Math.sin(t * 0.7 + g.phase) * 0.6, Math.sin(a) * g.R)
        g.group.rotation.y = -a
        const flap = Math.sin(t * 7 + g.phase) * 0.5
        g.pivotL.rotation.z = 0.2 + flap
        g.pivotR.rotation.z = 0.2 + flap
      }

      // bubbles
      if (bubbleData) {
        const arr = bubbleData.pts.geometry.attributes.position.array
        for (let i = 0; i < bubbleData.ventIdx.length; i++) {
          arr[i * 3 + 1] += bubbleData.vels[i] * CLOCK_DELTA
          arr[i * 3] += Math.sin(t * 2 + i * 1.7) * 0.002
          if (arr[i * 3 + 1] > WATER_Y - 0.1) {
            const v = bubbleData.vents[bubbleData.ventIdx[i]]
            arr[i * 3] = v.x + (Math.random() - 0.5) * 1.2
            arr[i * 3 + 1] = v.y
            arr[i * 3 + 2] = v.z + (Math.random() - 0.5) * 1.2
          }
        }
        bubbleData.pts.geometry.attributes.position.needsUpdate = true
      }

      orbit.update()
      renderer.render(scene, camera)
    }
    animate()
  }

  function dispose() {
    disposed = true
    cancelAnimationFrame(frame)
    dispose.onCleanup?.()
    if (!scene) return
    orbit?.dispose()
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose()
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
      for (const m of mats) m?.dispose?.()
    })
    for (const t of texAssets) t.dispose()
    renderer?.dispose()
    renderer = scene = camera = orbit = null
  }

  return { init, dispose, autoRotate, toggleAutoRotate }
}
