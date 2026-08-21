import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useCameraMove } from './useCameraMove'
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

function makeTrunkCanvas() {
  const W = 128, H = 128
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#8a6a45'
  ctx.fillRect(0, 0, W, H)
  // ring bands (canvas x = along the trunk, so bands are vertical strips)
  for (let x = 0; x < W; x += 9) {
    ctx.fillStyle = 'rgba(74,56,36,0.35)'
    ctx.fillRect(x, 0, 2, H)
    ctx.fillStyle = 'rgba(220,196,150,0.18)'
    ctx.fillRect(x + 3, 0, 1.5, H)
  }
  const wrap = (x, fn) => {
    for (const ox of [-W, 0, W]) {
      ctx.save()
      ctx.translate(ox, 0)
      fn()
      ctx.restore()
    }
  }
  // mottled patches
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, y = Math.random() * H
    const r = 6 + Math.random() * 16
    wrap(x, () => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, Math.random() < 0.5 ? 'rgba(60,46,30,0.2)' : 'rgba(200,178,132,0.15)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    })
  }
  return c
}

// one palm frond: curved rachis + drooping leaflet pairs
function makePalmFrondGeometry(drop, random) {
  const parts = []
  const rachisCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.38, 0.16 + random() * 0.06, 0),
    new THREE.Vector3(0.8, 0.2 + drop * 0.05, 0),
    new THREE.Vector3(1.15, 0.02 - drop * 0.12, 0),
    new THREE.Vector3(1.42, -0.3 - drop * 0.25, 0)
  ])
  parts.push(new THREE.TubeGeometry(rachisCurve, 10, 0.014, 5))
  const leafletBase = new THREE.PlaneGeometry(0.085, 0.34)
  leafletBase.translate(0, 0.17, 0)
  for (let i = 0; i < 6; i++) {
    const t = 0.22 + (i / 5) * 0.76
    const p = rachisCurve.getPoint(t)
    const droop = 0.45 + t * 0.65
    for (const side of [1, -1]) {
      const lf = leafletBase.clone()
      lf.rotateX(side * (Math.PI / 2 + droop))
      lf.translate(p.x, p.y - 0.01, p.z)
      parts.push(lf)
    }
  }
  return BufferGeometryUtils.mergeGeometries(parts)
}

function tintGeo(geo, r, g, b) {
  const n = geo.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = r
    col[i * 3 + 1] = g
    col[i * 3 + 2] = b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

function makeFishGeometry() {
  // body of revolution: rounded head -> deep middle -> narrow peduncle
  const pts2d = [
    [0.003, 0.28], [0.045, 0.245], [0.08, 0.16], [0.095, 0.04],
    [0.08, -0.08], [0.05, -0.18], [0.02, -0.25], [0.003, -0.27]
  ]
  const curve = new THREE.CatmullRomCurve3(pts2d.map((p) => new THREE.Vector3(p[0], p[1], 0)))
  const pts = curve.getPoints(20).map((p) => new THREE.Vector2(Math.max(0.002, p.x), p.y))
  const body = new THREE.LatheGeometry(pts, 14)
  body.rotateX(Math.PI / 2)
  const bp = body.attributes.position
  for (let i = 0; i < bp.count; i++) {
    bp.setX(i, bp.getX(i) * 0.62)
    bp.setY(i, bp.getY(i) * 1.12)
  }
  body.computeVertexNormals()
  const parts = [tintGeo(body, 1, 1, 1)]
  // dorsal fin along the back
  const dorsalS = new THREE.Shape()
  dorsalS.moveTo(0.12, 0.085)
  dorsalS.quadraticCurveTo(0.06, 0.17, -0.02, 0.155)
  dorsalS.quadraticCurveTo(-0.10, 0.145, -0.17, 0.075)
  dorsalS.quadraticCurveTo(-0.06, 0.1, 0.12, 0.085)
  dorsalS.closePath()
  const dorsal = new THREE.ShapeGeometry(dorsalS, 6)
  dorsal.rotateY(-Math.PI / 2)
  parts.push(tintGeo(dorsal, 0.92, 0.9, 0.95))
  // forked caudal fin
  const tailS = new THREE.Shape()
  tailS.moveTo(0, 0.012)
  tailS.quadraticCurveTo(-0.06, 0.10, -0.18, 0.16)
  tailS.quadraticCurveTo(-0.11, 0.06, -0.055, 0.005)
  tailS.quadraticCurveTo(-0.11, -0.06, -0.18, -0.16)
  tailS.quadraticCurveTo(-0.06, -0.10, 0, -0.012)
  tailS.closePath()
  const caudal = new THREE.ShapeGeometry(tailS, 6)
  caudal.rotateY(-Math.PI / 2)
  caudal.translate(0, 0, -0.25)
  parts.push(tintGeo(caudal, 0.9, 0.88, 0.94))
  // pectoral fins (swept back)
  for (const sign of [1, -1]) {
    const pS = new THREE.Shape()
    pS.moveTo(0, 0.02)
    pS.quadraticCurveTo(sign * 0.05, 0.02, sign * 0.085, -0.01)
    pS.quadraticCurveTo(sign * 0.045, -0.05, 0, -0.04)
    pS.closePath()
    const pectoral = new THREE.ShapeGeometry(pS, 5)
    pectoral.rotateX(Math.PI / 2)
    pectoral.translate(sign * 0.045, -0.01, 0.10)
    parts.push(tintGeo(pectoral, 0.92, 0.9, 0.95))
  }
  // eyes
  for (const side of [1, -1]) {
    const eye = new THREE.SphereGeometry(0.018, 8, 6)
    eye.translate(side * 0.028, 0.04, 0.215)
    parts.push(tintGeo(eye, 0.07, 0.09, 0.11))
  }
  return BufferGeometryUtils.mergeGeometries(parts, false)
}

function makeKelpGeometry() {
  const parts = []
  // curved tapered stem
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.02, 0.35, 0.01),
    new THREE.Vector3(-0.02, 0.7, -0.02),
    new THREE.Vector3(0.0, 1.0, 0)
  ])
  const stem = new THREE.TubeGeometry(stemCurve, 10, 0.035, 6)
  {
    const sv = stem.attributes.uv
    const sp = stem.attributes.position
    for (let i = 0; i < sp.count; i++) {
      const tt = sv.getX(i)
      const f = 1.7 - 1.15 * tt
      const c = stemCurve.getPoint(tt)
      sp.setX(i, c.x + (sp.getX(i) - c.x) * f)
      sp.setZ(i, c.z + (sp.getZ(i) - c.z) * f)
    }
    stem.computeVertexNormals()
  }
  parts.push(stem)
  // 5 tapered, undulating blades
  for (let i = 0; i < 5; i++) {
    const w = 0.22 + (4 - i) * 0.035
    const len = 0.45 + i * 0.06
    const frond = new THREE.PlaneGeometry(w, len, 3, 8)
    const fp = frond.attributes.position
    const halfW = w / 2
    for (let j = 0; j < fp.count; j++) {
      const x = fp.getX(j)
      const y = fp.getY(j)
      const tAlong = (y + len / 2) / len
      const nx = x * (1 - 0.55 * tAlong)
      const nz = Math.sin(tAlong * 2.6 + i) * 0.05 * tAlong + (1 - (nx / halfW) * (nx / halfW)) * 0.04
      fp.setX(j, nx)
      fp.setZ(j, nz)
    }
    frond.computeVertexNormals()
    const a = (i / 5) * Math.PI * 2 + 0.4
    frond.rotateY(a)
    frond.translate(Math.cos(a) * 0.02, 0.3 + i * 0.14, Math.sin(a) * 0.06)
    parts.push(frond)
  }
  return BufferGeometryUtils.mergeGeometries(parts)
}

function makeCoralGeometry(type, dummyRand) {
  const parts = []
  if (type === 0) {
    // staghorn: curved multi-segment branches with side shoots
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2 + dummyRand() * 0.5
      const lean = 0.3 + dummyRand() * 0.35
      const dir = new THREE.Vector3(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize()
      const segs = 2 + Math.floor(dummyRand() * 2)
      const segLen = (0.35 + dummyRand() * 0.45) / segs
      let posV = new THREE.Vector3(Math.cos(a) * 0.06, 0.05, Math.sin(a) * 0.06)
      let dirV = dir.clone()
      let radius = 0.055
      for (let sIdx = 0; sIdx < segs; sIdx++) {
        const seg = new THREE.CylinderGeometry(radius * 0.72, radius, segLen, 5)
        seg.translate(0, segLen / 2, 0)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirV)
        seg.applyQuaternion(q)
        seg.translate(posV.x, posV.y, posV.z)
        parts.push(seg)
        posV.addScaledVector(dirV, segLen)
        dirV.add(new THREE.Vector3((dummyRand() - 0.5) * 0.5, 0.35, (dummyRand() - 0.5) * 0.5)).normalize()
        radius *= 0.72
        if (sIdx === 0 && dummyRand() > 0.4) {
          const sideDir = dirV.clone().add(new THREE.Vector3(Math.cos(a + 1.6) * 0.9, 0.3, Math.sin(a + 1.6) * 0.9)).normalize()
          const side = new THREE.CylinderGeometry(0.02, 0.032, 0.16, 4)
          side.translate(0, 0.08, 0)
          side.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sideDir))
          side.translate(posV.x, posV.y, posV.z)
          parts.push(side)
        }
      }
      const tip = new THREE.SphereGeometry(radius * 1.1, 6, 5)
      tip.translate(posV.x, posV.y, posV.z)
      parts.push(tip)
    }
  } else if (type === 1) {
    // boulder: rough two-octave displacement
    const blob = new THREE.IcosahedronGeometry(0.55, 2)
    const pos = blob.attributes.position
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j)
      const s = 1
        + 0.16 * Math.sin(x * 5 + y * 3) * Math.cos(z * 4.3)
        + 0.07 * Math.sin(x * 11 - z * 9 + y * 7)
      pos.setXYZ(j, x * s, y * s * 0.8, z * s)
    }
    blob.translate(0, 0.4, 0)
    parts.push(blob)
  } else if (type === 2) {
    // tube cluster with open rims
    for (let t = 0; t < 7; t++) {
      const h = 0.4 + dummyRand() * 0.5
      const tx = (dummyRand() - 0.5) * 0.5
      const tz = (dummyRand() - 0.5) * 0.5
      const tube = new THREE.CylinderGeometry(0.07, 0.09, h, 7, 1, true)
      tube.translate(tx, h / 2, tz)
      parts.push(tube)
      const rim = new THREE.TorusGeometry(0.07, 0.018, 5, 8)
      rim.rotateX(Math.PI / 2)
      rim.translate(tx, h, tz)
      parts.push(rim)
    }
  } else if (type === 3) {
    // sea fans: annular sectors with wavy lattice, 3 layered planes
    for (let f = 0; f < 3; f++) {
      const s = new THREE.Shape()
      const r0 = 0.16, r1 = 0.78, arc = 0.95
      s.absarc(0, 0, r1, -arc / 2, arc / 2, false)
      s.absarc(0, 0, r0, arc / 2, -arc / 2, true)
      s.closePath()
      const fan = new THREE.ShapeGeometry(s, 10)
      const fp = fan.attributes.position
      for (let j = 0; j < fp.count; j++) {
        const x = fp.getX(j), y = fp.getY(j)
        const ridge = 0.035 * Math.sin(x * 16 + y * 9) * Math.sin(y * 12 - x * 7)
        fp.setZ(j, ridge)
      }
      fan.computeVertexNormals()
      fan.rotateX(-0.55 - f * 0.22)
      fan.rotateY(f * 0.55 - 0.55)
      fan.translate(0.22, 0.12, 0)
      parts.push(fan)
    }
  } else {
    // table coral: curved column + wavy plate
    const col = new THREE.CylinderGeometry(0.07, 0.16, 0.55, 8)
    col.translate(0.04, 0.28, 0)
    col.rotateZ(-0.12)
    parts.push(col)
    const plate = new THREE.CylinderGeometry(0.55, 0.42, 0.12, 14)
    const pp = plate.attributes.position
    for (let j = 0; j < pp.count; j++) {
      const x = pp.getX(j), y = pp.getY(j), z = pp.getZ(j)
      if (y > 0.02) pp.setY(j, y + 0.04 * Math.sin(x * 7 + 1.2) * Math.cos(z * 6 - 0.7))
    }
    plate.computeVertexNormals()
    plate.translate(0.09, 0.6, 0)
    parts.push(plate)
    const rim = new THREE.TorusGeometry(0.5, 0.03, 5, 14)
    rim.rotateX(Math.PI / 2)
    rim.translate(0.09, 0.56, 0)
    parts.push(rim)
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

function makeIslandCanvas() {
  const W = 1024, H = 512
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  // sand base: lighter wet sand at the waterline (canvas bottom) -> rocky top
  const g = ctx.createLinearGradient(0, H, 0, 0)
  g.addColorStop(0, '#e2cd9c')
  g.addColorStop(0.35, '#d8c08a')
  g.addColorStop(0.75, '#c8b283')
  g.addColorStop(1, '#9a8f74')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const wrap = (x, fn) => {
    for (const ox of [-W, 0, W]) {
      ctx.save()
      ctx.translate(ox, 0)
      fn()
      ctx.restore()
    }
  }
  // erosion streaks
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W
    const y0 = Math.random() * H * 0.7
    const len = 40 + Math.random() * 160
    const dark = Math.random() < 0.5
    wrap(x, () => {
      const lg = ctx.createLinearGradient(0, y0, 0, y0 + len)
      lg.addColorStop(0, 'rgba(0,0,0,0)')
      lg.addColorStop(0.5, dark ? 'rgba(90,78,54,0.14)' : 'rgba(255,248,220,0.12)')
      lg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = lg
      ctx.fillRect(x - 2, y0, 4 + Math.random() * 6, len)
    })
  }
  // rock patches toward the top
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W
    const y = Math.random() * H * 0.4
    const r = 30 + Math.random() * 80
    wrap(x, () => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, Math.random() < 0.5 ? 'rgba(122,116,98,0.4)' : 'rgba(146,138,116,0.35)')
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    })
  }
  // shrub speckles
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * W
    const y = Math.random() * H * 0.45
    const s = 2 + Math.random() * 5
    wrap(x, () => {
      ctx.fillStyle = `rgba(${(40 + Math.random() * 40) | 0},${(90 + Math.random() * 50) | 0},${(40 + Math.random() * 30) | 0},0.5)`
      ctx.fillRect(x, y, s, s * 0.7)
    })
  }
  // sand grain
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * W, y = Math.random() * H
    ctx.fillStyle = Math.random() < 0.5
      ? `rgba(96,84,58,${0.06 + Math.random() * 0.1})`
      : `rgba(255,250,230,${0.05 + Math.random() * 0.1})`
    ctx.fillRect(x, y, 1, 1)
  }
  // shell fragments at the waterline
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * W
    const y = H * 0.88 + Math.random() * H * 0.1
    wrap(x, () => {
      ctx.fillStyle = `rgba(245,240,225,${0.3 + Math.random() * 0.4})`
      ctx.beginPath()
      ctx.arc(x, y, 1 + Math.random() * 2.5, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  return c
}

function makeSandCanvas() {
  const W = 512, H = 512
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#96948f'
  ctx.fillRect(0, 0, W, H)
  const wrap = (x, fn) => {
    for (const ox of [-W, 0, W]) {
      ctx.save()
      ctx.translate(ox, 0)
      fn()
      ctx.restore()
    }
  }
  // soft mottling
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * W, y = Math.random() * H
    const r = 20 + Math.random() * 60
    wrap(x, () => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, Math.random() < 0.5 ? 'rgba(210,208,200,0.10)' : 'rgba(110,108,100,0.10)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    })
  }
  // ripple bands (periodic so tiles seamlessly)
  const f = (Math.PI * 2 * 4) / W
  for (let i = 0; i < 26; i++) {
    const y0 = (i / 26) * H + Math.random() * 10
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(220,218,208,0.08)' : 'rgba(96,94,88,0.08)'
    ctx.lineWidth = 2 + Math.random() * 3
    ctx.beginPath()
    for (let x = 0; x <= W; x += 12) {
      const yy = y0 + 4 * Math.sin(x * f + i * 1.3)
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.stroke()
  }
  // grain
  for (let i = 0; i < 14000; i++) {
    ctx.fillStyle = Math.random() < 0.5
      ? `rgba(225,222,212,${0.05 + Math.random() * 0.12})`
      : `rgba(80,78,72,${0.05 + Math.random() * 0.12})`
    ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1)
  }
  // pebbles
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W, y = Math.random() * H
    const r = 1.5 + Math.random() * 3
    const cr = (120 + Math.random() * 60) | 0
    const cg = (118 + Math.random() * 55) | 0
    const cb = (110 + Math.random() * 50) | 0
    wrap(x, () => {
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.5)`
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.4), Math.random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  return c
}

// ---------- jellyfish builders ----------

function makeJellyBellGeometry() {
  // profile rolls inward+up at the bottom edge -> the bell's own lip (no separate rim)
  const pts2d = [
    [0.02, 0.52], [0.22, 0.47], [0.38, 0.38], [0.49, 0.25],
    [0.55, 0.10], [0.565, 0.0], [0.53, -0.045], [0.47, -0.075],
    [0.435, -0.05], [0.425, -0.01], [0.435, 0.03]
  ]
  const curve = new THREE.CatmullRomCurve3(pts2d.map((p) => new THREE.Vector3(p[0], p[1], 0)))
  const pts = curve.getPoints(40).map((p) => new THREE.Vector2(Math.max(0.001, p.x), p.y))
  const geo = new THREE.LatheGeometry(pts, 28)
  geo.computeVertexNormals()
  return geo
}

function makeTentacleGeometry(x0, z0, r, len, bulge) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x0, 0, z0),
    new THREE.Vector3(x0 * (1 + bulge), -len * 0.45, z0 * (1 + bulge)),
    new THREE.Vector3(x0 * (1 - bulge * 0.5), -len, z0 * (1 - bulge * 0.5))
  ])
  const geo = new THREE.TubeGeometry(curve, 14, r, 6)
  const uv = geo.attributes.uv
  const pos = geo.attributes.position
  const p0 = curve.getPoint(0)
  const p1 = curve.getPoint(1)
  for (let i = 0; i < pos.count; i++) {
    const tt = uv.getX(i)
    const f = 1 - 0.65 * tt
    const cx = p0.x + (p1.x - p0.x) * tt
    const cz = p0.z + (p1.z - p0.z) * tt
    pos.setX(i, cx + (pos.getX(i) - cx) * f)
    pos.setZ(i, cz + (pos.getZ(i) - cz) * f)
  }
  geo.computeVertexNormals()
  return geo
}

function makeJellyTentMat(hue) {
  const mat = new THREE.MeshStandardMaterial({
    color: hue, emissive: hue, emissiveIntensity: 0.3, transparent: true, opacity: 0.3
  })
  mat.onBeforeCompile = (shader) => {
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
         vec4 jwp = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float jph = jwp.x * 0.35 + jwp.z * 0.31;
         float hang = clamp(-position.y / 1.5, 0.0, 1.0);
         transformed.x += sin(uTime * 1.3 + jph + position.y * 1.8) * 0.16 * hang;
         transformed.z += cos(uTime * 1.05 + jph + position.y * 1.4) * 0.14 * hang;`
      )
    mat.userData.shader = shader
  }
  return mat
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

// ---------- sea turtle (detailed) ----------

function sstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi), b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

// scute layout in top-down unit space (head at +z)
const CAR_CENTRAL = [
  [0.62, 0.17, 0.16],
  [0.34, 0.24, 0.17],
  [0.06, 0.31, 0.19],
  [-0.20, 0.30, 0.16],
  [-0.44, 0.27, 0.13],
  [-0.62, 0.24, 0.11],
  [-0.76, 0.21, 0.09],
  [-0.875, 0.15, 0.065]
]
const CAR_COSTAL = [
  [0.47, 0.47, 0.24, 0.24],
  [0.51, 0.15, 0.26, 0.28],
  [0.53, -0.17, 0.27, 0.31],
  [0.49, -0.48, 0.25, 0.29]
]

function carapaceAt(x, z, st) {
  let d2 = 2, id = 900, kind = 2
  for (let i = 0; i < CAR_CENTRAL.length; i++) {
    const [cz, rx, rz] = CAR_CENTRAL[i]
    const e = (x / rx) * (x / rx) + ((z - cz) / rz) * ((z - cz) / rz)
    if (e < d2) { d2 = e; id = i; kind = 0 }
  }
  const sgn = x >= 0 ? 1 : -1
  for (let i = 0; i < CAR_COSTAL.length; i++) {
    const [cx, cz, rx, rz] = CAR_COSTAL[i]
    const e = ((x - sgn * cx) / rx) * ((x - sgn * cx) / rx) + ((z - cz) / rz) * ((z - cz) / rz)
    if (e < d2) { d2 = e; id = 100 + i * 2 + (sgn > 0 ? 1 : 0); kind = 1 }
  }
  if (kind < 2) {
    return {
      plate: (1 - d2) * (1 - d2),
      groove: sstep(0.84, 0.995, d2),
      id, kind
    }
  }
  const ang = Math.atan2(z, x)
  const f = (((ang / (Math.PI * 2)) + 1) % 1) * 19
  const fe = Math.min(f - Math.floor(f), Math.ceil(f) - f) * 2
  const rimFade = 1 - sstep(0.84, 1.0, st)
  return {
    plate: fe * fe * 0.8 * rimFade,
    groove: (1 - sstep(0.08, 0.4, fe)) * 0.9 + sstep(0.9, 1.0, st) * 0.4,
    id: 500 + Math.floor(f), kind: 2
  }
}

function makeCarapaceCanvas(W, H, isBump) {
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(W, H)
  const d = img.data
  for (let py = 0; py < H; py++) {
    const theta = (py / (H - 1)) * (Math.PI / 2)
    const st = Math.sin(theta), ct = Math.cos(theta)
    for (let px = 0; px < W; px++) {
      const a = (px / W) * Math.PI * 2
      const x = -Math.cos(a) * st
      const z = Math.sin(a) * st
      const sc = carapaceAt(x, z, st)
      const h = hash2(sc.id, 7.31)
      const o = (py * W + px) * 4
      if (isBump) {
        const brush = 0.06 * Math.sin(ct * 44 + h * 9)
        const lum = Math.max(0, Math.min(255, 96 + 130 * sc.plate - 115 * sc.groove + 12 * brush * 10))
        d[o] = d[o + 1] = d[o + 2] = lum
      } else {
        let r, g, b
        if (sc.kind === 0) { r = 98 + h * 30; g = 110 + h * 26; b = 70 + h * 20 }
        else if (sc.kind === 1) { r = 116 + h * 26; g = 114 + h * 24; b = 76 + h * 18 }
        else { r = 92 + h * 24; g = 88 + h * 20; b = 62 + h * 14 }
        const mottle = valueNoise(x * 3.4 + 11.7, z * 3.4 + 4.2)
        const brush = 0.05 * Math.sin(ct * 44 + h * 9)
        const speck = hash2(Math.floor(px / 2.3), Math.floor(py / 2.3) + sc.id * 31)
        let light = (0.86 + 0.26 * mottle) * (1 + 0.14 * sc.plate + brush - 0.5 * sc.groove)
        if (speck < 0.055) light *= 0.7
        else if (speck > 0.968) light *= 1.22
        d[o] = Math.min(255, r * light)
        d[o + 1] = Math.min(255, g * light)
        d[o + 2] = Math.min(255, b * light)
      }
      d[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

function makeSkinCanvas() {
  const W = 512, H = 512
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#7c8c52'
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W, y = Math.random() * H
    const r = 14 + Math.random() * 46
    const dark = Math.random() < 0.6
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, dark ? 'rgba(58,72,38,0.16)' : 'rgba(196,190,120,0.13)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 5200; i++) {
    const s = 0.6 + Math.random() * 1.6
    ctx.fillStyle = `rgba(40,52,26,${0.08 + Math.random() * 0.16})`
    ctx.fillRect(Math.random() * W, Math.random() * H, s, s)
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(205,200,130,${0.06 + Math.random() * 0.12})`
    ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1)
  }
  return c
}

function makePlastronCanvas() {
  const W = 512, H = 256
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#d3c69e'
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * W, y = Math.random() * H
    const r = 12 + Math.random() * 38
    const dark = Math.random() < 0.55
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, dark ? 'rgba(122,104,66,0.18)' : 'rgba(240,232,198,0.2)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const wrap = (x, fn) => {
    for (const ox of [-W, 0, W]) {
      ctx.save()
      ctx.translate(ox, 0)
      fn()
      ctx.restore()
    }
  }
  // 8 sector seams
  ctx.strokeStyle = 'rgba(84,72,44,0.5)'
  ctx.lineWidth = 2.5
  for (let i = 0; i < 8; i++) {
    const bx = (i / 8) * W
    wrap(bx, () => {
      ctx.beginPath()
      for (let y = 0; y <= H; y += 8) {
        const xx = bx + 5 * Math.sin(y * 0.045 + i * 1.7)
        if (y === 0) ctx.moveTo(xx, y)
        else ctx.lineTo(xx, y)
      }
      ctx.stroke()
    })
  }
  // transverse seams
  ctx.strokeStyle = 'rgba(84,72,44,0.35)'
  ctx.lineWidth = 2
  for (const by of [64, 132]) {
    ctx.beginPath()
    for (let x = 0; x <= W; x += 10) {
      const yy = by + 4 * Math.sin(x * 0.02 + by)
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.stroke()
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(96,84,52,${0.05 + Math.random() * 0.1})`
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2)
  }
  return c
}

function makeFlipperGeometry(len, chord, thick) {
  const s = new THREE.Shape()
  const cR = chord * 0.40, cF = chord * 0.60
  s.moveTo(0, -cR)
  s.quadraticCurveTo(len * 0.34, -cR * 1.25, len * 0.62, -chord * 0.42)
  s.quadraticCurveTo(len * 0.90, -chord * 0.30, len * 0.99, -chord * 0.05)
  s.quadraticCurveTo(len * 1.03, chord * 0.10, len * 0.93, chord * 0.18)
  s.quadraticCurveTo(len * 0.68, chord * 0.42, len * 0.40, chord * 0.55)
  s.quadraticCurveTo(len * 0.16, cF * 1.05, 0, cF)
  s.closePath()
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: thick, bevelEnabled: true, bevelThickness: thick * 0.6, bevelSize: thick * 0.5, bevelSegments: 2, curveSegments: 10
  })
  geo.rotateX(Math.PI / 2)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const f = 1 - 0.5 * Math.max(0, p.getX(i) / len)
    p.setY(i, p.getY(i) * f)
  }
  geo.computeVertexNormals()
  return geo
}

function makeTurtle(texAssets) {
  const g = new THREE.Group()

  const shellTex = toTexture(makeCarapaceCanvas(1024, 1024, false))
  const shellBump = toTexture(makeCarapaceCanvas(512, 512, true))
  const skinTex = toTexture(makeSkinCanvas())
  const plastronTex = toTexture(makePlastronCanvas())
  if (texAssets) texAssets.push(shellTex, shellBump, skinTex, plastronTex)

  const shellMat = new THREE.MeshStandardMaterial({ map: shellTex, bumpMap: shellBump, bumpScale: 0.16, roughness: 0.74 })
  const skinMat = new THREE.MeshStandardMaterial({ map: skinTex, bumpMap: skinTex, bumpScale: 0.05, roughness: 0.68 })
  const plastronMat = new THREE.MeshStandardMaterial({ map: plastronTex, bumpMap: plastronTex, bumpScale: 0.09, roughness: 0.72 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x22291c, roughness: 0.6 })
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a1d0a, roughness: 0.28, metalness: 0.15 })
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xfff6dd })

  // carapace: dense hemisphere + per-scute relief
  const shellGeo = new THREE.SphereGeometry(1, 128, 48, 0, Math.PI * 2, 0, Math.PI / 2)
  {
    const sp = shellGeo.attributes.position
    for (let i = 0; i < sp.count; i++) {
      let x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i)
      const len = Math.hypot(x, y, z)
      x /= len
      y /= len
      z /= len
      const st = Math.hypot(x, z)
      const sc = carapaceAt(x, z, st)
      let h = 0.05 * sc.plate
      h -= 0.04 * sc.groove
      h += 0.006 * Math.sin(x * 21 + 1.7) * Math.cos(z * 18 - 0.6)
      sp.setXYZ(i, x * (1 + h), y * (1 + h * 1.25), z * (1 + h))
    }
    shellGeo.computeVertexNormals()
    shellGeo.scale(1.05, 0.40, 1.32)
  }
  const shell = new THREE.Mesh(shellGeo, shellMat)
  g.add(shell)

  // plastron (lower shell, inset so the carapace overhangs)
  const bellyGeo = new THREE.SphereGeometry(1, 64, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
  bellyGeo.scale(1.0, 0.30, 1.25)
  const belly = new THREE.Mesh(bellyGeo, plastronMat)
  belly.position.y = -0.02
  g.add(belly)

  // shell rim (visible edge where carapace meets plastron)
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.85 })
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.055, 10, 72), rimMat)
  rim.rotation.x = 0
  rim.scale.set(1.02, 0.30, 1.29)
  rim.position.y = -0.01
  g.add(rim)

  // weathering: barnacles + algae patches on the carapace
  {
    const barnacleGeo = new THREE.SphereGeometry(0.024, 6, 5)
    barnacleGeo.scale(1, 0.55, 1)
    const barnacleMat = new THREE.MeshStandardMaterial({ color: 0xb5af9e, roughness: 0.95 })
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 0.12 + Math.random() * 0.62
      const m = new THREE.Mesh(barnacleGeo, barnacleMat)
      m.position.set(
        Math.cos(a) * r * 1.05 * 1.02,
        Math.sqrt(Math.max(0, 1 - r * r)) * 0.40 * 1.02,
        Math.sin(a) * r * 1.32 * 1.02
      )
      m.scale.setScalar(0.45 + Math.random() * 1.1)
      m.rotation.set(Math.random(), Math.random() * Math.PI, Math.random())
      g.add(m)
    }
    const algaeGeo = new THREE.CircleGeometry(0.1, 10)
    const algaeMat = new THREE.MeshStandardMaterial({ color: 0x39512e, roughness: 0.95 })
    const Z_AXIS = new THREE.Vector3(0, 0, 1)
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 0.18 + Math.random() * 0.55
      const ux = Math.cos(a) * r
      const uy = Math.sqrt(Math.max(0, 1 - r * r))
      const uz = Math.sin(a) * r
      // true normal of the oblate shell ellipsoid
      const n = new THREE.Vector3(ux / 1.1025, uy / 0.16, uz / 1.7424).normalize()
      const m = new THREE.Mesh(algaeGeo, algaeMat)
      m.position.set(ux * 1.05 * 1.01, uy * 0.40 * 1.01, uz * 1.32 * 1.01)
      m.quaternion.setFromUnitVectors(Z_AXIS, n)
      m.scale.set(0.5 + Math.random() * 0.8, 0.35 + Math.random() * 0.6, 1)
      g.add(m)
    }
  }

  // head (joint pivot) with curved tube neck
  const headPivot = new THREE.Group()
  headPivot.position.set(0, 0.04, 1.38)
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.06, -0.42),
    new THREE.Vector3(0, -0.03, -0.20),
    new THREE.Vector3(0, 0.0, 0.0),
    new THREE.Vector3(0, 0.02, 0.08)
  ])
  const neckGeo = new THREE.TubeGeometry(neckCurve, 20, 0.13, 12)
  {
    const uvn = neckGeo.attributes.uv
    const posn = neckGeo.attributes.position
    for (let i = 0; i < posn.count; i++) {
      const tt = uvn.getX(i)
      const f = 1.15 - 0.4 * tt
      const yc = -0.06 + tt * 0.08
      posn.setX(i, posn.getX(i) * f)
      posn.setY(i, yc + (posn.getY(i) - yc) * f * 0.75)
    }
    neckGeo.computeVertexNormals()
  }
  headPivot.add(new THREE.Mesh(neckGeo, skinMat))
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 24, 16), skinMat)
  skull.scale.set(0.95, 0.8, 1.32)
  skull.position.set(0, 0.035, 0.14)
  headPivot.add(skull)
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 14), skinMat)
  snout.scale.set(0.82, 0.6, 1.05)
  snout.position.set(0, -0.012, 0.40)
  headPivot.add(snout)
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.014, 0.30), darkMat)
  mouth.position.set(0, -0.052, 0.38)
  headPivot.add(mouth)
  // lower jaw: body + beak-like edge + upturned tip
  const jawPivot = new THREE.Group()
  jawPivot.position.set(0, -0.048, 0.28)
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), skinMat)
  jaw.scale.set(0.8, 0.3, 0.95)
  jaw.position.set(0, -0.028, 0.13)
  jawPivot.add(jaw)
  const jawEdge = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.012, 0.22), darkMat)
  jawEdge.position.set(0, 0.012, 0.22)
  jawPivot.add(jawEdge)
  const jawTip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), skinMat)
  jawTip.scale.set(1.2, 0.6, 1.6)
  jawTip.position.set(0, 0.005, 0.30)
  jawPivot.add(jawTip)
  headPivot.add(jawPivot)
  const irisMat = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.45, metalness: 0.2 })
  for (const side of [1, -1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), darkMat)
    nostril.position.set(side * 0.033, 0.02, 0.52)
    headPivot.add(nostril)
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 12), eyeMat)
    eye.scale.set(1, 1.08, 0.95)
    eye.position.set(side * 0.155, 0.08, 0.285)
    headPivot.add(eye)
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), shineMat)
    shine.position.set(side * 0.17, 0.112, 0.33)
    headPivot.add(shine)
    // golden iris ring around the eye
    const iris = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 8, 24), irisMat)
    iris.position.copy(eye.position)
    iris.rotation.y = side * (Math.PI / 2 - 0.35)
    iris.rotation.x = -0.15
    headPivot.add(iris)
    // auditory opening (oval pit behind the eye)
    const pit = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), darkMat)
    pit.scale.set(0.3, 1.0, 0.75)
    pit.position.set(side * 0.168, 0.04, 0.16)
    headPivot.add(pit)
  }
  g.add(headPivot)

  // shoulder / hip joints (bulges blending flippers into the shell)
  for (const sx of [1, -1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skinMat)
    shoulder.scale.set(1.0, 0.85, 1.3)
    shoulder.position.set(sx * 0.58, -0.03, 0.30)
    g.add(shoulder)
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9), skinMat)
    hip.scale.set(1.0, 0.85, 1.25)
    hip.position.set(sx * 0.52, -0.03, -1.02)
    g.add(hip)
  }

  // flippers (sculpted paddles, front large / rear small)
  const frontGeo = makeFlipperGeometry(1.0, 0.42, 0.05)
  const rearGeo = makeFlipperGeometry(0.6, 0.34, 0.04)
  const flippers = []
  for (const sx of [1, -1]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx * 0.60, -0.05, 0.30)
    pivot.rotation.y = sx > 0 ? 0.55 : Math.PI + 0.55
    pivot.add(new THREE.Mesh(frontGeo, skinMat))
    g.add(pivot)
    flippers.push({ pivot, front: true, side: sx })
  }
  for (const sx of [1, -1]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx * 0.55, -0.05, -1.00)
    pivot.rotation.y = sx > 0 ? 1.15 : Math.PI + 1.15
    pivot.add(new THREE.Mesh(rearGeo, skinMat))
    g.add(pivot)
    flippers.push({ pivot, front: false, side: sx })
  }

  // tail (base blend + joint pivot)
  const tailBase = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 9), skinMat)
  tailBase.scale.set(0.9, 0.7, 1.3)
  tailBase.position.set(0, -0.02, -1.30)
  g.add(tailBase)
  const tailPivot = new THREE.Group()
  tailPivot.position.set(0, -0.03, -1.30)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.44, 8), skinMat)
  tail.rotation.x = -Math.PI / 2
  tail.position.z = -0.18
  tailPivot.add(tail)
  g.add(tailPivot)

  g.scale.setScalar(1.15)
  return { group: g, flippers, head: headPivot, jaw: jawPivot, tailPivot }
}

function makeGullBodyCanvas() {
  const W = 128, H = 128
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f2f4f6'
  ctx.fillRect(0, 0, W, H)
  const back = ctx.createLinearGradient(0, 0, 0, H * 0.55)
  back.addColorStop(0, 'rgba(138,148,158,0.85)')
  back.addColorStop(1, 'rgba(138,148,158,0)')
  ctx.fillStyle = back
  ctx.fillRect(0, 0, W, H * 0.55)
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * W, y = Math.random() * H * 0.5
    ctx.fillStyle = `rgba(110,122,134,${0.05 + Math.random() * 0.1})`
    ctx.fillRect(x, y, 1.5, 1)
  }
  return c
}

function makeGullWingCanvas() {
  const W = 256, H = 128
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0, '#eef1f3')
  g.addColorStop(0.5, '#ccd3d9')
  g.addColorStop(0.75, '#98a1aa')
  g.addColorStop(0.82, '#4a525a')
  g.addColorStop(0.9, '#262c32')
  g.addColorStop(1, '#1c2126')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // feather separations, denser and more splayed toward the tip
  for (let i = 0; i < 46; i++) {
    const x = 14 + (i / 46) * (W - 20) + Math.random() * 3
    const lean = 4 + (x / W) * 14
    ctx.strokeStyle = `rgba(45,54,64,${0.08 + Math.random() * 0.1})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, 2)
    ctx.lineTo(x - lean, H - 2)
    ctx.stroke()
  }
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.07})`
    ctx.fillRect(Math.random() * W * 0.8, Math.random() * H, 1, 1)
  }
  return c
}

function makeGullBodyGeometry() {
  // body of revolution: pointed breast -> plump middle -> narrow rear
  const pts2d = [
    [0.004, 0.34], [0.055, 0.30], [0.095, 0.22], [0.125, 0.10],
    [0.135, -0.02], [0.115, -0.12], [0.075, -0.22], [0.035, -0.30], [0.004, -0.33]
  ]
  const curve = new THREE.CatmullRomCurve3(pts2d.map((p) => new THREE.Vector3(p[0], p[1], 0)))
  const pts = curve.getPoints(24).map((p) => new THREE.Vector2(Math.max(0.002, p.x), p.y))
  const geo = new THREE.LatheGeometry(pts, 20)
  geo.rotateX(Math.PI / 2)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * 0.85)
  geo.computeVertexNormals()
  return geo
}

function makeGullWingSegment(points) {
  const s = new THREE.Shape()
  s.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) {
    if (i < points.length - 1) {
      const c = points[i]
      const nx = points[i + 1][0], ny = points[i + 1][1]
      s.quadraticCurveTo(c[0], c[1], (c[0] + nx) / 2, (c[1] + ny) / 2)
    } else {
      s.lineTo(points[i][0], points[i][1])
    }
  }
  s.closePath()
  const geo = new THREE.ShapeGeometry(s, 10)
  geo.rotateX(Math.PI / 2)
  const uv = geo.attributes.uv
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i)
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - minU) / (maxU - minU), (uv.getY(i) - minV) / (maxV - minV))
  }
  return geo
}

// coverts / secondaries: body -> elbow
const GULL_WING_INNER = [
  [0, 0.03], [0.16, 0.13], [0.34, 0.17], [0.50, 0.17],
  [0.62, 0.10], [0.64, -0.02], [0.52, -0.13], [0.30, -0.15], [0.08, -0.10]
]
// primaries: elbow -> tip
const GULL_WING_OUTER = [
  [0, 0.03], [0.22, 0.085], [0.42, 0.07], [0.54, 0.02],
  [0.53, -0.05], [0.40, -0.10], [0.18, -0.11], [0.0, -0.06]
]

function makeGullCovertCanvas() {
  const W = 256, H = 128
  const c = makeCanvas(W, H)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0, '#f4f6f8')
  g.addColorStop(0.6, '#dde2e7')
  g.addColorStop(1, '#b8c0c8')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // scalloped covert rows radiating from the shoulder
  for (let k = 0; k < 7; k++) {
    const r = 26 + k * 30
    ctx.strokeStyle = `rgba(110,122,134,${0.30 - k * 0.035})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, H / 2, r, -1.15, 1.15)
    ctx.stroke()
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.08})`
    ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1)
  }
  return c
}

function makeGull(texAssets) {
  const g = new THREE.Group()
  const bodyTex = toTexture(makeGullBodyCanvas())
  const covertTex = toTexture(makeGullCovertCanvas())
  const primaryTex = toTexture(makeGullWingCanvas())
  if (texAssets) texAssets.push(bodyTex, covertTex, primaryTex)

  const whiteMat = new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.75 })
  const covertMat = new THREE.MeshStandardMaterial({ map: covertTex, roughness: 0.7, side: THREE.DoubleSide })
  const primaryMat = new THREE.MeshStandardMaterial({ map: primaryTex, roughness: 0.7, side: THREE.DoubleSide })
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xe09a1c, roughness: 0.5 })
  const beakLowerMat = new THREE.MeshStandardMaterial({ color: 0x6a5638, roughness: 0.55 })
  const beakTipMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5 })
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.35 })
  const eyeRingMat = new THREE.MeshStandardMaterial({ color: 0x33383e, roughness: 0.6 })

  // body of revolution (plump breast, narrow rear)
  const body = new THREE.Mesh(makeGullBodyGeometry(), whiteMat)
  g.add(body)

  // tail fan: 5 slightly spread feathers, raised
  const featherGeo = new THREE.PlaneGeometry(0.05, 0.21)
  featherGeo.translate(0, -0.105, 0)
  const tailPivot = new THREE.Group()
  tailPivot.position.set(0, 0.02, -0.30)
  for (let i = 0; i < 5; i++) {
    const feather = new THREE.Mesh(featherGeo, whiteMat)
    feather.rotation.set(1.92, (i - 2) * 0.26, 0)
    tailPivot.add(feather)
  }
  g.add(tailPivot)

  // curved neck (tube along an S-curve)
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.24),
    new THREE.Vector3(0, 0.09, 0.33),
    new THREE.Vector3(0, 0.15, 0.42)
  ])
  g.add(new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 12, 0.05, 10), whiteMat))

  // head + dark eye-ring + eyes
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), whiteMat)
  head.scale.set(0.9, 0.95, 1.15)
  head.position.set(0, 0.17, 0.47)
  g.add(head)
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), eyeMat)
    eye.position.set(side * 0.058, 0.185, 0.515)
    g.add(eye)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0045, 6, 20), eyeRingMat)
    ring.position.copy(eye.position)
    ring.rotation.y = side * Math.PI / 2
    g.add(ring)
  }
  // beak: orange upper mandible + corythaide knob + dark lower mandible + black tip
  const beakUpper = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.11, 8), beakMat)
  beakUpper.rotation.x = Math.PI / 2 + 0.18
  beakUpper.position.set(0, 0.165, 0.555)
  g.add(beakUpper)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), beakMat)
  knob.position.set(0, 0.185, 0.535)
  g.add(knob)
  const beakTip = new THREE.Mesh(new THREE.ConeGeometry(0.010, 0.032, 8), beakTipMat)
  beakTip.rotation.x = Math.PI / 2 + 0.18
  beakTip.position.set(0, 0.149, 0.605)
  g.add(beakTip)
  const beakLower = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.075, 8), beakLowerMat)
  beakLower.rotation.x = Math.PI / 2 + 0.30
  beakLower.position.set(0, 0.152, 0.565)
  g.add(beakLower)
  // tucked legs
  for (const side of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.08, 6), beakMat)
    leg.rotation.x = Math.PI / 2
    leg.position.set(side * 0.032, -0.11, -0.05)
    g.add(leg)
  }

  // two-segment wings: shoulder pivot -> coverts -> elbow -> primaries
  const innerGeo = makeGullWingSegment(GULL_WING_INNER)
  const outerGeo = makeGullWingSegment(GULL_WING_OUTER)
  const mkSide = (mirror) => {
    const pivot = new THREE.Group()
    pivot.position.set(mirror ? -0.05 : 0.05, 0.06, 0.06)
    if (mirror) pivot.rotation.y = Math.PI
    pivot.add(new THREE.Mesh(innerGeo, covertMat))
    const elbow = new THREE.Group()
    elbow.position.set(0.58, 0, 0.02)
    elbow.add(new THREE.Mesh(outerGeo, primaryMat))
    pivot.add(elbow)
    g.add(pivot)
    return { pivot, elbow }
  }
  const { pivot: pivotL, elbow: elbowL } = mkSide(false)
  const { pivot: pivotR, elbow: elbowR } = mkSide(true)
  return { group: g, pivotL, pivotR, elbowL, elbowR }
}

// ---------- scene ----------

export function useOceanScene(containerRef) {
  let renderer, scene, camera, orbit, frame, stopCameraMove
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
    stopCameraMove = useCameraMove(camera, orbit, 20)

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
      const sandTex = toTexture(makeSandCanvas())
      sandTex.repeat.set(10, 10)
      texAssets.push(sandTex)
      const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: sandTex, bumpMap: sandTex, bumpScale: 0.3, vertexColors: true, roughness: 0.95, metalness: 0
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
      const islandTex = toTexture(makeIslandCanvas())
      texAssets.push(islandTex)
      const island = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: islandTex, bumpMap: islandTex, bumpScale: 0.3, roughness: 0.95
      }))
      island.position.y = -0.5
      island.castShadow = true
      island.receiveShadow = true
      scene.add(island)

      // shoreline foam ring
      const foam = new THREE.Mesh(
        new THREE.TorusGeometry(13.5, 0.06, 6, 72),
        new THREE.MeshBasicMaterial({ color: 0xf5fbff, transparent: true, opacity: 0.35, depthWrite: false })
      )
      foam.rotation.x = Math.PI / 2
      foam.scale.set(1, 0.5, 1)
      foam.position.y = -0.02
      scene.add(foam)

      // shrub clusters
      const shrubColors = [0x3f7a45, 0x4a8a4f, 0x35703d]
      const shrubSpots = [[2.5, 0.5], [-3, -2], [1, -4], [-2, 3.5], [4, 2.8], [-4.5, 1.5]]
      for (let i = 0; i < shrubSpots.length; i++) {
        const [dx, dz] = shrubSpots[i]
        const d = Math.hypot(dx, dz)
        const bush = new THREE.Group()
        const bmat = new THREE.MeshStandardMaterial({ color: shrubColors[i % 3], roughness: 0.9, flatShading: true })
        for (let b = 0; b < 3; b++) {
          const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 + Math.random() * 0.25, 1), bmat)
          blob.scale.set(1 + Math.random() * 0.4, 0.55 + Math.random() * 0.2, 1 + Math.random() * 0.4)
          blob.position.set((Math.random() - 0.5) * 0.5, 0.22, (Math.random() - 0.5) * 0.5)
          blob.castShadow = true
          bush.add(blob)
        }
        bush.position.set(dx, islandTopY(d), dz)
        scene.add(bush)
      }

      // palm trees (curved ringed trunks + leaflet fronds + coconuts)
      {
        const trunkTex = toTexture(makeTrunkCanvas())
        texAssets.push(trunkTex)
        const trunkMat = new THREE.MeshStandardMaterial({ map: trunkTex, bumpMap: trunkTex, bumpScale: 0.15, roughness: 0.9 })
        const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f8a4a, roughness: 0.8, side: THREE.DoubleSide })
        const cocoMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.9 })
        const cocoGeo = new THREE.SphereGeometry(0.09, 8, 6)
        const palms = [
          [4.5, 0], [6.5, 1.2], [8, -2.5], [5.5, -4], [-6, 3], [-4, -5.5]
        ]
        const m4 = new THREE.Matrix4()
        for (const [dx, dz] of palms) {
          const d = Math.hypot(dx, dz)
          const palm = new THREE.Group()
          const lean = 0.6 + Math.random() * 1.2
          const trunkCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0.04 * lean, 1.0, 0.02 * lean),
            new THREE.Vector3(0.14 * lean, 2.0, 0.05 * lean),
            new THREE.Vector3(0.26 * lean, 2.85, 0.08 * lean)
          ])
          const trunkGeo = new THREE.TubeGeometry(trunkCurve, 12, 0.11, 8)
          {
            const tv = trunkGeo.attributes.uv
            const tp = trunkGeo.attributes.position
            for (let i = 0; i < tp.count; i++) {
              const tt = tv.getX(i)
              const f = 1.3 - 0.75 * tt
              const c = trunkCurve.getPoint(tt)
              tp.setX(i, c.x + (tp.getX(i) - c.x) * f)
              tp.setZ(i, c.z + (tp.getZ(i) - c.z) * f)
            }
            trunkGeo.computeVertexNormals()
          }
          const trunk = new THREE.Mesh(trunkGeo, trunkMat)
          trunk.castShadow = true
          palm.add(trunk)
          // crown: 8 fronds merged into one mesh
          const crownParts = []
          for (let i = 0; i < 8; i++) {
            const geo = makePalmFrondGeometry(Math.random() * 0.5, Math.random)
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
              -0.08 + Math.random() * 0.18,
              (i / 8) * Math.PI * 2 + Math.random() * 0.3,
              0
            ))
            m4.compose(new THREE.Vector3(0, (i % 2) * 0.05, 0), q, new THREE.Vector3(1, 1, 1))
            geo.applyMatrix4(m4)
            crownParts.push(geo)
          }
          const crown = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(crownParts), frondMat)
          const crownPos = trunkCurve.getPoint(1)
          crown.position.set(crownPos.x, crownPos.y + 0.02, crownPos.z)
          crown.castShadow = true
          palm.add(crown)
          // coconuts
          for (let k = 0; k < 3; k++) {
            const a = Math.random() * Math.PI * 2
            const coco = new THREE.Mesh(cocoGeo, cocoMat)
            coco.position.set(crownPos.x + Math.cos(a) * 0.1, crownPos.y - 0.08, crownPos.z + Math.sin(a) * 0.1)
            palm.add(coco)
          }
          palm.position.set(dx, islandTopY(d), dz)
          palm.rotation.y = Math.random() * Math.PI * 2
          scene.add(palm)
        }
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
      const types = [0, 1, 2, 3, 4].map((t) => ({
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
      const fishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide })
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
      const t = makeTurtle(texAssets)
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

    // ---- jellyfish (lathe bell + rim + core + GPU-swayed tentacles) ----
    {
      const hues = [0xff7ab8, 0xc88aff, 0x7ad8ff, 0xff9a6a, 0x9affc8, 0x8aff9a, 0xffa0e0, 0xa0c8ff]
      const bellGeo = makeJellyBellGeometry()
      for (let i = 0; i < 8; i++) {
        const hue = hues[i % 8]
        const bellMat = new THREE.MeshStandardMaterial({
          color: hue, emissive: hue, emissiveIntensity: 0.45,
          transparent: true, opacity: 0.42, roughness: 0.3, side: THREE.DoubleSide
        })
        const coreMat = new THREE.MeshStandardMaterial({
          color: hue, emissive: hue, emissiveIntensity: 0.9,
          transparent: true, opacity: 0.5, roughness: 0.3, side: THREE.DoubleSide
        })
        const tentMat = makeJellyTentMat(hue)
        const g = new THREE.Group()
        g.add(new THREE.Mesh(bellGeo, bellMat))
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), coreMat)
        core.scale.set(1, 0.85, 1)
        core.position.y = 0.16
        g.add(core)
        // 8 thin tentacles + 4 thick oral arms, merged into one sway-animated mesh
        const tentParts = []
        for (let tIdx = 0; tIdx < 8; tIdx++) {
          const a = (tIdx / 8) * Math.PI * 2
          tentParts.push(makeTentacleGeometry(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.016, 1.5, 0.5))
        }
        for (let aIdx = 0; aIdx < 4; aIdx++) {
          const a = (aIdx / 4) * Math.PI * 2 + 0.4
          tentParts.push(makeTentacleGeometry(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.045, 0.8, 1.2))
        }
        g.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(tentParts, false), tentMat))
        scene.add(g)
        jellies.push({
          group: g,
          tentMat,
          base: new THREE.Vector3(
            Math.cos(i * 2.2) * (18 + (i % 3) * 7),
            -1.2 - (i % 3) * 0.8,
            Math.sin(i * 2.2) * (18 + (i % 3) * 7)
          ),
          phase: Math.random() * Math.PI * 2,
          drift: 0.15 + Math.random() * 0.15
        })
      }
    }

    // ---- gulls ----
    for (let i = 0; i < 7; i++) {
      const gull = makeGull(texAssets)
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
    const _qt = new THREE.Quaternion()
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
      for (const j of jellies) {
        const sh = j.tentMat?.userData.shader
        if (sh) sh.uniforms.uTime.value = t
      }
      if (beamGroup) {
        beamGroup.rotation.y = t * 0.9
        lampLight.intensity = 100 + 60 * Math.max(0, Math.sin(t * 0.9 * 2))
      }

      // fish schools (with swim undulation)
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
          _qt.setFromAxisAngle(Z_AXIS, Math.sin(t * 7 + i * 0.9 + sc.phase) * 0.16)
          dummy.quaternion.multiply(_qt)
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
        const radius = 20 + (1 - diveT) * 7
        const ta = t * 0.08
        const tx = Math.cos(ta) * radius
        const tz = Math.sin(ta) * radius
        let ty = -1.2 - diveT * 1.6 + Math.sin(t * 0.4) * 0.2
        ty = Math.max(ty, floorHeight(tx, tz) + 1.1)
        turtle.group.position.set(tx, ty, tz)
        _n.set(-Math.sin(ta), 0, Math.cos(ta))
        _q.setFromUnitVectors(Z_AXIS, _n)
        turtle.group.quaternion.copy(_q)
        turtle.group.rotateZ(0.12 + diveT * 0.18)
        // head: turn + dive/surface nod, slow jaw breathing
        turtle.head.rotation.y = Math.sin(t * 0.5) * 0.18
        turtle.head.rotation.x = (0.5 - diveT) * 0.6 + Math.sin(t * 0.3) * 0.08
        turtle.jaw.rotation.x = 0.045 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.55))
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

      // gulls (shoulder + elbow wing kinematics)
      for (const g of gulls) {
        const a = t * g.speed + g.phase
        g.group.position.set(Math.cos(a) * g.R, g.y + Math.sin(t * 0.7 + g.phase) * 0.6, Math.sin(a) * g.R)
        g.group.rotation.y = -a
        const flap = Math.sin(t * 7 + g.phase) * 0.5
        g.pivotL.rotation.z = 0.15 + flap
        g.pivotR.rotation.z = 0.15 + flap
        g.elbowL.rotation.z = 0.30 + flap * 0.7
        g.elbowR.rotation.z = 0.30 + flap * 0.7
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
