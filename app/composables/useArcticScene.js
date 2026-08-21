import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { useCameraMove } from './useCameraMove'

const WATER_Y = -1.4
const SAFE_H = -0.35
// lagoon ellipse
const LG_RX = 42
const LG_RZ = 68

// ---------- terrain ----------

function terrainBase(x, z) {
  const n =
    Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038 - 0.7) * 0.5 +
    Math.sin(x * 0.11 + z * 0.07) * 0.27 +
    Math.cos(x * 0.23 - z * 0.17) * 0.13 +
    Math.sin(x * 0.47 + 2.1 + z * 0.31) * 0.1
  return n * 9 + 4.5 // ~ -4.5 .. 13.5
}

function basinFactor(x, z) {
  const e = (x / LG_RX) * (x / LG_RX) + (z / LG_RZ) * (z / LG_RZ)
  return 1 - THREE.MathUtils.smoothstep(e, 0.35, 1.15)
}

function getHeight(x, z) {
  let h = terrainBase(x, z)
  const m = Math.max(Math.abs(x), Math.abs(z))
  const rimT = THREE.MathUtils.smoothstep(m, 80, 118)
  h += rimT * (7 + 5 * Math.sin(x * 0.07) * Math.cos(z * 0.05))
  const bf = basinFactor(x, z)
  if (bf > 0) {
    const bed = -8.5 + 1.8 * Math.sin(x * 0.09 + 1.0) * Math.cos(z * 0.07 - 0.4)
    h = h * (1 - bf) + bed * bf
  }
  return h
}

function inLagoon(x, z, margin = 0) {
  const e = ((x - 0) / (LG_RX + margin)) * ((x - 0) / (LG_RX + margin)) +
    ((z - 0) / (LG_RZ + margin)) * ((z - 0) / (LG_RZ + margin))
  return e < 1
}

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

function makeTileTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  return tex
}

// seamless radial-blob painter (drawn with wrap offsets so tiles match)
function tileBlobs(ctx, size, n, rMin, rMax, colors) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = rMin + Math.random() * (rMax - rMin)
    const col = colors[i % colors.length]
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
        g.addColorStop(0, col)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2)
      }
    }
  }
}

function tileStreaks(ctx, size, n, color, wMin, wMax, lenMin, lenMax) {
  ctx.strokeStyle = color
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const len = lenMin + Math.random() * (lenMax - lenMin)
    const dy = (Math.random() - 0.5) * 6
    ctx.lineWidth = wMin + Math.random() * (wMax - wMin)
    for (const ox of [-size, 0, size]) {
      ctx.beginPath()
      ctx.moveTo(x + ox, y)
      ctx.lineTo(x + ox + len, y + dy)
      ctx.stroke()
    }
  }
}

function tileCracks(ctx, size, n, color, wMin, wMax, steps = 6, step = 26) {
  ctx.strokeStyle = color
  for (let i = 0; i < n; i++) {
    const pts = []
    let x = 30 + Math.random() * (size - 60)
    let y = 30 + Math.random() * (size - 60)
    for (let s = 0; s <= steps; s++) {
      pts.push([x, y])
      x += (Math.random() - 0.5) * step * 2
      y += (Math.random() - 0.5) * step * 2
    }
    ctx.lineWidth = wMin + Math.random() * (wMax - wMin)
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath()
        for (let k = 0; k < pts.length; k++) {
          if (k) ctx.lineTo(pts[k][0] + ox, pts[k][1] + oy)
          else ctx.moveTo(pts[k][0] + ox, pts[k][1] + oy)
        }
        ctx.stroke()
      }
    }
  }
}

// ---------- canvas textures ----------

function makeSnowGroundTexture(repeat) {
  return makeTileTexture(256, (ctx, s) => {
    ctx.fillStyle = '#dfeaf4'
    ctx.fillRect(0, 0, s, s)
    tileBlobs(ctx, s, 26, 18, 55, ['rgba(255,255,255,0.10)', 'rgba(125,155,190,0.07)'])
    tileStreaks(ctx, s, 70, 'rgba(130,160,195,0.10)', 0.5, 1.6, 20, 70)
    tileBlobs(ctx, s, 90, 0.6, 1.6, ['rgba(90,120,155,0.16)', 'rgba(255,255,255,0.2)'])
  }, repeat)
}

function makeIceTexture() {
  return makeTileTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s)
    g.addColorStop(0, '#e8f6fe')
    g.addColorStop(0.5, '#c2e4f4')
    g.addColorStop(1, '#9ccbe4')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    tileBlobs(ctx, s, 34, 10, 42, ['rgba(255,255,255,0.28)', 'rgba(60,130,180,0.14)', 'rgba(140,200,235,0.2)'])
    tileCracks(ctx, s, 10, 'rgba(25,70,110,0.30)', 0.7, 1.8)
    tileCracks(ctx, s, 6, 'rgba(255,255,255,0.4)', 0.4, 0.9)
  }, 2)
}

function makePackIceTexture() {
  return makeTileTexture(256, (ctx, s) => {
    ctx.fillStyle = '#f0f7fc'
    ctx.fillRect(0, 0, s, s)
    tileBlobs(ctx, s, 24, 12, 48, ['rgba(255,255,255,0.5)', 'rgba(130,180,215,0.12)'])
    tileCracks(ctx, s, 14, 'rgba(60,110,150,0.4)', 0.6, 1.6)
  }, 1)
}

function makeMoonTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  const cx = s / 2, cy = s / 2, R = s / 2 - 2
  const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R * 1.15)
  g.addColorStop(0, '#f6f9fd')
  g.addColorStop(0.55, '#dbe6f2')
  g.addColorStop(0.85, '#b8c8da')
  g.addColorStop(1, '#93a5bc')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.clip()
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2
    const d = Math.random() * R * 0.55
    const x = cx + Math.cos(a) * d
    const y = cy + Math.sin(a) * d
    const r = R * (0.12 + Math.random() * 0.2)
    const mg = ctx.createRadialGradient(x, y, 0, x, y, r)
    mg.addColorStop(0, 'rgba(110,130,158,0.30)')
    mg.addColorStop(1, 'rgba(110,130,158,0)')
    ctx.fillStyle = mg
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 42; i++) {
    const a = Math.random() * Math.PI * 2
    const d = Math.sqrt(Math.random()) * R * 0.92
    const x = cx + Math.cos(a) * d
    const y = cy + Math.sin(a) * d
    const r = 2 + Math.random() * 9
    ctx.fillStyle = 'rgba(95,115,142,0.32)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, r, -0.4, 1.6)
    ctx.stroke()
  }
  ctx.restore()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeFurTexture(base, speckA, speckB) {
  return makeTileTexture(128, (ctx, s) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * s
      const y = Math.random() * s
      ctx.strokeStyle = Math.random() > 0.5 ? speckA : speckB
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y + 2 + Math.random() * 3)
      ctx.stroke()
    }
    tileBlobs(ctx, s, 24, 4, 14, [speckB])
  }, 1)
}

function makeIglooTexture() {
  return makeTileTexture(256, (ctx, s) => {
    ctx.fillStyle = '#e4f0f9'
    ctx.fillRect(0, 0, s, s)
    const rowH = 32
    for (let row = 0; row < s / rowH; row++) {
      const y = row * rowH
      const shade = row % 2 ? 'rgba(150,185,215,0.16)' : 'rgba(255,255,255,0.14)'
      ctx.fillStyle = shade
      ctx.fillRect(0, y, s, rowH)
      ctx.strokeStyle = 'rgba(105,150,190,0.55)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(s, y)
      ctx.stroke()
      const off = row % 2 ? 32 : 0
      ctx.strokeStyle = 'rgba(105,150,190,0.4)'
      ctx.lineWidth = 1.5
      for (let x = off; x < s + 32; x += 64) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + rowH)
        ctx.stroke()
      }
    }
    tileBlobs(ctx, s, 30, 6, 26, ['rgba(255,255,255,0.25)', 'rgba(120,160,200,0.12)'])
  }, 3)
}

function makeTentTexture() {
  return makeTileTexture(128, (ctx, s) => {
    ctx.fillStyle = '#d3e2ee'
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = 'rgba(90,125,155,0.4)'
    ctx.lineWidth = 2
    for (let x = 0; x <= s; x += 32) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, s)
      ctx.stroke()
    }
    tileBlobs(ctx, s, 18, 8, 26, ['rgba(255,255,255,0.3)', 'rgba(100,130,160,0.14)'])
    tileCracks(ctx, s, 4, 'rgba(70,100,130,0.25)', 0.5, 1, 4, 18)
  }, 1)
}

function makeWoodTexture() {
  return makeTileTexture(128, (ctx, s) => {
    ctx.fillStyle = '#8a6a4c'
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 46; i++) {
      const y = Math.random() * s
      ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(60,42,28,0.35)' : 'rgba(190,155,120,0.3)'
      ctx.lineWidth = 0.8 + Math.random() * 1.4
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x <= s; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2 + (Math.random() - 0.5) * 2)
      }
      ctx.stroke()
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * s
      const y = Math.random() * s
      ctx.strokeStyle = 'rgba(50,35,22,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(x, y, 4, 7, Math.random() * 0.6, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, 1)
}

// ---------- shaders ----------

const WATER_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  vec3 pos = position;
  float h = 0.0;
  float dhx = 0.0;
  float dhz = 0.0;
  {
    vec2 d = vec2(0.9, 0.3); float f = 0.05; float sp = 0.7; float amp = 0.22;
    float p = dot(pos.xz, d) * f + uTime * sp;
    h += amp * sin(p); dhx += amp * f * d.x * cos(p); dhz += amp * f * d.y * cos(p);
  }
  {
    vec2 d = vec2(0.4, 0.9); float f = 0.08; float sp = 1.0; float amp = 0.14;
    float p = dot(pos.xz, d) * f - uTime * sp;
    h += amp * sin(p); dhx += amp * f * d.x * cos(p); dhz += amp * f * d.y * cos(p);
  }
  {
    vec2 d = vec2(0.7, -0.7); float f = 0.16; float sp = 1.5; float amp = 0.05;
    float p = dot(pos.xz, d) * f + uTime * sp;
    h += amp * sin(p); dhx += amp * f * d.x * cos(p); dhz += amp * f * d.y * cos(p);
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
uniform vec3 uMoonDir;
uniform vec3 uAuroraDir;
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 N = normalize(vNormalW);
  float fres = pow(1.0 - abs(dot(N, V)), 3.0);
  vec3 col = uDeep;
  col = mix(col, vec3(0.35, 0.5, 0.62), fres * 0.65);
  vec3 R = reflect(-normalize(uMoonDir), N);
  float spec = pow(max(dot(R, V), 0.0), 180.0) * 1.6;
  float glint = pow(max(dot(R, V), 0.0), 20.0) * 0.1;
  col += vec3(0.75, 0.85, 1.0) * (spec + glint);
  vec3 Ra = reflect(-normalize(uAuroraDir), N);
  float specA = pow(max(dot(Ra, V), 0.0), 90.0);
  col += vec3(0.12, 0.85, 0.5) * specA * 0.5;
  float r = length(vWorldPos.xz / vec2(75.0, 110.0));
  float edge = 1.0 - smoothstep(0.78, 1.0, r);
  gl_FragColor = vec4(col, 0.88 * edge);
}
`

const AURORA_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 pos = position;
  pos.y += sin(uv.x * 18.0 + uTime * 0.25 + uv.y * 2.0) * (1.5 + uv.y * 3.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const AURORA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
float hash1(float p) { return fract(sin(p * 127.1) * 43758.5453); }
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash1(i), hash1(i + 1.0), u);
}
float fbm1(float x) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise1(x);
    x = x * 2.13 + 17.0;
    a *= 0.5;
  }
  return v;
}
void main() {
  float n1 = fbm1(vUv.x * 6.0 + uTime * 0.12);
  float n2 = fbm1(vUv.x * 14.0 - uTime * 0.2 + 43.0);
  float curtain = 0.45 + 0.55 * n1;
  curtain *= 0.7 + 0.3 * n2;
  float v = vUv.y;
  float falloff = smoothstep(0.0, 0.18, v) * pow(1.0 - v, 1.5);
  vec3 green = vec3(0.16, 1.0, 0.55);
  vec3 teal = vec3(0.23, 1.0, 0.78);
  vec3 purple = vec3(0.6, 0.28, 1.0);
  vec3 col = mix(green, teal, smoothstep(0.0, 0.55, v));
  col = mix(col, purple, smoothstep(0.55, 1.0, v) * 0.8);
  float b = curtain * falloff * uIntensity;
  gl_FragColor = vec4(col * b, b * 0.7);
}
`

// ---------- animals ----------

// Lofted body: sweeps elliptical cross-sections (x = forward) into one
// closed polygon mesh with end caps and UVs. Sections: { x, cy, ry, rz }.
function makeLoft(sections, seg = 10) {
  const n = sections.length
  const positions = []
  const uvs = []
  const index = []
  const minX = sections[0].x
  const maxX = sections[n - 1].x
  const span = Math.max(maxX - minX, 0.0001)
  for (let si = 0; si < n; si++) {
    const s = sections[si]
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2
      positions.push(s.x, s.cy + s.ry * Math.sin(a), s.rz * Math.cos(a))
      uvs.push((s.x - minX) / span, k / seg)
    }
  }
  for (let si = 0; si < n - 1; si++) {
    for (let k = 0; k < seg; k++) {
      const a = si * seg + k
      const b = si * seg + (k + 1) % seg
      const d = (si + 1) * seg + k
      const c = (si + 1) * seg + (k + 1) % seg
      index.push(a, d, c, a, c, b)
    }
  }
  const addCap = (si, dir) => {
    const s = sections[si]
    const base = positions.length / 3
    positions.push(s.x, s.cy, 0)
    uvs.push(dir > 0 ? 1 : 0, 0.5)
    const ring = si * seg
    for (let k = 0; k < seg; k++) {
      const v0 = ring + k
      const v1 = ring + (k + 1) % seg
      if (dir > 0) index.push(base, v1, v0)
      else index.push(base, v0, v1)
    }
  }
  addCap(0, -1)
  addCap(n - 1, 1)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

function makeBear(kit) {
  const g = new THREE.Group()
  const { fur: furMat, dark } = kit
  // one sculpted body: rump -> shoulder hump -> chest -> neck -> head -> snout
  const body = new THREE.Mesh(makeLoft([
    { x: -0.9, cy: 0.92, ry: 0.26, rz: 0.24 },
    { x: -0.6, cy: 0.97, ry: 0.40, rz: 0.36 },
    { x: -0.25, cy: 1.02, ry: 0.48, rz: 0.44 },
    { x: 0.15, cy: 1.10, ry: 0.52, rz: 0.48 },
    { x: 0.45, cy: 1.02, ry: 0.46, rz: 0.42 },
    { x: 0.7, cy: 1.06, ry: 0.33, rz: 0.31 },
    { x: 0.9, cy: 1.22, ry: 0.27, rz: 0.26 },
    { x: 1.1, cy: 1.30, ry: 0.24, rz: 0.23 },
    { x: 1.3, cy: 1.25, ry: 0.15, rz: 0.15 },
    { x: 1.5, cy: 1.21, ry: 0.06, rz: 0.07 }
  ], 12), furMat)
  g.add(body)
  // small accents only: ears, eyes, nose
  const earGeo = new THREE.ConeGeometry(0.09, 0.13, 6)
  const earL = new THREE.Mesh(earGeo, furMat)
  earL.position.set(0.98, 1.5, 0.16)
  earL.rotation.z = -0.3
  const earR = earL.clone()
  earR.position.z = -0.16
  earR.rotation.z = 0.3
  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6)
  const eyeL = new THREE.Mesh(eyeGeo, dark)
  eyeL.position.set(1.26, 1.36, 0.14)
  const eyeR = eyeL.clone()
  eyeR.position.z = -0.14
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), dark)
  nose.scale.set(1.15, 0.85, 1.05)
  nose.position.set(1.52, 1.22, 0)
  g.add(earL, earR, eyeL, eyeR, nose)
  // legs: one lofted column each, foot flattened
  const legGeo = makeLoft([
    { x: 0, cy: 0, ry: 0.17, rz: 0.17 },
    { x: 0.3, cy: 0, ry: 0.135, rz: 0.14 },
    { x: 0.55, cy: 0, ry: 0.12, rz: 0.13 },
    { x: 0.72, cy: 0, ry: 0.11, rz: 0.15 }
  ], 8)
  legGeo.rotateZ(-Math.PI / 2)
  const legs = []
  const pawGeo = new THREE.SphereGeometry(0.14, 8, 6)
  for (const [sx, sz] of [[0.55, 0.34], [0.55, -0.34], [-0.55, 0.34], [-0.55, -0.34]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx, 0.83, sz)
    const leg = new THREE.Mesh(legGeo, furMat)
    const paw = new THREE.Mesh(pawGeo, furMat)
    paw.scale.set(1.2, 0.5, 1.35)
    paw.position.set(0.05, -0.8, 0)
    pivot.add(leg, paw)
    g.add(pivot)
    legs.push(pivot)
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), furMat)
  tail.position.set(-0.92, 0.9, 0)
  g.add(tail)
  g.traverse((c) => { if (c.isMesh) c.castShadow = true })
  return { group: g, legs }
}

function makeFox(kit) {
  const g = new THREE.Group()
  const { fur: furMat, dark } = kit
  // one sculpted body: haunches -> spine -> chest -> rising neck -> head -> pointed snout
  const body = new THREE.Mesh(makeLoft([
    { x: -0.55, cy: 0.40, ry: 0.15, rz: 0.14 },
    { x: -0.3, cy: 0.44, ry: 0.20, rz: 0.19 },
    { x: 0.0, cy: 0.46, ry: 0.22, rz: 0.20 },
    { x: 0.3, cy: 0.44, ry: 0.20, rz: 0.18 },
    { x: 0.48, cy: 0.50, ry: 0.14, rz: 0.14 },
    { x: 0.65, cy: 0.58, ry: 0.12, rz: 0.12 },
    { x: 0.82, cy: 0.58, ry: 0.11, rz: 0.10 },
    { x: 1.0, cy: 0.55, ry: 0.065, rz: 0.055 },
    { x: 1.12, cy: 0.545, ry: 0.028, rz: 0.03 }
  ], 10), furMat)
  g.add(body)
  // accents: ears (fur + dark inner), eyes, nose
  const earGeo = new THREE.ConeGeometry(0.06, 0.15, 6)
  const innerGeo = new THREE.ConeGeometry(0.035, 0.09, 5)
  const earL = new THREE.Mesh(earGeo, furMat)
  earL.position.set(0.6, 0.73, 0.08)
  earL.rotation.z = -0.25
  const earR = earL.clone()
  earR.position.z = -0.08
  earR.rotation.z = 0.25
  const innerL = new THREE.Mesh(innerGeo, dark)
  innerL.position.set(0.615, 0.72, 0.095)
  innerL.rotation.z = -0.25
  const innerR = innerL.clone()
  innerR.position.z = -0.095
  innerR.rotation.z = 0.25
  const eyeGeo = new THREE.SphereGeometry(0.028, 8, 6)
  const eyeL = new THREE.Mesh(eyeGeo, dark)
  eyeL.position.set(0.84, 0.63, 0.08)
  const eyeR = eyeL.clone()
  eyeR.position.z = -0.08
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), dark)
  nose.position.set(1.13, 0.55, 0)
  g.add(earL, earR, innerL, innerR, eyeL, eyeR, nose)
  // tail: one lofted plume (base -> fluffy bulge -> taper) with dark tip, wags at base
  const tail = new THREE.Group()
  const tailMesh = new THREE.Mesh(makeLoft([
    { x: 0, cy: 0, ry: 0.13, rz: 0.12 },
    { x: -0.22, cy: 0, ry: 0.145, rz: 0.13 },
    { x: -0.4, cy: 0, ry: 0.11, rz: 0.10 },
    { x: -0.55, cy: 0, ry: 0.06, rz: 0.055 },
    { x: -0.62, cy: 0, ry: 0.025, rz: 0.025 }
  ], 8), furMat)
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark)
  tailTip.position.set(-0.6, 0, 0)
  tail.add(tailMesh, tailTip)
  tail.position.set(-0.48, 0.42, 0)
  tail.rotation.z = 0.45
  g.add(tail)
  // legs: thin lofted columns
  const legGeo = makeLoft([
    { x: 0, cy: 0, ry: 0.06, rz: 0.06 },
    { x: 0.18, cy: 0, ry: 0.045, rz: 0.048 },
    { x: 0.28, cy: 0, ry: 0.04, rz: 0.055 }
  ], 8)
  legGeo.rotateZ(-Math.PI / 2)
  const legs = []
  for (const [sx, sz] of [[0.38, 0.13], [0.38, -0.13], [-0.35, 0.14], [-0.35, -0.14]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx, 0.3, sz)
    pivot.add(new THREE.Mesh(legGeo, furMat))
    g.add(pivot)
    legs.push(pivot)
  }
  g.traverse((c) => { if (c.isMesh) c.castShadow = true })
  return { group: g, legs, tail }
}

function makeReindeer(withAntlers, kit) {
  const g = new THREE.Group()
  const { fur: furMat, dark, antler } = kit
  // one sculpted body: haunches -> long back -> rising neck -> head -> long snout
  const body = new THREE.Mesh(makeLoft([
    { x: -0.72, cy: 1.04, ry: 0.28, rz: 0.25 },
    { x: -0.4, cy: 1.08, ry: 0.33, rz: 0.29 },
    { x: -0.05, cy: 1.10, ry: 0.35, rz: 0.31 },
    { x: 0.28, cy: 1.12, ry: 0.33, rz: 0.29 },
    { x: 0.52, cy: 1.20, ry: 0.24, rz: 0.21 },
    { x: 0.7, cy: 1.38, ry: 0.17, rz: 0.15 },
    { x: 0.85, cy: 1.58, ry: 0.15, rz: 0.14 },
    { x: 1.0, cy: 1.65, ry: 0.13, rz: 0.11 },
    { x: 1.2, cy: 1.61, ry: 0.085, rz: 0.075 },
    { x: 1.38, cy: 1.595, ry: 0.04, rz: 0.045 }
  ], 12), furMat)
  g.add(body)
  // accents: ears, eyes, nose
  const earGeo = new THREE.ConeGeometry(0.07, 0.16, 6)
  const innerGeo = new THREE.ConeGeometry(0.045, 0.1, 5)
  const earL = new THREE.Mesh(earGeo, furMat)
  earL.position.set(0.88, 1.8, 0.13)
  earL.rotation.z = -0.7
  const earR = earL.clone()
  earR.position.z = -0.13
  earR.rotation.z = 0.7
  const innerL = new THREE.Mesh(innerGeo, dark)
  innerL.position.set(0.9, 1.79, 0.15)
  innerL.rotation.z = -0.7
  const innerR = innerL.clone()
  innerR.position.z = -0.15
  innerR.rotation.z = 0.7
  const eyeGeo = new THREE.SphereGeometry(0.028, 8, 6)
  const eyeL = new THREE.Mesh(eyeGeo, dark)
  eyeL.position.set(1.06, 1.72, 0.1)
  const eyeR = eyeL.clone()
  eyeR.position.z = -0.1
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), dark)
  nose.position.set(1.4, 1.6, 0)
  g.add(earL, earR, innerL, innerR, eyeL, eyeR, nose)
  if (withAntlers) {
    const mainGeo = new THREE.CylinderGeometry(0.02, 0.04, 0.85, 6)
    const tines = [
      { geo: new THREE.CylinderGeometry(0.015, 0.028, 0.38, 5), pos: [0.14, 0.5, 0], rot: -0.95 },
      { geo: new THREE.CylinderGeometry(0.012, 0.022, 0.3, 5), pos: [-0.1, 0.55, 0], rot: 0.75 },
      { geo: new THREE.CylinderGeometry(0.01, 0.018, 0.24, 5), pos: [0.06, 0.68, 0], rot: -0.65 }
    ]
    for (const side of [1, -1]) {
      const branch = new THREE.Group()
      branch.position.set(0.92, 1.82, side * 0.11)
      branch.rotation.z = -0.2
      branch.rotation.x = side * 0.25
      const main = new THREE.Mesh(mainGeo, antler)
      main.position.y = 0.42
      branch.add(main)
      for (const t of tines) {
        const tine = new THREE.Mesh(t.geo, antler)
        tine.position.set(...t.pos)
        tine.rotation.z = t.rot
        branch.add(tine)
      }
      g.add(branch)
    }
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), furMat)
  tail.position.set(-0.74, 1.12, 0)
  g.add(tail)
  // legs: long thin lofted columns with dark hooves
  const legGeo = makeLoft([
    { x: 0, cy: 0, ry: 0.095, rz: 0.095 },
    { x: 0.45, cy: 0, ry: 0.07, rz: 0.07 },
    { x: 0.7, cy: 0, ry: 0.055, rz: 0.06 },
    { x: 0.8, cy: 0, ry: 0.05, rz: 0.07 }
  ], 8)
  legGeo.rotateZ(-Math.PI / 2)
  const hoofGeo = new THREE.CylinderGeometry(0.05, 0.058, 0.1, 6)
  const legs = []
  for (const [sx, sz] of [[0.45, 0.18], [0.45, -0.18], [-0.5, 0.18], [-0.5, -0.18]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx, 0.85, sz)
    const leg = new THREE.Mesh(legGeo, furMat)
    const hoof = new THREE.Mesh(hoofGeo, dark)
    hoof.position.y = -0.8
    pivot.add(leg, hoof)
    g.add(pivot)
    legs.push(pivot)
  }
  g.traverse((c) => { if (c.isMesh) c.castShadow = true })
  return { group: g, legs }
}

// ---------- structures ----------

function buildIgloo(iglooMat, doorMat) {
  const g = new THREE.Group()
  const shell = new THREE.Mesh(new THREE.SphereGeometry(2.1, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), iglooMat)
  g.add(shell)
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.9), doorMat)
  door.position.set(0, 0.375, 2.0)
  g.add(door)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.55), iglooMat)
  lintel.position.set(0, 0.82, 1.95)
  lintel.rotation.x = -0.5
  g.add(lintel)
  // snow skirt around the base
  const skirt = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.16, 6, 18), iglooMat)
  skirt.rotation.x = Math.PI / 2
  skirt.position.y = 0.05
  g.add(skirt)
  g.traverse((c) => { if (c.isMesh) c.castShadow = true })
  return g
}

function buildTent(tentMat, doorMat) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.7, 4), tentMat)
  body.rotation.y = Math.PI / 4
  body.position.y = 0.85
  g.add(body)
  // slanted dark entrance on the +Z face
  const door = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.9, 4), doorMat)
  door.rotation.y = Math.PI / 4
  door.position.set(0, 0.45, 0.7)
  g.add(door)
  // snow patch on the roof
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), tentMat)
  cap.scale.set(1.3, 0.4, 1.3)
  cap.position.y = 1.55
  g.add(cap)
  g.traverse((c) => { if (c.isMesh) c.castShadow = true })
  return g
}

function buildSled(woodMat) {
  const g = new THREE.Group()
  const runnerGeo = new THREE.BoxGeometry(2.2, 0.07, 0.12)
  for (const z of [-0.32, 0.32]) {
    const r = new THREE.Mesh(runnerGeo, woodMat)
    r.position.set(0, 0.08, z)
    g.add(r)
    const curl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.12), woodMat)
    curl.position.set(1.1, 0.18, z)
    curl.rotation.z = -0.5
    g.add(curl)
  }
  for (const x of [-0.7, -0.1, 0.5]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.76), woodMat)
    s.position.set(x, 0.24, 0)
    g.add(s)
  }
  g.traverse((c) => { if (c.isMesh) c.castShadow = true })
  return g
}

// ---------- trees ----------

function makeSeededRand(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

// Merged "real-branch pine": lofted tapered trunk + whorls of lofted drooping
// branches (needles) with a snow loft riding on every other branch.
// Returns three merged geometries (wood / needles / snow) for instancing.
function buildPineGeos(rand) {
  const wood = []
  const needles = []
  const snow = []
  const X = new THREE.Vector3(1, 0, 0)

  // trunk: loft along +X, then stand it up
  const trunk = makeLoft([
    { x: 0, cy: 0, ry: 0.17, rz: 0.17 },
    { x: 0.9, cy: 0, ry: 0.125, rz: 0.125 },
    { x: 1.9, cy: 0, ry: 0.095, rz: 0.095 },
    { x: 2.8, cy: 0, ry: 0.07, rz: 0.07 },
    { x: 3.5, cy: 0.02, ry: 0.05, rz: 0.05 }
  ], 6)
  trunk.rotateZ(-Math.PI / 2)
  wood.push(trunk)

  const loftTo = (sections, q, px, py, pz) => {
    const g = makeLoft(sections, 5)
    g.applyQuaternion(q)
    g.translate(px, py, pz)
    return g
  }

  const addBranch = (y, a, len, droop, baseR, withSnow) => {
    const d = new THREE.Vector3(Math.cos(a), -droop, Math.sin(a)).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(X, d)
    const px = Math.cos(a) * 0.13
    const pz = Math.sin(a) * 0.13
    const sec = (cy, mul) => [
      { x: 0, cy, ry: baseR * mul, rz: baseR * mul },
      { x: len * 0.4, cy, ry: baseR * mul * 0.7, rz: baseR * mul * 0.7 },
      { x: len * 0.75, cy: cy - 0.015, ry: baseR * mul * 0.4, rz: baseR * mul * 0.4 },
      { x: len, cy: cy - 0.04, ry: baseR * mul * 0.12, rz: baseR * mul * 0.12 }
    ]
    needles.push(loftTo(sec(0, 1), q, px, y, pz))
    if (withSnow) snow.push(loftTo(sec(0.035, 0.6), q, px, y, pz))
  }

  const whorls = [
    { y: 1.15, count: 6, len: 1.25, droop: 0.42, r: 0.075 },
    { y: 1.62, count: 6, len: 1.05, droop: 0.4, r: 0.068 },
    { y: 2.08, count: 6, len: 0.85, droop: 0.38, r: 0.06 },
    { y: 2.5, count: 5, len: 0.65, droop: 0.36, r: 0.05 },
    { y: 2.88, count: 4, len: 0.45, droop: 0.34, r: 0.04 }
  ]
  for (const w of whorls) {
    const yaw = rand() * Math.PI * 2
    for (let b = 0; b < w.count; b++) {
      const a = yaw + (b / w.count) * Math.PI * 2 + rand() * 0.5
      const len = w.len * (0.85 + rand() * 0.3)
      addBranch(w.y, a, len, w.droop * (0.8 + rand() * 0.4), w.r, b % 2 === 0)
    }
  }

  const tip = makeLoft([
    { x: 0, cy: 0, ry: 0.09, rz: 0.09 },
    { x: 0.5, cy: 0, ry: 0.05, rz: 0.05 },
    { x: 0.85, cy: 0, ry: 0.015, rz: 0.015 }
  ], 5)
  tip.rotateZ(-Math.PI / 2)
  tip.translate(0, 3.1, 0)
  needles.push(tip)
  const tipSnow = makeLoft([
    { x: 0, cy: 0.045, ry: 0.06, rz: 0.06 },
    { x: 0.4, cy: 0.04, ry: 0.035, rz: 0.035 },
    { x: 0.7, cy: 0.03, ry: 0.012, rz: 0.012 }
  ], 5)
  tipSnow.rotateZ(-Math.PI / 2)
  tipSnow.translate(0, 3.05, 0)
  snow.push(tipSnow)

  return {
    wood: mergeGeometries(wood, false),
    needles: mergeGeometries(needles, false),
    snow: mergeGeometries(snow, false)
  }
}

// ---------- scene ----------

export function useArcticScene(containerRef) {
  let renderer, scene, camera, orbit, frame, stopCameraMove
  let disposed = false
  const autoRotate = ref(true)
  const texAssets = []

  let icebergs = []
  let packIce = []
  let auroraGroup = null
  let snowPts = null
  let waterMat = null
  let fireLight = null
  const flames = []
  const smokes = []

  // animals (all built facing +X)
  const bears = []
  const foxes = []
  const reindeer = []
  const occupiedSpots = []

  function toggleAutoRotate() {
    autoRotate.value = !autoRotate.value
  }

  function pickDryTarget(a, xMax) {
    let x = 0
    let z = 0
    let attempts = 0
    do {
      x = (Math.random() - 0.5) * xMax * 2
      z = (Math.random() - 0.5) * xMax * 2
      attempts++
    } while (
      attempts < 60 &&
      (inLagoon(x, z, 6) || getHeight(x, z) < SAFE_H + 0.4 || getHeight(x, z) > 9)
    )
    a.target.set(x, getHeight(x, z), z)
  }

  function findDrySpot(placed, xMax, minDist) {
    for (let attempts = 0; attempts < 300; attempts++) {
      const x = (Math.random() - 0.5) * xMax * 2
      const z = (Math.random() - 0.5) * xMax * 2
      const h = getHeight(x, z)
      if (inLagoon(x, z, 6) || h < SAFE_H + 0.5 || h > 9) continue
      if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < minDist)) continue
      if (occupiedSpots.some((q) => Math.hypot(q.x - x, q.z - z) < 5)) continue
      return { x, z, h }
    }
    // fallback: walk outward from origin until dry
    let x = 10
    let z = 0
    for (let r = 10; r < 90; r += 8) {
      x = r
      const h = getHeight(r, 0)
      if (!inLagoon(r, 0, 6) && h > SAFE_H + 0.5 && h < 9) break
    }
    return { x, z, h: getHeight(x, z) }
  }

  function findNearDry(bx, bz, dMin, dMax) {
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2
      const d = dMin + Math.random() * (dMax - dMin)
      const x = bx + Math.cos(a) * d
      const z = bz + Math.sin(a) * d
      const h = getHeight(x, z)
      if (!inLagoon(x, z, 5) && h > SAFE_H + 0.4 && h < 9) return { x, z, h }
    }
    return null
  }

  function stepToward(a, delta, speed, minH) {
    const dx = a.target.x - a.pos.x
    const dz = a.target.z - a.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist < 1.5) return false
    const nx = a.pos.x + (dx / dist) * speed * delta
    const nz = a.pos.z + (dz / dist) * speed * delta
    const nh = getHeight(nx, nz)
    if (a.pos.y >= minH && nh < minH) return false
    a.pos.set(nx, getHeight(nx, nz), nz)
    return true
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
    renderer.toneMappingExposure = 1.1
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x060a14)
    scene.fog = new THREE.FogExp2(0x0a1220, 0.0038)
    camera = new THREE.PerspectiveCamera(58, width / height, 0.3, 800)
    camera.position.set(6, 15, 62)

    orbit = new OrbitControls(camera, renderer.domElement)
    orbit.target.set(0, -0.5, -8)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.05
    orbit.minDistance = 10
    orbit.maxDistance = 220
    orbit.maxPolarAngle = Math.PI / 2.08
    orbit.autoRotateSpeed = 0.12
    stopCameraMove = useCameraMove(camera, orbit, 20)

    // ---- lights ----
    const moonDir = new THREE.Vector3(-0.55, 0.62, -0.56).normalize()
    const moonLight = new THREE.DirectionalLight(0xa8c4ee, 1.15)
    moonLight.position.copy(moonDir).multiplyScalar(120)
    moonLight.castShadow = true
    moonLight.shadow.mapSize.set(2048, 2048)
    moonLight.shadow.camera.left = -70
    moonLight.shadow.camera.right = 70
    moonLight.shadow.camera.top = 70
    moonLight.shadow.camera.bottom = -70
    moonLight.shadow.camera.near = 1
    moonLight.shadow.camera.far = 400
    scene.add(moonLight)
    scene.add(new THREE.AmbientLight(0x22334a, 0.7))
    scene.add(new THREE.HemisphereLight(0x1e4a44, 0x7a8898, 0.55))

    // ---- moon (cratered disc + glow) + stars ----
    const moonGlowTex = makeRadialTexture(128, [
      [0, 'rgba(255,255,255,1)'],
      [0.55, 'rgba(220,232,255,0.9)'],
      [0.7, 'rgba(180,200,240,0.25)'],
      [1, 'rgba(160,180,230,0)']
    ])
    const moonDiscTex = makeMoonTexture()
    texAssets.push(moonGlowTex, moonDiscTex)
    {
      const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: moonGlowTex, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false
      }))
      moonGlow.position.copy(moonDir).multiplyScalar(480)
      moonGlow.scale.setScalar(44)
      scene.add(moonGlow)
      const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({
        map: moonDiscTex, transparent: true, depthWrite: false
      }))
      moonDisc.position.copy(moonDir).multiplyScalar(479)
      moonDisc.scale.setScalar(26)
      scene.add(moonDisc)
    }
    {
      const count = 3000
      const pos = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3().randomDirection()
        if (v.y < -0.05) v.y = -v.y
        v.multiplyScalar(300 + Math.random() * 200)
        pos[i * 3] = v.x
        pos[i * 3 + 1] = v.y
        pos[i * 3 + 2] = v.z
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const mat = new THREE.PointsMaterial({
        color: 0xffffff, size: 0.7, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
      scene.add(new THREE.Points(geo, mat))
    }

    // ---- terrain (vertex colors + snow surface texture) ----
    {
      const snowTex = makeSnowGroundTexture(46)
      texAssets.push(snowTex)
      const size = 240
      const segs = 190
      const geo = new THREE.PlaneGeometry(size, size, segs, segs)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position
      const colors = new Float32Array(pos.count * 3)
      const c = new THREE.Color()
      const snowLow = new THREE.Color(0xc4d4e4)
      const snowHigh = new THREE.Color(0xf4f9fd)
      const bedIce = new THREE.Color(0x6aa8cc)
      const shoreIce = new THREE.Color(0xbfe0f2)
      const rock = new THREE.Color(0x4d5866)
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const z = pos.getZ(i)
        const h = getHeight(x, z)
        pos.setY(i, h)
        if (h < WATER_Y - 0.4) {
          c.copy(bedIce)
        } else if (h < WATER_Y + 0.5) {
          c.copy(shoreIce).lerp(snowLow, THREE.MathUtils.smoothstep(h, WATER_Y - 0.4, WATER_Y + 0.5))
        } else {
          c.copy(snowLow).lerp(snowHigh, THREE.MathUtils.clamp(h / 14, 0, 1))
          const n = Math.sin(x * 0.31 + 1.7) * Math.cos(z * 0.27 - 0.8) + Math.sin(x * 0.13 - z * 0.17) * 0.5
          if (n > 0.78 && h > 2.2) {
            c.lerp(rock, THREE.MathUtils.clamp((n - 0.78) * 3, 0, 0.8))
          }
          c.offsetHSL(0, 0, (Math.sin(x * 1.3 + z * 1.1) * 0.5 + 0.5) * 0.035 - 0.017)
        }
        colors[i * 3] = c.r
        colors[i * 3 + 1] = c.g
        colors[i * 3 + 2] = c.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      geo.computeVertexNormals()
      const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.9, metalness: 0.02,
        map: snowTex, bumpMap: snowTex, bumpScale: 0.04
      }))
      terrain.receiveShadow = true
      scene.add(terrain)
    }

    // ---- glacial water (moon + aurora reflections) ----
    waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x0a2233) },
        uMoonDir: { value: moonDir },
        uAuroraDir: { value: new THREE.Vector3(0, 0.27, -1).normalize() }
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    {
      const geo = new THREE.PlaneGeometry(150, 220, 48, 64)
      geo.rotateX(-Math.PI / 2)
      const water = new THREE.Mesh(geo, waterMat)
      water.position.y = WATER_Y
      scene.add(water)
    }

    // ---- icebergs (textured, with submerged ghost) ----
    {
      const iceTex = makeIceTexture()
      texAssets.push(iceTex)
      const iceMat = new THREE.MeshPhysicalMaterial({
        map: iceTex, color: 0xd8effa, roughness: 0.22, metalness: 0,
        transparent: true, opacity: 0.92,
        clearcoat: 0.6, clearcoatRoughness: 0.3,
        emissive: 0x1a4a6a, emissiveIntensity: 0.3,
        flatShading: true
      })
      const ghostMat = new THREE.MeshBasicMaterial({
        color: 0x2a6a9a, transparent: true, opacity: 0.16, depthWrite: false,
        side: THREE.DoubleSide
      })
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2
        const r = 0.25 + Math.random() * 0.55
        const x = Math.cos(a) * LG_RX * 0.78 * Math.sqrt(r)
        const z = Math.sin(a) * LG_RZ * 0.78 * Math.sqrt(r)
        const size = 1.6 + Math.random() * 3.2
        const geo = new THREE.IcosahedronGeometry(size, 1)
        const p = geo.attributes.position
        for (let j = 0; j < p.count; j++) {
          const px = p.getX(j), py = p.getY(j), pz = p.getZ(j)
          const s = 1 + 0.3 * Math.sin(px * 1.7 + py * 2.3) * Math.cos(pz * 2.1)
          p.setXYZ(j, px * s, py * s * 0.75, pz * s)
        }
        geo.computeVertexNormals()
        const ice = new THREE.Mesh(geo, iceMat)
        ice.position.set(x, WATER_Y + size * 0.28, z)
        ice.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4)
        ice.castShadow = true
        scene.add(ice)
        const ghost = new THREE.Mesh(geo, ghostMat)
        ghost.scale.set(1.3, -1.25, 1.3)
        const H = size * 0.78
        ghost.position.set(x, WATER_Y + 0.05 - 1.25 * H, z)
        ghost.rotation.copy(ice.rotation)
        scene.add(ghost)
        icebergs.push({
          mesh: ice,
          ghost,
          ghostBaseY: ghost.position.y,
          baseY: ice.position.y,
          phase: Math.random() * Math.PI * 2,
          bobAmp: 0.15 + Math.random() * 0.25,
          rotSp: (Math.random() - 0.5) * 0.06
        })
      }
    }

    // ---- pack ice near shore ----
    {
      const packTex = makePackIceTexture()
      texAssets.push(packTex)
      const packMat = new THREE.MeshStandardMaterial({
        map: packTex, color: 0xf2f8fc, roughness: 0.5, flatShading: true
      })
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(0.62 + Math.random() * 0.3)
        const x = Math.cos(a) * LG_RX * r
        const z = Math.sin(a) * LG_RZ * r
        const size = 2.5 + Math.random() * 4
        const geo = new THREE.CylinderGeometry(size * 0.9, size, 0.4, 7)
        const ice = new THREE.Mesh(geo, packMat)
        ice.position.set(x, WATER_Y + 0.05, z)
        ice.rotation.y = Math.random() * Math.PI
        scene.add(ice)
        packIce.push({ mesh: ice, phase: Math.random() * Math.PI * 2 })
      }
    }

    // ---- jagged shore ice fringe ----
    {
      const fringeTex = makePackIceTexture()
      texAssets.push(fringeTex)
      const N = 150
      const dummy = new THREE.Object3D()
      const fGeo = new THREE.CylinderGeometry(1, 1.06, 0.32, 6)
      const fp = fGeo.attributes.position
      for (let i = 0; i < fp.count; i++) {
        const x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i)
        const s = 0.8 + 0.4 * Math.sin(x * 5.1 + z * 3.7) * Math.cos(z * 4.3 - x * 2.1)
        fp.setXYZ(i, x * s, y, z * s)
      }
      fGeo.computeVertexNormals()
      const im = new THREE.InstancedMesh(
        fGeo,
        new THREE.MeshStandardMaterial({ map: fringeTex, color: 0xf4fafd, roughness: 0.45, flatShading: true }),
        N
      )
      let placed = 0
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.05
        let rw = 1.1
        for (let r = 0.55; r < 1.9; r += 0.02) {
          if (getHeight(Math.cos(a) * LG_RX * r, Math.sin(a) * LG_RZ * r) > WATER_Y) {
            rw = r
            break
          }
        }
        const x = Math.cos(a) * LG_RX * rw
        const z = Math.sin(a) * LG_RZ * rw
        const s = 0.9 + Math.random() * 2.2
        dummy.position.set(x + (Math.random() - 0.5) * 1.2, WATER_Y + 0.06, z + (Math.random() - 0.5) * 1.2)
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
        dummy.scale.set(s * (0.8 + Math.random() * 0.6), 1, s)
        dummy.updateMatrix()
        im.setMatrixAt(placed++, dummy.matrix)
      }
      im.count = placed
      im.instanceMatrix.needsUpdate = true
      scene.add(im)
    }

    // ---- aurora (3 ribbons) ----
    {
      auroraGroup = new THREE.Group()
      const makeRibbon = (radius, yBase, hgt, arc, intensity) => {
        const segU = 72
        const segV = 10
        const pos = new Float32Array((segU + 1) * (segV + 1) * 3)
        const uv = new Float32Array((segU + 1) * (segV + 1) * 2)
        const idx = []
        for (let ui = 0; ui <= segU; ui++) {
          const u = ui / segU
          const th = Math.PI + (-arc / 2 + arc * u)
          const R = radius + Math.sin(th * 3.1) * 7
          for (let vi = 0; vi <= segV; vi++) {
            const v = vi / segV
            const k = ui * (segV + 1) + vi
            pos[k * 3] = Math.sin(th) * R
            pos[k * 3 + 1] = yBase + v * hgt
            pos[k * 3 + 2] = Math.cos(th) * R
            uv[k * 2] = u
            uv[k * 2 + 1] = v
          }
        }
        for (let ui = 0; ui < segU; ui++) {
          for (let vi = 0; vi < segV; vi++) {
            const a = ui * (segV + 1) + vi
            const b = a + segV + 1
            idx.push(a, b, a + 1, b, b + 1, a + 1)
          }
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
        geo.setIndex(idx)
        const mat = new THREE.ShaderMaterial({
          vertexShader: AURORA_VERT,
          fragmentShader: AURORA_FRAG,
          uniforms: { uTime: { value: 0 }, uIntensity: { value: intensity } },
          transparent: true,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
        return new THREE.Mesh(geo, mat)
      }
      const ribbons = [
        makeRibbon(165, 28, 44, 2.4, 1.0),
        makeRibbon(198, 40, 58, 3.1, 0.8),
        makeRibbon(235, 52, 74, 3.8, 0.6)
      ]
      for (const r of ribbons) auroraGroup.add(r)
      scene.add(auroraGroup)
    }

    // ---- snowy pines (merged branchy geometry, 3 variants, instanced) ----
    {
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x332a22, roughness: 0.95 })
      const needleMat = new THREE.MeshStandardMaterial({ color: 0x1c3a2e, roughness: 0.85, flatShading: true })
      const snowMat = new THREE.MeshStandardMaterial({ color: 0xf0f6fc, roughness: 0.9, flatShading: true })
      const total = 248
      const perVariant = Math.ceil(total / 3)
      const meshes = [0, 1, 2].map((v) => {
        const vg = buildPineGeos(makeSeededRand(9000 + v * 777))
        return {
          vUsed: 0,
          wood: new THREE.InstancedMesh(vg.wood, woodMat, perVariant),
          needles: new THREE.InstancedMesh(vg.needles, needleMat, perVariant),
          snow: new THREE.InstancedMesh(vg.snow, snowMat, perVariant)
        }
      })
      const dummy = new THREE.Object3D()
      let placed = 0
      const placeTree = (x, z, h, s) => {
        const m = meshes[placed % 3]
        const k = m.vUsed++
        dummy.position.set(x, h + 0.02, z)
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        for (const im of [m.wood, m.needles, m.snow]) im.setMatrixAt(k, dummy.matrix)
      }
      let attempts = 0
      while (placed < 240 && attempts < 2400) {
        attempts++
        const x = (Math.random() - 0.5) * 170
        const z = (Math.random() - 0.5) * 170
        const h = getHeight(x, z)
        if (inLagoon(x, z, 4) || h < 1.0 || h > 10) continue
        placeTree(x, z, h, 0.5 + Math.random() * 0.8)
        placed++
      }
      // hero pines: larger, on good dry spots
      const placedHero = []
      while (placed < total) {
        const p = findDrySpot(placedHero, 85, 12)
        placedHero.push(p)
        occupiedSpots.push(p)
        placeTree(p.x, p.z, p.h, 1.7 + Math.random() * 0.9)
        placed++
      }
      for (const m of meshes) {
        for (const im of [m.wood, m.needles, m.snow]) {
          im.count = m.vUsed
          im.instanceMatrix.needsUpdate = true
          im.castShadow = true
        }
        scene.add(m.wood, m.needles, m.snow)
      }
    }

    // ---- rocks (with snow caps) ----
    {
      const dummy = new THREE.Object3D()
      const rockGeo = new THREE.DodecahedronGeometry(1, 0)
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x55606c, roughness: 0.95, flatShading: true })
      const capMat = new THREE.MeshStandardMaterial({ color: 0xeef4fa, roughness: 0.9, flatShading: true })
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 45)
      const caps = new THREE.InstancedMesh(rockGeo, capMat, 45)
      let placed = 0
      let attempts = 0
      while (placed < 45 && attempts < 400) {
        attempts++
        const x = (Math.random() - 0.5) * 140
        const z = (Math.random() - 0.5) * 140
        const h = getHeight(x, z)
        if (inLagoon(x, z, 3) || h < 0.4) continue
        const sx = 0.5 + Math.random() * 1.3
        const sy = 0.4 + Math.random() * 0.9
        const sz = 0.5 + Math.random() * 1.3
        dummy.position.set(x, h + sy * 0.35, z)
        dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random())
        dummy.scale.set(sx, sy, sz)
        dummy.updateMatrix()
        rocks.setMatrixAt(placed, dummy.matrix)
        dummy.position.set(x, h + sy * 0.72, z)
        dummy.scale.set(sx * 0.7, sy * 0.4, sz * 0.7)
        dummy.updateMatrix()
        caps.setMatrixAt(placed, dummy.matrix)
        placed++
      }
      rocks.count = placed
      caps.count = placed
      rocks.instanceMatrix.needsUpdate = true
      caps.instanceMatrix.needsUpdate = true
      rocks.castShadow = true
      scene.add(rocks, caps)
    }

    // ---- snow drifts ----
    {
      const N = 26
      const dGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
      const dMat = new THREE.MeshStandardMaterial({ color: 0xf2f8fd, roughness: 0.95 })
      const im = new THREE.InstancedMesh(dGeo, dMat, N)
      const dummy = new THREE.Object3D()
      let placed = 0
      for (let attempts = 0; placed < N && attempts < N * 12; attempts++) {
        const x = (Math.random() - 0.5) * 150
        const z = (Math.random() - 0.5) * 150
        const h = getHeight(x, z)
        if (inLagoon(x, z, 3) || h < 0.3 || h > 9) continue
        dummy.position.set(x, h - 0.05, z)
        dummy.rotation.set(0, 0.6 + (Math.random() - 0.5) * 0.6, 0)
        dummy.scale.set(2 + Math.random() * 3, 0.3 + Math.random() * 0.45, 0.9 + Math.random() * 1.4)
        dummy.updateMatrix()
        im.setMatrixAt(placed++, dummy.matrix)
      }
      im.count = placed
      im.instanceMatrix.needsUpdate = true
      im.receiveShadow = true
      scene.add(im)
    }

    // ---- structures: igloos, tent, campfire, sled ----
    {
      const iglooTex = makeIglooTexture()
      const tentTex = makeTentTexture()
      const woodTex = makeWoodTexture()
      texAssets.push(iglooTex, tentTex, woodTex)
      const iglooMat = new THREE.MeshStandardMaterial({ map: iglooTex, roughness: 0.6 })
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x0e1620, roughness: 1 })
      const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 })

      // igloos near the shore, doors facing the lagoon
      const igloo1Pos = findDrySpot([], 42, 0)
      occupiedSpots.push(igloo1Pos)
      const igloo1 = buildIgloo(iglooMat, doorMat)
      igloo1.position.set(igloo1Pos.x, igloo1Pos.h - 0.1, igloo1Pos.z)
      igloo1.rotation.y = Math.atan2(-igloo1Pos.x, -igloo1Pos.z)
      igloo1.scale.setScalar(1.3)
      scene.add(igloo1)

      const igloo2Pos = findDrySpot([igloo1Pos], 48, 18)
      occupiedSpots.push(igloo2Pos)
      const igloo2 = buildIgloo(iglooMat, doorMat)
      igloo2.position.set(igloo2Pos.x, igloo2Pos.h - 0.1, igloo2Pos.z)
      igloo2.rotation.y = Math.atan2(-igloo2Pos.x, -igloo2Pos.z) + 0.4
      igloo2.scale.setScalar(1.05)
      scene.add(igloo2)

      // tent near igloo 1
      const tentPos = findNearDry(igloo1Pos.x, igloo1Pos.z, 5, 7)
      if (tentPos) {
        occupiedSpots.push(tentPos)
        const tent = buildTent(new THREE.MeshStandardMaterial({ map: tentTex, roughness: 0.85 }), doorMat)
        tent.position.set(tentPos.x, tentPos.h - 0.05, tentPos.z)
        tent.rotation.y = Math.atan2(-tentPos.x, -tentPos.z)
        scene.add(tent)
      }

      // campfire
      const campPos = findNearDry(igloo1Pos.x, igloo1Pos.z, 3.5, 5.5)
        || { x: igloo1Pos.x + 4, z: igloo1Pos.z, h: igloo1Pos.h }
      occupiedSpots.push(campPos)
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.95, flatShading: true })
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + Math.random() * 0.07, 0), stoneMat)
        st.position.set(campPos.x + Math.cos(a) * 0.45, campPos.h + 0.08, campPos.z + Math.sin(a) * 0.45)
        scene.add(st)
      }
      for (let i = 0; i < 3; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), woodMat)
        log.rotation.z = Math.PI / 2
        log.rotation.y = (i / 3) * Math.PI + 0.3
        log.position.set(campPos.x, campPos.h + 0.1, campPos.z)
        scene.add(log)
      }
      const flameGeo = new THREE.ConeGeometry(0.11, 0.4, 6)
      flameGeo.translate(0, 0.2, 0)
      for (let i = 0; i < 3; i++) {
        const fmat = new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xffaa33 : 0xff6622,
          transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
        const f = new THREE.Mesh(flameGeo, fmat)
        f.position.set(campPos.x + (Math.random() - 0.5) * 0.16, campPos.h + 0.12, campPos.z + (Math.random() - 0.5) * 0.16)
        scene.add(f)
        flames.push(f)
      }
      fireLight = new THREE.PointLight(0xff7733, 8, 20, 2)
      fireLight.position.set(campPos.x, campPos.h + 0.7, campPos.z)
      scene.add(fireLight)
      const smokeTex = makeRadialTexture(64, [
        [0, 'rgba(190,205,220,0.5)'],
        [1, 'rgba(190,205,220,0)']
      ])
      texAssets.push(smokeTex)
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.25, depthWrite: false }))
        sp.position.set(campPos.x, campPos.h + 1.2, campPos.z)
        scene.add(sp)
        smokes.push({ sprite: sp, baseX: campPos.x, baseY: campPos.h + 0.9, phase: i / 3 })
      }

      // sled
      const sledPos = findNearDry(campPos.x, campPos.z, 3, 5)
      if (sledPos) {
        const sled = buildSled(woodMat)
        sled.position.set(sledPos.x, sledPos.h, sledPos.z)
        sled.rotation.y = -0.7
        scene.add(sled)
      }

      // driftwood near the shore
      const driftMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x9aa0a6, roughness: 0.9 })
      for (let i = 0; i < 3; i++) {
        const p = findNearDry(0, 0, 55, 66)
        if (!p) break
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.8, 6), driftMat)
        log.rotation.z = Math.PI / 2
        log.rotation.y = Math.random() * Math.PI
        log.position.set(p.x, p.h + 0.06, p.z)
        scene.add(log)
      }
    }

    // ---- snow ----
    {
      const count = 2600
      const pos = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 160
        pos[i * 3 + 1] = Math.random() * 38
        pos[i * 3 + 2] = (Math.random() - 0.5) * 160
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const mat = new THREE.PointsMaterial({
        color: 0xffffff, size: 0.14, transparent: true, opacity: 0.7,
        depthWrite: false, sizeAttenuation: true
      })
      snowPts = new THREE.Points(geo, mat)
      scene.add(snowPts)
    }

    // ---- animals ----
    {
      const bearFurTex = makeFurTexture('#f2efe9', 'rgba(160,155,145,0.30)', 'rgba(205,200,190,0.35)')
      const foxFurTex = makeFurTexture('#e9e4d8', 'rgba(150,140,125,0.32)', 'rgba(255,255,255,0.4)')
      const reinFurTex = makeFurTexture('#6a5140', 'rgba(40,28,18,0.45)', 'rgba(120,95,72,0.4)')
      texAssets.push(bearFurTex, foxFurTex, reinFurTex)
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.7 })
      const antlerMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.8 })
      const bearKit = { fur: new THREE.MeshStandardMaterial({ map: bearFurTex, roughness: 0.9 }), dark: darkMat }
      const foxKit = { fur: new THREE.MeshStandardMaterial({ map: foxFurTex, roughness: 0.85 }), dark: darkMat }
      const reinKit = { fur: new THREE.MeshStandardMaterial({ map: reinFurTex, roughness: 0.9 }), dark: darkMat, antler: antlerMat }

      const placed = []
      const spawn = (xMax, minDist) => {
        const p = findDrySpot(placed, xMax, minDist)
        placed.push(p)
        return p
      }

      // polar bears (2)
      for (let i = 0; i < 2; i++) {
        const p = spawn(60, 14)
        const b = makeBear(bearKit)
        b.group.scale.setScalar(1.4 + Math.random() * 0.25)
        b.group.position.set(p.x, p.h, p.z)
        scene.add(b.group)
        bears.push({
          group: b.group, legs: b.legs,
          pos: new THREE.Vector3(p.x, p.h, p.z),
          target: new THREE.Vector3(),
          state: 'idle', idle: 1 + Math.random() * 4, phase: Math.random() * 10
        })
      }

      // arctic foxes (6)
      for (let i = 0; i < 6; i++) {
        const p = spawn(52 + (i % 3) * 2, 12)
        const f = makeFox(foxKit)
        f.group.scale.setScalar(0.6 + Math.random() * 0.2)
        f.group.position.set(p.x, p.h, p.z)
        scene.add(f.group)
        foxes.push({
          group: f.group, legs: f.legs, tail: f.tail,
          pos: new THREE.Vector3(p.x, p.h, p.z),
          target: new THREE.Vector3(),
          state: 'idle', idle: Math.random() * 3, phase: Math.random() * 10
        })
      }

      // reindeer herds (2 x 4: 2 antlered adults + 2 calves each)
      for (let h = 0; h < 2; h++) {
        const hp = spawn(62, 16)
        const herdSpots = [hp, findNearDry(hp.x, hp.z, 3, 6), findNearDry(hp.x, hp.z, 4, 7), findNearDry(hp.x, hp.z, 2, 6)].filter(Boolean)
        for (let i = 0; i < herdSpots.length; i++) {
          const p = herdSpots[i]
          const adult = i < 2
          const r = makeReindeer(adult, reinKit)
          r.group.scale.setScalar(adult ? (i === 0 ? 1.1 : 1.0) : 0.6)
          r.group.position.set(p.x, p.h, p.z)
          scene.add(r.group)
          reindeer.push({
            group: r.group, legs: r.legs,
            pos: new THREE.Vector3(p.x, p.h, p.z),
            target: new THREE.Vector3(),
            state: 'idle', idle: 2 + Math.random() * 5,
            speed: adult ? 0.9 : 1.1
          })
        }
      }
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

    function updateSnow(elapsed, delta) {
      if (!snowPts) return
      const arr = snowPts.geometry.attributes.position.array
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= delta * (1.1 + (i % 7) * 0.12)
        arr[i] += Math.sin(elapsed * 0.7 + i * 0.31) * delta * 0.5 + delta * 0.35
        if (arr[i + 1] < -0.5) {
          arr[i] = (Math.random() - 0.5) * 160
          arr[i + 1] = 36 + Math.random() * 4
          arr[i + 2] = (Math.random() - 0.5) * 160
        }
      }
      snowPts.geometry.attributes.position.needsUpdate = true
    }

    function updateAurora(elapsed) {
      if (!auroraGroup) return
      for (const child of auroraGroup.children) {
        child.material.uniforms.uTime.value = elapsed
      }
      auroraGroup.rotation.y = Math.sin(elapsed * 0.02) * 0.12
    }

    function updateIce(elapsed, delta) {
      for (const ib of icebergs) {
        const bob = Math.sin(elapsed * 0.35 + ib.phase) * ib.bobAmp
        ib.mesh.position.y = ib.baseY + bob
        ib.ghost.position.y = ib.ghostBaseY + bob
        ib.mesh.rotation.y += delta * ib.rotSp
      }
      for (const p of packIce) {
        p.mesh.position.y = WATER_Y + 0.05 + Math.sin(elapsed * 0.3 + p.phase) * 0.06
      }
    }

    function updateCamp(elapsed) {
      if (fireLight) {
        fireLight.intensity = 5 + Math.sin(elapsed * 11.3) * 1.3 + Math.sin(elapsed * 23.7) * 0.9
      }
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i]
        f.scale.y = 0.75 + 0.3 * Math.sin(elapsed * 9 + i * 2.1) + 0.18 * Math.sin(elapsed * 17.3 + i)
        f.material.opacity = 0.7 + 0.2 * Math.sin(elapsed * 13 + i * 1.7)
      }
      for (const s of smokes) {
        const f = (elapsed * 0.22 + s.phase) % 1
        s.sprite.position.y = s.baseY + f * 3.4
        s.sprite.position.x = s.baseX + f * 0.9 + Math.sin(elapsed * 0.5 + s.phase * 9) * 0.25
        const sc = 0.5 + f * 2.4
        s.sprite.scale.set(sc, sc, 1)
        s.sprite.material.opacity = 0.26 * (1 - f)
      }
    }

    function faceToward(obj, a, lerp) {
      // animals face +X locally: world forward = (cos yaw, 0, -sin yaw)
      const dx = a.target.x - a.pos.x
      const dz = a.target.z - a.pos.z
      const desired = Math.atan2(-dz, dx)
      let diff = desired - obj.rotation.y
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      obj.rotation.y += diff * lerp * CLOCK_DELTA
    }

    function walkLegs(legs, phase) {
      legs.forEach((leg, i) => {
        const p = i % 4 === 0 || i % 4 === 3 ? phase : phase + Math.PI
        leg.rotation.x = Math.sin(p) * 0.4
      })
    }

    function updateAnimals(elapsed, delta) {
      // polar bears
      for (const bear of bears) {
        if (bear.state === 'idle') {
          bear.idle -= delta
          bear.legs.forEach((leg) => { leg.rotation.x *= 0.9 })
          bear.group.position.y = bear.pos.y + Math.sin(elapsed * 1.1 + bear.phase) * 0.015
          if (bear.idle <= 0) {
            bear.state = 'walk'
            pickDryTarget(bear, 55)
          }
        } else {
          const moving = stepToward(bear, delta, 1.4, SAFE_H)
          if (!moving) {
            bear.state = 'idle'
            bear.idle = 2.5 + Math.random() * 3
            pickDryTarget(bear, 55)
          } else {
            bear.group.position.copy(bear.pos)
            faceToward(bear.group, bear, 3)
            walkLegs(bear.legs, elapsed * 2.2 + bear.phase)
          }
        }
      }

      // arctic foxes (dash + freeze)
      for (const fox of foxes) {
        if (fox.state === 'idle') {
          fox.idle -= delta
          fox.tail.rotation.x = Math.sin(elapsed * 3 + fox.phase) * 0.2
          if (fox.idle <= 0) {
            fox.state = 'dash'
            pickDryTarget(fox, 48)
          }
        } else {
          const moving = stepToward(fox, delta, 5.5, SAFE_H)
          if (!moving) {
            fox.state = 'idle'
            fox.idle = 0.8 + Math.random() * 2.5
            pickDryTarget(fox, 48)
          } else {
            fox.group.position.copy(fox.pos)
            faceToward(fox.group, fox, 6)
            walkLegs(fox.legs, elapsed * 11 + fox.phase)
          }
        }
      }

      // reindeer
      for (const r of reindeer) {
        if (r.state === 'idle') {
          r.idle -= delta
          r.legs.forEach((leg) => { leg.rotation.x *= 0.9 })
          if (r.idle <= 0) {
            r.state = 'walk'
            pickDryTarget(r, 60)
          }
        } else {
          const moving = stepToward(r, delta, r.speed, SAFE_H)
          if (!moving) {
            r.state = 'idle'
            r.idle = 3 + Math.random() * 4
            pickDryTarget(r, 60)
          } else {
            r.group.position.copy(r.pos)
            faceToward(r.group, r, 2.5)
            walkLegs(r.legs, elapsed * r.speed * 2.2 + r.pos.x * 0.3)
          }
        }
      }
    }

    function animate() {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const now = performance.now()
      CLOCK_DELTA = Math.min((now - clock.last) / 1000, 0.05)
      clock.last = now
      const elapsed = clock.last / 1000

      orbit.autoRotate = autoRotate.value
      if (waterMat) waterMat.uniforms.uTime.value = elapsed
      updateSnow(elapsed, CLOCK_DELTA)
      updateAurora(elapsed)
      updateIce(elapsed, CLOCK_DELTA)
      updateCamp(elapsed)
      updateAnimals(elapsed, CLOCK_DELTA)
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
