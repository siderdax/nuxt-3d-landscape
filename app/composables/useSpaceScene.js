import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useCameraMove } from './useCameraMove'

const PLANET_POS = new THREE.Vector3(-8, 0, -6)
const PLANET_R = 26
const BELT_TILT = 0.31
const STAR_POS = new THREE.Vector3(144, 30, -241)
const SUN_DIR = new THREE.Vector3(0.75, 0.35, 0.555).normalize()
const RING_INNER = 33
const RING_OUTER = 62

// Saturn-like ring bands: inner/outer radius, rock count, size range, flatness
const RING_BANDS = [
  { inner: 33.0, outer: 36.6, count: 400, sMin: 0.22, sMax: 0.62, thick: 0.28 },
  { inner: 37.3, outer: 41.0, count: 350, sMin: 0.26, sMax: 0.75, thick: 0.32 },
  { inner: 41.0, outer: 42.6, count: 30, sMin: 0.2, sMax: 0.5, thick: 0.22 },
  { inner: 42.6, outer: 49.8, count: 650, sMin: 0.3, sMax: 0.95, thick: 0.38 },
  { inner: 50.6, outer: 56.4, count: 430, sMin: 0.38, sMax: 1.15, thick: 0.42 },
  { inner: 57.4, outer: 61.3, count: 170, sMin: 0.42, sMax: 1.45, thick: 0.48 }
]

// ---------- canvas texture helpers ----------

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

function hash1(n) {
  const s = Math.sin(n) * 43758.5453123
  return s - Math.floor(s)
}

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Generic weathered metal panel texture: tonal patches, grain, panel lines,
// rivets, scratches, grime streaks, optional hazard stripe + stencil label.
function makePanelTexture({ size = 512, base = '#8e98a3', label = null, labelSub = null, hazard = false }) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 40 + Math.random() * 130
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.045)'
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }

  const vlines = []
  let x = 24 + Math.random() * 40
  while (x < size - 20) { vlines.push(x); x += 48 + Math.random() * 70 }
  const hlines = []
  let y = 24 + Math.random() * 40
  while (y < size - 20) { hlines.push(y); y += 58 + Math.random() * 80 }

  ctx.strokeStyle = 'rgba(18,22,28,0.4)'
  ctx.lineWidth = 2
  for (const vx of vlines) { ctx.beginPath(); ctx.moveTo(vx, 0); ctx.lineTo(vx, size); ctx.stroke() }
  for (const hy of hlines) { ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(size, hy); ctx.stroke() }
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(18,22,28,0.25)'
  vlines.forEach((vx, i) => {
    if (i % 3 === 0) { ctx.beginPath(); ctx.moveTo(vx + 6, 0); ctx.lineTo(vx + 6, size); ctx.stroke() }
  })
  ctx.fillStyle = 'rgba(12,15,19,0.5)'
  vlines.forEach((vx, i) => {
    if (i % 2 === 0) for (let ry = 14; ry < size; ry += 24) { ctx.beginPath(); ctx.arc(vx + 4, ry, 1.3, 0, Math.PI * 2); ctx.fill() }
  })
  hlines.forEach((hy, i) => {
    if (i % 2 === 1) for (let rx = 14; rx < size; rx += 24) { ctx.beginPath(); ctx.arc(rx, hy + 4, 1.3, 0, Math.PI * 2); ctx.fill() }
  })

  for (let i = 0; i < 26; i++) {
    const sx = Math.random() * size
    const sy = Math.random() * size
    const len = 8 + Math.random() * 42
    const ang = Math.random() * Math.PI * 2
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len)
    ctx.stroke()
  }
  for (let i = 0; i < 7; i++) {
    const dx = Math.random() * size
    const g = ctx.createLinearGradient(dx, size, dx, size - 70 - Math.random() * 90)
    g.addColorStop(0, 'rgba(28,24,16,0.18)')
    g.addColorStop(1, 'rgba(28,24,16,0)')
    ctx.fillStyle = g
    ctx.fillRect(dx - 5, size - 160, 10, 160)
  }

  if (hazard) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, size - 42, 150, 42)
    ctx.clip()
    for (let i = -2; i < 11; i++) {
      ctx.fillStyle = i % 2 ? '#c9a227' : '#23272c'
      ctx.beginPath()
      ctx.moveTo(i * 26, size)
      ctx.lineTo(i * 26 + 26, size)
      ctx.lineTo(i * 26 + 42, size - 42)
      ctx.lineTo(i * 26 + 16, size - 42)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }
  if (label) {
    ctx.fillStyle = 'rgba(238,243,248,0.88)'
    ctx.font = `bold ${Math.round(size * 0.11)}px "Courier New", monospace`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(label, size * 0.06, size * 0.44)
    if (labelSub) {
      ctx.fillStyle = 'rgba(238,243,248,0.55)'
      ctx.font = `${Math.round(size * 0.04)}px "Courier New", monospace`
      ctx.fillText(labelSub, size * 0.062, size * 0.44 + size * 0.06)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function makeDecalTexture(main, sub) {
  const w = 256
  const h = 96
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  ctx.fillStyle = 'rgba(201,162,39,0.9)'
  ctx.fillRect(10, 14, 6, h - 28)
  ctx.fillStyle = 'rgba(238,242,247,0.92)'
  ctx.font = 'bold 42px "Courier New", monospace'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(main, 30, 54)
  ctx.fillStyle = 'rgba(220,228,236,0.6)'
  ctx.font = '17px "Courier New", monospace'
  ctx.fillText(sub, 31, 80)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeRockTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#8a7d6c'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 1 + Math.random() * 7
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(40,32,24,0.10)' : 'rgba(220,210,190,0.08)'
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * (0.5 + Math.random() * 0.7), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(25,20,15,0.35)'
  ctx.lineWidth = 1
  for (let i = 0; i < 45; i++) {
    let x = Math.random() * size
    let y = Math.random() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    const steps = 3 + Math.floor(Math.random() * 5)
    for (let s = 0; s < steps; s++) {
      x += (Math.random() - 0.5) * 30
      y += (Math.random() - 0.5) * 30
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function makeSolarTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0c1526'
  ctx.fillRect(0, 0, size, size)
  const cell = 32
  for (let gy = 0; gy < size / cell; gy++) {
    for (let gx = 0; gx < size / cell; gx++) {
      const v = 0.75 + Math.random() * 0.5
      ctx.fillStyle = `rgb(${Math.round(24 * v)}, ${Math.round(40 * v)}, ${Math.round(74 * v)})`
      ctx.fillRect(gx * cell + 2, gy * cell + 2, cell - 4, cell - 4)
    }
  }
  ctx.strokeStyle = '#31415f'
  ctx.lineWidth = 2
  for (let i = 0; i <= size / cell; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke()
  }
  ctx.strokeStyle = '#4a5568'
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, size - 8, size - 8)
  const g = ctx.createLinearGradient(0, 0, size, size)
  g.addColorStop(0.3, 'rgba(255,255,255,0)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.09)')
  g.addColorStop(0.55, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

// Banded ring texture. RingGeometry uses planar UVs, so ring radius r maps to
// canvas radius (r / RING_OUTER) * R: we draw concentric bands directly.
function makeRingTexture() {
  const size = 1024
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const R = size / 2
  const g1 = (r, m, w) => Math.exp(-((r - m) * (r - m)) / (2 * w * w))
  const ringlets = [35.1, 36.2, 44.3, 46.1, 47.9, 51.9, 54.6, 58.9]
  const density = (r) => {
    let d =
      g1(r, 34.8, 1.5) * 0.7 +
      g1(r, 39.1, 1.8) * 0.8 +
      g1(r, 46.2, 3.2) * 1.0 +
      g1(r, 53.4, 2.4) * 0.75 +
      g1(r, 59.3, 1.5) * 0.42 +
      0.08
    for (const rm of ringlets) d += g1(r, rm, 0.16) * 0.55
    d *= 1 - 0.88 * g1(r, 41.8, 0.85)
    d *= 1 - 0.7 * g1(r, 56.9, 0.5)
    d *= sstep(33.0, 33.9, r) * (1 - sstep(60.4, 61.9, r))
    return Math.min(1, d)
  }
  for (let px = Math.ceil((RING_INNER / RING_OUTER) * R); px < R - 1; px++) {
    const r = (px / R) * RING_OUTER
    let d = density(r)
    d *= 0.7 + 0.3 * hash1(r * 7.3)
    d *= 0.85 + 0.15 * hash1(r * 23.7 + 5)
    const a = Math.min(0.8, 0.05 + 0.75 * d)
    const tint = 195 + 30 * hash1(r * 3.1 + 11)
    ctx.strokeStyle = `rgba(${Math.round(tint)}, ${Math.round(tint * 0.95)}, ${Math.round(tint * 0.88)}, ${a.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(R, R, px, 0, Math.PI * 2)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// ---------- planet shaders ----------

const PLANET_VERT = /* glsl */ `
varying vec3 vObjDir;
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  vObjDir = normalize(position);
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const PLANET_FRAG = /* glsl */ `
uniform vec3 uSunDir;
varying vec3 vObjDir;
varying vec3 vWorldPos;
varying vec3 vNormalW;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec3(11.1);
    a *= 0.5;
  }
  return v;
}
void main() {
  vec3 n = normalize(vObjDir);
  float cont = fbm(n * 2.3 + vec3(7.3));
  float landMask = smoothstep(0.46, 0.53, cont);
  vec3 ocean = vec3(0.085, 0.07, 0.06);
  vec3 landA = vec3(0.40, 0.21, 0.12);
  vec3 landB = vec3(0.56, 0.35, 0.21);
  vec3 col = mix(ocean, mix(landA, landB, fbm(n * 5.0 + vec3(3.1))), landMask);
  float c = fbm(n * 5.5 + vec3(40.7));
  float pit = smoothstep(0.58, 0.68, c);
  float rim = smoothstep(0.53, 0.58, c) * (1.0 - pit);
  col = mix(col, col * 0.5, pit * landMask);
  col = mix(col, col * 1.35, rim * 0.3 * landMask);
  float day = dot(normalize(vNormalW), normalize(uSunDir));
  col *= 0.05 + 1.5 * smoothstep(-0.12, 0.42, day);
  float night = 1.0 - smoothstep(-0.18, 0.12, day);
  float lights = smoothstep(0.60, 0.72, fbm(n * 9.0 + vec3(21.5))) * landMask * night;
  col += vec3(1.0, 0.58, 0.22) * lights * 0.85;
  gl_FragColor = vec4(col, 1.0);
}
`

const RIM_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const RIM_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uPlanetPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float f = pow(1.0 - abs(dot(V, normalize(vNormalW))), 3.0);
  vec3 fromPlanet = normalize(vWorldPos - uPlanetPos);
  float sunSide = 0.45 + 0.55 * max(0.0, dot(fromPlanet, normalize(uSunDir)));
  gl_FragColor = vec4(vec3(0.85, 0.45, 0.2) * f * sunSide, f);
}
`

// ---------- rock geometry ----------

function makeRockGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const bump = 0.35 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 1.3)
      + 0.2 * Math.sin(y * 4.3 + seed * 2.1)
    const s = 1 + bump * 0.5
    pos.setXYZ(i, x * s, y * s, z * s)
  }
  geo.computeVertexNormals()
  return geo
}

// ---------- dropship ----------

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function wingShape(mirror) {
  const s = new THREE.Shape()
  const X = (v) => (mirror ? -v : v)
  s.moveTo(X(0.5), 0.35)
  s.lineTo(X(1.95), 0.12)
  s.quadraticCurveTo(X(2.08), 0.0, X(1.98), -0.2)
  s.lineTo(X(0.5), -0.45)
  s.closePath()
  return s
}

function finShape() {
  const s = new THREE.Shape()
  s.moveTo(0.45, 0)
  s.lineTo(-0.3, 0.85)
  s.lineTo(-0.85, 0.85)
  s.lineTo(-0.85, 0)
  s.closePath()
  return s
}

// Shared geometry + base materials, built once and reused by all ships.
function makeShipKit(track) {
  const fusTex = makePanelTexture({ base: '#8e98a3', label: 'TC-77', labelSub: 'TERAN COAST GUARD' })
  const noseTex = makePanelTexture({ base: '#d9dee5', hazard: true })
  const decalTex = makeDecalTexture('TC-77', 'K-7 FLOTILLA')
  track.push(fusTex, noseTex, decalTex)

  const mats = {
    hull: new THREE.MeshStandardMaterial({ map: fusTex, bumpMap: fusTex, bumpScale: 0.02, roughness: 0.55, metalness: 0.55 }),
    nose: new THREE.MeshStandardMaterial({ map: noseTex, bumpMap: noseTex, bumpScale: 0.012, roughness: 0.5, metalness: 0.35 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb03434, roughness: 0.5, metalness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2c343d, roughness: 0.65, metalness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8fd0f0, roughness: 0.12, metalness: 0.7, emissive: 0x1c4a5e, emissiveIntensity: 0.6 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x1e2329, roughness: 0.9, metalness: 0.1 }),
    hub: new THREE.MeshStandardMaterial({ color: 0x98a4b0, roughness: 0.4, metalness: 0.7 }),
    navRed: new THREE.MeshStandardMaterial({ color: 0x330a08, emissive: 0xff3322, emissiveIntensity: 2.2 }),
    navGreen: new THREE.MeshStandardMaterial({ color: 0x0a3315, emissive: 0x33ff66, emissiveIntensity: 2.2 }),
    navCyan: new THREE.MeshStandardMaterial({ color: 0x0a2a30, emissive: 0x66e0ff, emissiveIntensity: 1.4 }),
    landingLight: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2cc, emissiveIntensity: 1.6 }),
    decal: new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false })
  }

  const geos = {}
  geos.fuselage = (() => {
    const geo = new THREE.ExtrudeGeometry(roundedRectShape(1.2, 0.72, 0.18), {
      depth: 2.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.13, bevelSegments: 3, curveSegments: 6
    })
    geo.translate(0, 0, -1.1)
    return geo
  })()
  geos.nose = new THREE.SphereGeometry(0.55, 20, 14)
  geos.nose.scale(1, 0.62, 1.55)
  geos.spinner = new THREE.ConeGeometry(0.09, 0.34, 10)
  geos.spinner.rotateX(Math.PI / 2)
  geos.canopy = new THREE.SphereGeometry(0.34, 16, 12)
  geos.canopy.scale(1, 0.5, 1.25)
  geos.wingR = (() => {
    const geo = new THREE.ExtrudeGeometry(wingShape(false), { depth: 0.045, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.02, bevelSegments: 2, curveSegments: 4 })
    geo.rotateX(Math.PI / 2)
    return geo
  })()
  geos.wingL = (() => {
    const geo = new THREE.ExtrudeGeometry(wingShape(true), { depth: 0.045, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.02, bevelSegments: 2, curveSegments: 4 })
    geo.rotateX(Math.PI / 2)
    return geo
  })()
  geos.nacelle = new THREE.CylinderGeometry(0.26, 0.3, 1.2, 14)
  geos.nacelle.rotateX(Math.PI / 2)
  geos.nozzle = new THREE.CylinderGeometry(0.3, 0.21, 0.16, 14)
  geos.nozzle.rotateX(Math.PI / 2)
  geos.nozzleGlow = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 12)
  geos.nozzleGlow.rotateX(Math.PI / 2)
  geos.flame = new THREE.ConeGeometry(0.16, 0.95, 10)
  geos.flame.rotateX(-Math.PI / 2)
  geos.flame.translate(0, 0, -0.475)
  geos.wheel = new THREE.CylinderGeometry(0.085, 0.085, 0.055, 12)
  geos.wheel.rotateZ(Math.PI / 2)
  geos.wheelBig = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12)
  geos.wheelBig.rotateZ(Math.PI / 2)
  geos.hub = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8)
  geos.hub.rotateZ(Math.PI / 2)
  geos.fin = (() => {
    const geo = new THREE.ExtrudeGeometry(finShape(), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2, curveSegments: 4 })
    geo.rotateY(-Math.PI / 2)
    return geo
  })()
  geos.decalPlane = new THREE.PlaneGeometry(0.82, 0.3)
  return { mats, geos }
}

function makeDropship(kit) {
  const { mats, geos } = kit
  const g = new THREE.Group()
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    if (rx) m.rotation.x = rx
    if (ry) m.rotation.y = ry
    if (rz) m.rotation.z = rz
    g.add(m)
    return m
  }

  const engineMat = new THREE.MeshStandardMaterial({ color: 0x223038, emissive: 0x66eaff, emissiveIntensity: 1.2, roughness: 0.4 })
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x330806, emissive: 0xff2211, emissiveIntensity: 2 })
  const flames = []

  add(geos.fuselage, mats.hull)
  add(geos.nose, mats.nose, 0, -0.03, 1.15)
  add(geos.spinner, mats.dark, 0, -0.03, 2.06)
  add(geos.canopy, mats.glass, 0, 0.34, 0.95)
  add(new THREE.BoxGeometry(0.66, 0.028, 0.05), mats.dark, 0, 0.475, 0.95)
  add(new THREE.BoxGeometry(0.05, 0.028, 0.72), mats.dark, 0, 0.475, 0.95)
  add(new THREE.BoxGeometry(0.5, 0.055, 0.14), mats.dark, 0, 0.3, 1.32)

  add(geos.wingR, mats.hull, 0, 0.09, 0.05)
  add(geos.wingL, mats.hull, 0, 0.09, 0.05)
  add(new THREE.BoxGeometry(0.5, 0.13, 0.95), mats.hull, 0.55, -0.07, 0.05)
  add(new THREE.BoxGeometry(0.5, 0.13, 0.95), mats.hull, -0.55, -0.07, 0.05)
  add(new THREE.BoxGeometry(0.26, 0.1, 0.5), mats.red, 1.84, 0.05, -0.02)
  add(new THREE.BoxGeometry(0.26, 0.1, 0.5), mats.red, -1.84, 0.05, -0.02)
  add(new THREE.SphereGeometry(0.045, 8, 8), mats.navRed, -1.97, 0.1, -0.02)
  add(new THREE.SphereGeometry(0.045, 8, 8), mats.navGreen, 1.97, 0.1, -0.02)

  for (const sx of [-1, 1]) {
    const x = sx * 1.0
    add(geos.nacelle, mats.hull, x, 0.02, -0.75)
    add(new THREE.BoxGeometry(0.32, 0.1, 0.42), mats.dark, x, 0.3, -0.62)
    add(new THREE.BoxGeometry(0.36, 0.14, 0.5), mats.hull, x * 0.72, -0.02, -0.55)
    add(geos.nozzle, mats.dark, x, 0.02, -1.38)
    add(geos.nozzleGlow, engineMat, x, 0.02, -1.47)
    const flame = add(geos.flame, flameMat, x, 0.02, -1.5)
    flames.push(flame)
  }

  add(geos.fin, mats.hull, 0.028, 0.3, -0.75)
  add(new THREE.BoxGeometry(1.5, 0.045, 0.34), mats.hull, 0, 1.06, -1.32)
  add(new THREE.BoxGeometry(0.2, 0.06, 0.36), mats.red, 0.68, 1.06, -1.32)
  add(new THREE.BoxGeometry(0.2, 0.06, 0.36), mats.red, -0.68, 1.06, -1.32)
  add(new THREE.SphereGeometry(0.05, 8, 8), beaconMat, 0, 1.2, -1.45)

  add(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), mats.dark, 0, -0.5, 1.0)
  add(geos.wheel, mats.tire, 0.06, -0.66, 1.0)
  add(geos.wheel, mats.tire, -0.06, -0.66, 1.0)
  add(geos.hub, mats.hub, 0.095, -0.66, 1.0)
  add(geos.hub, mats.hub, -0.095, -0.66, 1.0)
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.07, 0.38, 0.09), mats.dark, sx * 0.85, -0.44, 0.15)
    add(geos.wheelBig, mats.tire, sx * 0.85, -0.64, 0.22)
    add(geos.wheelBig, mats.tire, sx * 0.85, -0.64, 0.08)
  }

  for (let i = 0; i < 3; i++) {
    add(new THREE.BoxGeometry(0.015, 0.09, 0.22), mats.dark, 0.608, -0.1, -0.7 - i * 0.16)
    add(new THREE.BoxGeometry(0.015, 0.09, 0.22), mats.dark, -0.608, -0.1, -0.7 - i * 0.16)
  }
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 6), mats.dark, 0, 0.47, -0.35)
  add(new THREE.SphereGeometry(0.032, 8, 8), mats.navCyan, 0, 0.61, -0.35)
  add(new THREE.SphereGeometry(0.04, 8, 8), mats.landingLight, 0, -0.37, 1.5)
  add(new THREE.BoxGeometry(1.22, 0.09, 0.5), mats.red, 0, 0.31, -0.55)

  add(geos.decalPlane, mats.decal, 0.612, 0.05, 0.32, 0, Math.PI / 2, 0)
  add(geos.decalPlane, mats.decal, -0.612, 0.05, 0.32, 0, -Math.PI / 2, 0)

  g.scale.setScalar(2.2)
  return { group: g, engineMat, flameMat, flames, beaconMat }
}

// ---------- teran outpost ----------

function buildOutpost(track) {
  const g = new THREE.Group()
  const hullTex = makePanelTexture({ base: '#99a2ac', label: 'K-7', labelSub: 'TERAN OUTPOST' })
  const solarTex = makeSolarTexture()
  const contTexA = makePanelTexture({ base: '#8a4a38', hazard: true })
  const contTexB = makePanelTexture({ base: '#9a8a6a', label: 'C-07' })
  const decalTexO = makeDecalTexture('K-7', 'TERAN OUTPOST')
  track.push(hullTex, solarTex, contTexA, contTexB, decalTexO)

  const steelMat = new THREE.MeshStandardMaterial({ map: hullTex, bumpMap: hullTex, bumpScale: 0.015, roughness: 0.45, metalness: 0.5 })
  const steelLight = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.5, metalness: 0.4 })
  const redMat = new THREE.MeshStandardMaterial({ color: 0xa52a2a, roughness: 0.5, metalness: 0.4 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c343d, roughness: 0.6, metalness: 0.5 })
  const solarMat = new THREE.MeshStandardMaterial({ map: solarTex, roughness: 0.35, metalness: 0.6 })
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xc8cdd4, roughness: 0.4, metalness: 0.6 })
  const contA = new THREE.MeshStandardMaterial({ map: contTexA, bumpMap: contTexA, bumpScale: 0.012, roughness: 0.6, metalness: 0.35 })
  const contB = new THREE.MeshStandardMaterial({ map: contTexB, bumpMap: contTexB, bumpScale: 0.012, roughness: 0.6, metalness: 0.35 })
  const decalMat = new THREE.MeshBasicMaterial({ map: decalTexO, transparent: true, depthWrite: false })

  const core = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.0, 0.6, 6), steelMat)
  g.add(core)
  for (let k = 0; k < 6; k++) {
    const a = ((60 + k * 60) * Math.PI) / 180
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.1, 0.14), redMat)
    strip.position.set(Math.cos(a) * 3.9, 0.35, Math.sin(a) * 3.9)
    strip.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a))
    g.add(strip)
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 2.6), steelLight)
  deck.position.set(-0.8, 0.75, 0)
  g.add(deck)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.44, 0.25, 2.64), redMat)
  stripe.position.set(-0.8, 0.45, 0)
  g.add(stripe)
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.4), steelMat)
  tower.position.set(1.4, 1.4, 0.6)
  g.add(tower)
  const towerDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.48), decalMat)
  towerDecal.position.set(1.4, 1.5, 1.31)
  g.add(towerDecal)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6), steelLight)
  mast.position.set(1.4, 3.05, 0.6)
  g.add(mast)
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.35, 8), steelLight)
  dish.position.set(1.4, 3.85, 0.6)
  dish.rotation.x = 0.55
  g.add(dish)
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), steelLight)
  antenna.position.set(-2.4, 1.5, -0.8)
  g.add(antenna)

  const solarPivot = new THREE.Group()
  solarPivot.position.set(-0.8, 1.72, -2.8)
  solarPivot.rotation.set(0.3, 0, -0.25)
  const solarFrame = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.04, 2.15), darkMat)
  solarFrame.position.y = -0.045
  const solarPanel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 2.0), solarMat)
  solarPivot.add(solarFrame, solarPanel)
  g.add(solarPivot)
  for (const [px, pz] of [[-1.5, -2.4], [-0.1, -3.2]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.45, 6), steelLight)
    post.position.set(px, 1.0, pz)
    g.add(post)
  }

  const contDefs = [
    { pos: [3.0, 0.85, 2.1], rot: 0.35, mat: contA },
    { pos: [3.8, 0.85, 1.0], rot: -0.2, mat: contB },
    { pos: [3.3, 1.95, 2.0], rot: 0.12, mat: contB },
    { pos: [1.1, 0.85, 3.6], rot: 0.9, mat: contA }
  ]
  for (const { pos, rot, mat } of contDefs) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 0.85), mat)
    c.position.set(...pos)
    c.rotation.y = rot
    g.add(c)
  }

  const tankGeo = new THREE.CapsuleGeometry(0.4, 0.9, 4, 10)
  tankGeo.rotateZ(Math.PI / 2)
  for (const [tx, tz] of [[-1.6, 2.6], [-2.6, 1.2]]) {
    const t = new THREE.Mesh(tankGeo, tankMat)
    t.position.set(tx, 0.72, tz)
    g.add(t)
  }

  const walkPivot = new THREE.Group()
  walkPivot.position.set(-6.0, 1.9, 0)
  walkPivot.rotation.y = Math.PI
  const walk = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.07, 1.05), steelLight)
  const railL = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 0.04), steelLight)
  railL.position.set(0, 0.28, 0.5)
  const railR = railL.clone()
  railR.position.z = -0.5
  const walkPost = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), darkMat)
  walkPost.position.set(-2.05, -0.78, 0)
  walkPivot.add(walk, railL, railR, walkPost)
  g.add(walkPivot)

  const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), steelLight)
  mast2.position.set(-3.3, 0.95, -1.9)
  g.add(mast2)
  const radar = new THREE.Group()
  radar.position.set(-3.3, 1.65, -1.9)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.1), steelMat)
  const barTip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), darkMat)
  barTip.position.x = 0.45
  radar.add(bar, barTip)
  g.add(radar)

  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 8), steelLight)
  spire.position.set(0, 0.75, -4.15)
  g.add(spire)

  const ringPivot = new THREE.Group()
  ringPivot.rotation.x = 0.35
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.28, 10, 64), steelMat)
  ring.rotation.x = Math.PI / 2
  ringPivot.add(ring)
  const stripAmber = new THREE.MeshStandardMaterial({ color: 0x3a2c14, emissive: 0xffaa33, emissiveIntensity: 1.4 })
  const stripCyan = new THREE.MeshStandardMaterial({ color: 0x14282c, emissive: 0x66e0ff, emissiveIntensity: 1.4 })
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.16), k % 2 ? stripAmber : stripCyan)
    strip.position.set(Math.cos(a) * 7.6, 0.02, Math.sin(a) * 7.6)
    strip.rotation.y = -a
    ringPivot.add(strip)
  }
  g.add(ringPivot)

  const blinkers = []
  const blinkDefs = [
    { pos: [3.9, 0.4, 0], color: 0xff5544 },
    { pos: [-3.9, 0.4, 0], color: 0xffffff },
    { pos: [0, 0.4, 4.4], color: 0xffffff },
    { pos: [1.4, 4.1, 0.6], color: 0xff5544 },
    { pos: [0, 1.3, -4.15], color: 0xffffff },
    { pos: [-1.7, 1.8, -3.6], color: 0x66e0ff },
    { pos: [0.1, 1.8, -1.95], color: 0x66e0ff }
  ]
  for (const { pos, color } of blinkDefs) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: color, emissiveIntensity: 2 })
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), mat)
    bulb.position.set(...pos)
    g.add(bulb)
    blinkers.push(mat)
  }

  const light = new THREE.PointLight(0x88ccff, 140, 80, 2)
  light.position.set(0, 2.5, 0)
  g.add(light)

  g.position.set(55, 10, -50)
  g.scale.setScalar(1.6)
  return { group: g, ringPivot, blinkers, radar }
}

// ---------- scene ----------

export function useSpaceScene(containerRef) {
  let renderer, scene, camera, orbit, frame, stopCameraMove
  let disposed = false
  const autoRotate = ref(true)
  const texAssets = []

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
    container.appendChild(renderer.domElement)

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 2000)
    camera.position.set(8, 40, 170)

    orbit = new OrbitControls(camera, renderer.domElement)
    orbit.target.copy(PLANET_POS)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.05
    orbit.minDistance = 12
    orbit.maxDistance = 300
    orbit.autoRotateSpeed = 0.12
    stopCameraMove = useCameraMove(camera, orbit, 50)

    scene.add(new THREE.AmbientLight(0x1c2a3a, 0.8))
    const sunLight = new THREE.DirectionalLight(0xffeedd, 1.25)
    sunLight.position.copy(SUN_DIR).multiplyScalar(100)
    scene.add(sunLight)

    const starTex = makeRadialTexture(128, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,235,205,0.5)'],
      [1, 'rgba(255,220,180,0)']
    ])
    const glowTex = makeRadialTexture(128, [
      [0, 'rgba(255,255,255,1)'],
      [0.4, 'rgba(255,170,90,0.7)'],
      [1, 'rgba(255,120,40,0)']
    ])
    const blobTex = makeRadialTexture(256, [
      [0, 'rgba(255,255,255,0.85)'],
      [0.5, 'rgba(255,255,255,0.28)'],
      [1, 'rgba(255,255,255,0)']
    ])
    texAssets.push(starTex, glowTex, blobTex)

    // ---- star (faint distant) ----
    const star = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starTex, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }))
    star.position.copy(STAR_POS)
    star.scale.setScalar(11)
    const starStreak = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starTex, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffe8cc
    }))
    starStreak.position.copy(STAR_POS)
    starStreak.scale.set(42, 2.6, 1)
    scene.add(star, starStreak)

    // ---- starfield base + galactic band + far galaxies ----
    const starVerts = new Float32Array(3000 * 3)
    for (let i = 0; i < 3000; i++) {
      const v = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(200 + Math.random() * 500)
      starVerts[i * 3] = v.x
      starVerts[i * 3 + 1] = v.y
      starVerts[i * 3 + 2] = v.z
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starVerts, 3))
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.55, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
    const starsBase = new THREE.Points(starGeo, starMat)
    scene.add(starsBase)

    const bandVerts = new Float32Array(2000 * 3)
    const bandTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0.2))
    for (let i = 0; i < 2000; i++) {
      const v = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(350 + Math.random() * 300)
      v.y *= 0.12
      v.applyQuaternion(bandTilt)
      bandVerts[i * 3] = v.x
      bandVerts[i * 3 + 1] = v.y
      bandVerts[i * 3 + 2] = v.z
    }
    const bandGeo = new THREE.BufferGeometry()
    bandGeo.setAttribute('position', new THREE.BufferAttribute(bandVerts, 3))
    const bandMat = new THREE.PointsMaterial({
      color: 0xbfd4ff, size: 0.7, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
    const band = new THREE.Points(bandGeo, bandMat)
    scene.add(band)

    for (let i = 0; i < 3; i++) {
      const galaxy = new THREE.Sprite(new THREE.SpriteMaterial({
        map: blobTex, color: 0x8899bb, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false
      }))
      galaxy.position
        .copy(new THREE.Vector3().randomDirection())
        .multiplyScalar(600 + Math.random() * 250)
      galaxy.scale.set(24 + Math.random() * 12, 24 + Math.random() * 12, 1)
      scene.add(galaxy)
    }

    // ---- nebulae ----
    const nebulaMats = []
    const nebulaColors = [0x3a2158, 0x163a3f, 0x2a1a4a, 0x402043, 0x14343a]
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.SpriteMaterial({
        map: blobTex, color: nebulaColors[i % nebulaColors.length],
        transparent: true, opacity: 0.08 + Math.random() * 0.05,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
      const nebula = new THREE.Sprite(mat)
      nebula.position
        .copy(new THREE.Vector3().randomDirection())
        .multiplyScalar(320 + Math.random() * 180)
      const s = 35 + Math.random() * 35
      nebula.scale.set(s, s, 1)
      nebula.material.rotation = Math.random() * Math.PI * 2
      scene.add(nebula)
      nebulaMats.push(mat)
    }

    // ---- planet (char-like barren world) ----
    const sunDir = SUN_DIR
    const planetMat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms: { uSunDir: { value: sunDir } }
    })
    const planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 96, 64), planetMat)
    planet.position.copy(PLANET_POS)
    scene.add(planet)

    const rimMat = new THREE.ShaderMaterial({
      vertexShader: RIM_VERT,
      fragmentShader: RIM_FRAG,
      uniforms: {
        uSunDir: { value: sunDir },
        uPlanetPos: { value: PLANET_POS }
      },
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const rim = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * 1.045, 64, 48), rimMat)
    rim.position.copy(PLANET_POS)
    scene.add(rim)

    // ---- Saturn-style ring: fine dust disc + ~2000 flat banded rocks ----
    const rockTex = makeRockTexture()
    texAssets.push(rockTex)
    const rockGeos = [makeRockGeometry(1.7), makeRockGeometry(5.3), makeRockGeometry(9.1)]
    const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.9, metalness: 0.08 })
    const beltGroup = new THREE.Group()
    beltGroup.position.copy(PLANET_POS)
    beltGroup.rotation.x = BELT_TILT
    scene.add(beltGroup)

    const ringTex = makeRingTexture()
    texAssets.push(ringTex)
    const ringDisc = new THREE.Mesh(
      new THREE.RingGeometry(RING_INNER, RING_OUTER, 180, 1),
      new THREE.MeshStandardMaterial({
        map: ringTex, transparent: true, side: THREE.DoubleSide,
        depthWrite: false, roughness: 1, metalness: 0
      })
    )
    ringDisc.rotation.x = -Math.PI / 2
    ringDisc.position.y = -0.2
    beltGroup.add(ringDisc)

    const beltData = []
    for (const band of RING_BANDS) {
      for (let i = 0; i < band.count; i++) {
        const radius = band.inner + Math.random() * (band.outer - band.inner)
        const s = band.sMin + Math.pow(Math.random(), 1.3) * (band.sMax - band.sMin)
        beltData.push({
          angle: Math.random() * Math.PI * 2,
          radius,
          yOff: (Math.random() - 0.5) * 2 * band.thick,
          speed: 0.085 * Math.pow(PLANET_R / radius, 1.5),
          rotX: Math.random() * Math.PI,
          rotY: Math.random() * Math.PI,
          rotSp: { x: 0.1 + Math.random() * 0.5, y: 0.1 + Math.random() * 0.5 },
          scale: {
            x: s * (0.7 + Math.random() * 0.9),
            y: s * (0.16 + Math.random() * 0.3),
            z: s * (0.7 + Math.random() * 0.9)
          }
        })
      }
    }
    const beltMeshes = []
    const beltSlots = [0, 0, 0]
    const _cA = new THREE.Color(0x6e635a)
    const _cB = new THREE.Color(0x9a8d7f)
    for (let gI = 0; gI < 3; gI++) {
      const im = new THREE.InstancedMesh(rockGeos[gI], rockMat, Math.ceil(beltData.length / 3) + 2)
      beltMeshes.push(im)
      beltGroup.add(im)
    }
    for (let i = 0; i < beltData.length; i++) {
      const gI = i % 3
      const k = beltSlots[gI]++
      const sh = 0.55 + Math.random() * 0.5
      beltMeshes[gI].setColorAt(k, new THREE.Color().lerpColors(_cA, _cB, Math.random()).multiplyScalar(sh))
    }
    for (let gI = 0; gI < 3; gI++) {
      beltMeshes[gI].count = beltSlots[gI]
      beltMeshes[gI].instanceColor.needsUpdate = true
    }

    const beltDummy = new THREE.Object3D()
    const beltTiltQuat = beltGroup.quaternion.clone()
    function beltRockWorld(elapsed, idx, out) {
      const d = beltData[idx]
      const a = d.angle + elapsed * d.speed
      out.set(Math.cos(a) * d.radius, d.yOff, Math.sin(a) * d.radius)
      out.applyQuaternion(beltTiltQuat)
      out.add(PLANET_POS)
      return out
    }
    function updateBelt(elapsed) {
      let i = 0
      for (let gI = 0; gI < 3; gI++) {
        const im = beltMeshes[gI]
        for (let k = 0; k < beltSlots[gI]; k++, i++) {
          const d = beltData[i]
          const a = d.angle + elapsed * d.speed
          beltDummy.position.set(Math.cos(a) * d.radius, d.yOff, Math.sin(a) * d.radius)
          beltDummy.rotation.set(d.rotX + elapsed * d.rotSp.x, d.rotY + elapsed * d.rotSp.y, 0)
          beltDummy.scale.set(d.scale.x, d.scale.y, d.scale.z)
          beltDummy.updateMatrix()
          im.setMatrixAt(k, beltDummy.matrix)
        }
        im.instanceMatrix.needsUpdate = true
      }
    }

    // ---- teran outpost ----
    const outpost = buildOutpost(texAssets)
    scene.add(outpost.group)
    function updateOutpost(elapsed) {
      outpost.group.position.set(
        55 + Math.sin(elapsed * 0.017) * 4,
        10 + Math.sin(elapsed * 0.023) * 2,
        -50 + Math.cos(elapsed * 0.017) * 4
      )
      outpost.group.rotation.y = Math.sin(elapsed * 0.01) * 0.4
      outpost.ringPivot.rotation.y += 0.05 * CLOCK_DELTA
      outpost.radar.rotation.y += 1.1 * CLOCK_DELTA
      for (let i = 0; i < outpost.blinkers.length; i++) {
        outpost.blinkers[i].emissiveIntensity = 0.4 + 1.8 * Math.pow(Math.max(0, Math.sin(elapsed * 2 + i * 1.7)), 3)
      }
    }

    // ---- dropship squadron ----
    const shipKit = makeShipKit(texAssets)
    const ships = []
    for (let i = 0; i < 5; i++) {
      const ship = makeDropship(shipKit)
      scene.add(ship.group)
      ships.push({ group: ship.group, engineMat: ship.engineMat, flameMat: ship.flameMat, flames: ship.flames, beaconMat: ship.beaconMat, fwd: new THREE.Vector3(0, 0, 1) })
    }
    const _shipPos = new THREE.Vector3()
    const _shipNext = new THREE.Vector3()
    function shipLanePos(elapsed, slot, aOut, posOut) {
      const a = elapsed * 0.05 - slot * 0.5
      const rx = 62 - slot * 1.6
      const rz = 56 - slot * 1.4
      const y = -5 + slot * 2.3 + Math.sin(elapsed * 0.25 + slot * 0.9) * 1.2
      aOut.value = a
      posOut.set(
        PLANET_POS.x + Math.cos(a) * rx,
        PLANET_POS.y + y,
        PLANET_POS.z + Math.sin(a) * rz
      )
      return posOut
    }
    const _a = { value: 0 }
    function updateSquadron(elapsed, delta) {
      for (let i = 0; i < ships.length; i++) {
        const ship = ships[i]
        shipLanePos(elapsed, i, _a, _shipPos)
        const a2 = _a.value + 0.03
        const rx2 = 62 - i * 1.6
        const rz2 = 56 - i * 1.4
        _shipNext.set(
          PLANET_POS.x + Math.cos(a2) * rx2,
          _shipPos.y,
          PLANET_POS.z + Math.sin(a2) * rz2
        )
        ship.group.position.copy(_shipPos)
        ship.group.lookAt(_shipNext)
        ship.group.rotateZ(-(0.22 + 0.12 * Math.sin(elapsed * 0.4 + i * 1.3)))
        ship.fwd.subVectors(_shipNext, _shipPos).normalize()
        ship.engineMat.emissiveIntensity = 0.9 + Math.sin(elapsed * 11 + i * 1.7) * 0.35
        for (const f of ship.flames) {
          f.scale.set(1, 1, 0.7 + 0.45 * (0.5 + 0.5 * Math.sin(elapsed * 13 + i * 1.7)))
        }
        ship.flameMat.opacity = 0.5 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 17 + i * 2.3))
        ship.beaconMat.emissiveIntensity = 0.15 + 2.0 * Math.pow(Math.max(0, Math.sin(elapsed * 2.2 + i * 1.1)), 6)
      }
    }

    // ---- laser bolts ----
    const UP = new THREE.Vector3(0, 1, 0)
    const bolts = []
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 2.8, 6),
        new THREE.MeshBasicMaterial({
          color: 0x8dffe0, transparent: true, opacity: 1,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      )
      mesh.visible = false
      scene.add(mesh)
      bolts.push({
        mesh, pos: new THREE.Vector3(), dir: new THREE.Vector3(),
        target: new THREE.Vector3(), life: 0, active: false
      })
    }
    let boltTimer = 1.0
    function fireBolt(elapsed) {
      const b = bolts.find((x) => !x.active)
      if (!b) return
      const ship = ships[Math.floor(Math.random() * ships.length)]
      b.pos.copy(ship.group.position).addScaledVector(ship.fwd, 6.0)
      beltRockWorld(elapsed, Math.floor(Math.random() * beltData.length), b.target)
      b.dir.subVectors(b.target, b.pos).normalize()
      b.mesh.position.copy(b.pos)
      b.mesh.quaternion.setFromUnitVectors(UP, b.dir)
      b.life = 0
      b.active = true
      b.mesh.visible = true
    }
    function updateBolts(elapsed, delta) {
      boltTimer -= delta
      if (boltTimer <= 0) {
        fireBolt(elapsed)
        boltTimer = 1.2 + Math.random() * 1.3
      }
      for (const b of bolts) {
        if (!b.active) continue
        b.pos.addScaledVector(b.dir, 60 * delta)
        b.life += delta
        b.mesh.position.copy(b.pos)
        if (b.pos.distanceTo(b.target) < 2 || b.life > 1.4) {
          spawnExplosion(b.pos)
          b.active = false
          b.mesh.visible = false
        }
      }
    }

    // ---- explosions (fireball sprite + spark points) ----
    const explosions = []
    const SPARKS = 12
    for (let i = 0; i < 6; i++) {
      const spriteMat = new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffa050
      })
      const sprite = new THREE.Sprite(spriteMat)
      sprite.visible = false
      scene.add(sprite)
      const sparkGeo = new THREE.BufferGeometry()
      sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3))
      const sparkMat = new THREE.PointsMaterial({
        color: 0xffcc88, size: 0.8, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
      })
      const pts = new THREE.Points(sparkGeo, sparkMat)
      pts.visible = false
      scene.add(pts)
      const vels = []
      for (let s = 0; s < SPARKS; s++) vels.push(new THREE.Vector3())
      explosions.push({ sprite, spriteMat, pts, sparkMat, vels, center: new THREE.Vector3(), life: 1, active: false })
    }
    function spawnExplosion(pos) {
      const e = explosions.find((x) => !x.active)
      if (!e) return
      e.active = true
      e.life = 0
      e.center.copy(pos)
      e.sprite.position.copy(pos)
      e.sprite.scale.setScalar(0.6)
      e.spriteMat.opacity = 0.95
      const attr = e.pts.geometry.attributes.position
      for (let s = 0; s < SPARKS; s++) {
        attr.setXYZ(s, pos.x, pos.y, pos.z)
        e.vels[s].randomDirection().multiplyScalar(6 + Math.random() * 9)
      }
      attr.needsUpdate = true
      e.sparkMat.opacity = 1
      e.sprite.visible = true
      e.pts.visible = true
    }
    function updateExplosions(delta) {
      for (const e of explosions) {
        if (!e.active) continue
        e.life += delta / 0.85
        const t = Math.min(e.life, 1)
        e.sprite.scale.setScalar(0.6 + t * 7.4)
        e.spriteMat.opacity = (1 - t) * 0.95
        e.sparkMat.opacity = (1 - t) * 0.9
        const attr = e.pts.geometry.attributes.position
        const p = attr.array
        for (let s = 0; s < SPARKS; s++) {
          p[s * 3] += e.vels[s].x * delta
          p[s * 3 + 1] += e.vels[s].y * delta
          p[s * 3 + 2] += e.vels[s].z * delta
        }
        attr.needsUpdate = true
        if (e.life >= 1) {
          e.active = false
          e.sprite.visible = false
          e.pts.visible = false
        }
      }
    }

    let CLOCK_DELTA = 0.016
    const clock = { last: performance.now() }
    function animate() {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const now = performance.now()
      CLOCK_DELTA = Math.min((now - clock.last) / 1000, 0.05)
      clock.last = now
      const elapsed = clock.last / 1000

      orbit.autoRotate = autoRotate.value
      planet.rotation.y = elapsed * 0.008
      updateBelt(elapsed)
      updateOutpost(elapsed)
      updateSquadron(elapsed, CLOCK_DELTA)
      updateBolts(elapsed, CLOCK_DELTA)
      updateExplosions(CLOCK_DELTA)
      for (const m of nebulaMats) m.rotation += CLOCK_DELTA * 0.01
      orbit.update()
      renderer.render(scene, camera)
    }
    animate()

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
  }

  function dispose() {
    disposed = true
    cancelAnimationFrame(frame)
    dispose.onCleanup?.()
    if (!scene) return
    stopCameraMove?.()
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
