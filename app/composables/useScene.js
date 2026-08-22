import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useCameraMove } from './useCameraMove'

// Simple 2D value noise (no external dependency)
class SimpleNoise {
  constructor(seed = 42) {
    this.perm = new Uint8Array(512)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    let s = seed
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647
      const j = s % (i + 1)
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
  }

  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10) }
  lerp(a, b, t) { return a + t * (b - a) }

  grad(hash, x, y) {
    const h = hash & 3
    const u = h < 2 ? x : y
    const v = h < 2 ? y : x
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
  }

  noise2D(x, y) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u = this.fade(x)
    const v = this.fade(y)
    const A = this.perm[X] + Y
    const B = this.perm[X + 1] + Y
    return this.lerp(
      this.lerp(this.grad(this.perm[A], x, y), this.grad(this.perm[B], x - 1, y), u),
      this.lerp(this.grad(this.perm[A + 1], x, y - 1), this.grad(this.perm[B + 1], x - 1, y - 1), u),
      v
    )
  }

  fbm(x, y, octaves = 6) {
    let val = 0, amp = 0.5, freq = 1
    for (let i = 0; i < octaves; i++) {
      val += amp * this.noise2D(x * freq, y * freq)
      amp *= 0.5
      freq *= 2
    }
    return val
  }
}

// ---------- canvas textures ----------

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

function tileSpeckle(ctx, size, n, colors, sMin = 1, sMax = 2.5) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const s = sMin + Math.random() * (sMax - sMin)
    ctx.fillStyle = colors[i % colors.length]
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.fillRect(x + ox, y + oy, s, s)
      }
    }
  }
}

function tileGrassBlades(ctx, size, n, colors, hMin = 3, hMax = 7) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const h = hMin + Math.random() * (hMax - hMin)
    const lean = (Math.random() - 0.5) * 4
    ctx.strokeStyle = colors[i % colors.length]
    ctx.lineWidth = 1
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath()
        ctx.moveTo(x + ox, y + oy)
        ctx.quadraticCurveTo(x + ox + lean * 0.4, y + oy - h * 0.6, x + ox + lean, y + oy - h)
        ctx.stroke()
      }
    }
  }
}

// pale ground speckle — multiplied over vertex colors, so it adds grain without tinting
function makeGroundTexture(repeat) {
  return makeTileTexture(512, (ctx, size) => {
    ctx.fillStyle = '#e8ece2'
    ctx.fillRect(0, 0, size, size)
    tileBlobs(ctx, size, 240, 6, 22, [
      'rgba(214,224,196,0.55)', 'rgba(226,216,186,0.45)',
      'rgba(196,212,178,0.5)', 'rgba(232,238,226,0.5)'
    ])
    tileGrassBlades(ctx, size, 900, [
      'rgba(120,140,100,0.16)', 'rgba(150,165,120,0.18)', 'rgba(255,255,240,0.2)'
    ])
    tileSpeckle(ctx, size, 2200, ['rgba(90,110,80,0.14)', 'rgba(255,255,235,0.16)'])
  }, repeat)
}

// vertical bark (seamless horizontally via x wrap)
function makeBarkTexture() {
  return makeTileTexture(512, (ctx, size) => {
    ctx.fillStyle = '#6a4f36'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 110; i++) {
      const x = Math.random() * size
      const w = 2 + Math.random() * 8
      const d = 30 + Math.random() * 45
      ctx.strokeStyle = `rgba(${d + 42},${d + 20},${Math.round(d * 0.62)},${0.3 + Math.random() * 0.35})`
      ctx.lineWidth = w
      for (const ox of [-size, 0, size]) {
        ctx.beginPath()
        let xx = x + ox
        let yy = -12
        ctx.moveTo(xx, yy)
        while (yy < size + 12) {
          yy += 28 + Math.random() * 46
          xx = x + ox + (Math.random() - 0.5) * 12
          ctx.lineTo(xx, yy)
        }
        ctx.stroke()
      }
    }
    // pale lichen dashes
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      ctx.fillStyle = 'rgba(190,178,150,0.28)'
      for (const ox of [-size, 0, size]) ctx.fillRect(x + ox, y, 2 + Math.random() * 5, 1.5)
    }
  }, 1)
}

// pine needle streaks along u (branch length)
function makeNeedleTexture() {
  return makeTileTexture(256, (ctx, size) => {
    ctx.fillStyle = '#2c5422'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 340; i++) {
      const y = Math.random() * size
      const len = 10 + Math.random() * 30
      const x = Math.random() * size
      const g = Math.round(70 + Math.random() * 60)
      ctx.strokeStyle = `rgba(${g * 0.55},${g},${g * 0.4},0.35)`
      ctx.lineWidth = 1 + Math.random() * 1.5
      for (const ox of [-size, 0, size]) {
        ctx.beginPath()
        ctx.moveTo(x + ox, y)
        ctx.lineTo(x + ox + len, y + (Math.random() - 0.5) * 3)
        ctx.stroke()
      }
    }
    tileBlobs(ctx, size, 60, 8, 26, ['rgba(48,92,40,0.5)', 'rgba(74,122,58,0.35)'])
  }, 1)
}

// A small leafy twig on a transparent background. One instanced card carrying
// this texture reads as a handful of real leaves, so canopies are built from
// thousands of such sprigs clustered on branch tips instead of blob spheres.
function makeLeafSprigTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)

  const rand = makeSeededRand(99)

  // twig: gentle curve from bottom-left up to top-right
  const steps = 22
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push({
      x: size * 0.2 + t * size * 0.6 + Math.sin(t * 2.6) * 12,
      y: size * 0.93 - t * size * 0.76
    })
  }
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#5a4028'
  ctx.lineWidth = 11
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (const p of pts) ctx.lineTo(p.x, p.y)
  ctx.stroke()

  // leaves along the twig, alternating sides
  const leafColors = ['#3f7d23', '#4a8c2a', '#57a036', '#63a83e', '#74b34c']
  for (let i = 2; i <= steps; i += 2) {
    const side = i % 4 === 2 ? 1 : -1
    const t = i / steps
    const p = pts[i]
    const len = size * (0.13 + rand() * 0.07) * (1 - t * 0.2)
    const ang = -Math.PI / 2 + side * (0.7 + rand() * 0.5) + (rand() - 0.5) * 0.3
    const grad = ctx.createLinearGradient(p.x, p.y, p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len)
    grad.addColorStop(0, leafColors[Math.floor(rand() * leafColors.length)])
    grad.addColorStop(1, '#7ab648')
    ctx.fillStyle = grad
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(ang)
    ctx.beginPath()
    ctx.ellipse(len * 0.5, 0, len * 0.5, len * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(24,52,16,0.5)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(2, 0)
    ctx.lineTo(len * 0.9, 0)
    ctx.stroke()
    ctx.restore()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

// Dropped needle tuft for pine branch tips: a short lofted teardrop that
// continues the branch's droop, so the lofted twigs read as full branches.
function buildNeedleTuftGeo() {
  return makeLoft([
    { x: 0, cy: 0, ry: 0.06, rz: 0.045 },
    { x: 0.3, cy: -0.02, ry: 0.042, rz: 0.032 },
    { x: 0.55, cy: -0.045, ry: 0.012, rz: 0.01 }
  ], 5)
}

// horizontal planks with grain + gaps
function makePlankTexture() {
  return makeTileTexture(512, (ctx, size) => {
    const rows = 4
    const rh = size / rows
    for (let r = 0; r < rows; r++) {
      const base = 96 + Math.random() * 30
      ctx.fillStyle = `rgb(${base + 42},${base + 14},${base * 0.62})`
      ctx.fillRect(0, r * rh, size, rh)
      for (let i = 0; i < 60; i++) {
        const y = r * rh + Math.random() * rh
        const d = base * (0.55 + Math.random() * 0.4)
        ctx.strokeStyle = `rgba(${d},${d * 0.75},${d * 0.5},0.5)`
        ctx.lineWidth = 0.8 + Math.random() * 1.4
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 6, size * 0.7, y + (Math.random() - 0.5) * 6, size, y)
        ctx.stroke()
      }
      // gap + nails
      ctx.fillStyle = 'rgba(30,22,14,0.75)'
      ctx.fillRect(0, r * rh, size, 2)
      ctx.fillStyle = 'rgba(50,40,28,0.9)'
      for (const nx of [size * 0.12, size * 0.5, size * 0.88]) ctx.fillRect(nx, r * rh + rh / 2 - 1.5, 3, 3)
    }
  }, 1)
}

// stone mottle with cracks
function makeStoneTexture() {
  return makeTileTexture(256, (ctx, size) => {
    ctx.fillStyle = '#7d7d7d'
    ctx.fillRect(0, 0, size, size)
    tileBlobs(ctx, size, 90, 6, 24, [
      'rgba(120,120,124,0.55)', 'rgba(90,92,96,0.5)',
      'rgba(140,138,134,0.45)', 'rgba(70,74,80,0.4)'
    ])
    ctx.strokeStyle = 'rgba(52,52,56,0.5)'
    for (let i = 0; i < 26; i++) {
      let x = Math.random() * size
      let y = Math.random() * size
      ctx.lineWidth = 0.7 + Math.random() * 1.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let s = 0; s < 5; s++) {
        x += (Math.random() - 0.5) * 40
        y += (Math.random() - 0.5) * 40
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    tileSpeckle(ctx, size, 900, ['rgba(40,40,44,0.2)', 'rgba(190,190,192,0.2)'], 1, 2)
  }, 1)
}

// fly-agaric cap: pale base, soft-shadowed white spots (tinted per instance)
function makeAmanitaTexture() {
  return makeTileTexture(256, (ctx, size) => {
    ctx.fillStyle = '#f2e8dc'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = 8 + Math.random() * 14
      const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.5)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(0.7, 'rgba(255,255,255,0.85)')
      g.addColorStop(1, 'rgba(120,90,80,0.28)')
      ctx.fillStyle = g
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          ctx.beginPath()
          ctx.arc(x + ox, y + oy, r * 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }, 1)
}

// fawn fur: warm base with darker spots
function makeFawnTexture() {
  return makeTileTexture(256, (ctx, size) => {
    ctx.fillStyle = '#c99a68'
    ctx.fillRect(0, 0, size, size)
    tileBlobs(ctx, size, 70, 4, 10, ['rgba(160,116,72,0.4)'])
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = 3 + Math.random() * 5
      ctx.fillStyle = `rgba(122,84,48,${0.5 + Math.random() * 0.3})`
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          ctx.beginPath()
          ctx.ellipse(x + ox, y + oy, r, r * (0.7 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }, 1)
}

// adult deer roan coat: warm fawn-brown base, mottled grizzle, fine fur grain
function makeDeerCoatTexture() {
  return makeTileTexture(256, (ctx, size) => {
    ctx.fillStyle = '#9a6a40'
    ctx.fillRect(0, 0, size, size)
    tileBlobs(ctx, size, 90, 6, 18, [
      'rgba(126,86,48,0.4)', 'rgba(150,106,60,0.45)', 'rgba(92,60,34,0.3)'
    ])
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const len = 3 + Math.random() * 7
      const l = Math.random()
      ctx.strokeStyle = l < 0.45 ? 'rgba(74,48,26,0.2)' : l < 0.8 ? 'rgba(176,132,84,0.16)' : 'rgba(214,180,136,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 2, y + len)
      ctx.stroke()
    }
    tileSpeckle(ctx, size, 500, ['rgba(60,38,20,0.18)', 'rgba(220,190,150,0.1)'], 1, 2)
  }, 1)
}

// antler bone: pale tan with vertical ridges and darker growth mottling
function makeAntlerTexture() {
  return makeTileTexture(128, (ctx, size) => {
    ctx.fillStyle = '#b9a488'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * size
      ctx.strokeStyle = `rgba(96,76,54,${0.15 + Math.random() * 0.3})`
      ctx.lineWidth = 1 + Math.random() * 2.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + (Math.random() - 0.5) * 10, size)
      ctx.stroke()
    }
    tileBlobs(ctx, size, 30, 3, 9, ['rgba(140,116,88,0.35)', 'rgba(226,210,186,0.3)'])
    tileSpeckle(ctx, size, 300, ['rgba(80,62,44,0.2)'], 1, 2)
  }, 1)
}

// squirrel coat: warm rust base with mottled undertone and fine grain
function makeSquirrelFurTexture() {
  return makeTileTexture(256, (ctx, size) => {
    ctx.fillStyle = '#a5622f'
    ctx.fillRect(0, 0, size, size)
    tileBlobs(ctx, size, 50, 5, 13, ['rgba(122,72,36,0.35)', 'rgba(190,140,90,0.25)'])
    tileSpeckle(ctx, size, 650, ['rgba(58,34,16,0.16)', 'rgba(232,204,166,0.10)'], 1, 2.2)
  }, 1)
}

// log end rings
function makeRingsTexture() {
  return makeTileTexture(128, (ctx, size) => {
    ctx.fillStyle = '#c9a875'
    ctx.fillRect(0, 0, size, size)
    for (let r = 6; r < size * 0.72; r += 4 + Math.random() * 5) {
      ctx.strokeStyle = `rgba(150,112,66,${0.35 + Math.random() * 0.3})`
      ctx.lineWidth = 1 + Math.random() * 1.5
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, 1)
}

// ---------- loft (swept elliptical cross-sections, built along +X) ----------

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

// Merged "real-branch pine" (summer, no snow): lofted tapered trunk + whorls of
// lofted drooping branches. Returns merged geometries (wood / needles) plus the
// branch layout, so needle tufts can be scattered along the same branches.
function buildPineGeos(rand) {
  const wood = []
  const needles = []
  const branches = []
  const X = new THREE.Vector3(1, 0, 0)

  const trunk = makeLoft([
    { x: 0, cy: 0, ry: 0.17, rz: 0.17 },
    { x: 0.9, cy: 0, ry: 0.125, rz: 0.125 },
    { x: 1.9, cy: 0, ry: 0.095, rz: 0.095 },
    { x: 2.8, cy: 0, ry: 0.07, rz: 0.07 },
    { x: 3.5, cy: 0.02, ry: 0.05, rz: 0.05 }
  ], 6)
  trunk.rotateZ(Math.PI / 2)
  wood.push(trunk)

  const loftTo = (sections, q, px, py, pz) => {
    const g = makeLoft(sections, 5)
    g.applyQuaternion(q)
    g.translate(px, py, pz)
    return g
  }

  const addBranch = (y, a, len, droop, baseR) => {
    const d = new THREE.Vector3(Math.cos(a), -droop, Math.sin(a)).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(X, d)
    const px = Math.cos(a) * 0.13
    const pz = Math.sin(a) * 0.13
    const sec = [
      { x: 0, cy: 0, ry: baseR, rz: baseR },
      { x: len * 0.4, cy: 0, ry: baseR * 0.7, rz: baseR * 0.7 },
      { x: len * 0.75, cy: -0.015, ry: baseR * 0.4, rz: baseR * 0.4 },
      { x: len, cy: -0.04, ry: baseR * 0.12, rz: baseR * 0.12 }
    ]
    needles.push(loftTo(sec, q, px, y, pz))
    branches.push({ ox: px, oy: y, oz: pz, dir: d, len })
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
      addBranch(w.y, a, w.len * (0.85 + rand() * 0.3), w.droop * (0.8 + rand() * 0.4), w.r)
    }
  }

  const tip = makeLoft([
    { x: 0, cy: 0, ry: 0.09, rz: 0.09 },
    { x: 0.5, cy: 0, ry: 0.05, rz: 0.05 },
    { x: 0.85, cy: 0, ry: 0.015, rz: 0.015 }
  ], 5)
  tip.rotateZ(Math.PI / 2)
  tip.translate(0, 3.1, 0)
  needles.push(tip)

  return {
    wood: BufferGeometryUtils.mergeGeometries(wood, false),
    needles: BufferGeometryUtils.mergeGeometries(needles, false),
    branches
  }
}

// Deciduous: lofted slightly-curved trunk with lofted branches reaching into the
// canopy. Returns the merged wood geometry (trunk + branches) plus the branch
// layout, so leaf cards can be clustered on the same branch tips.
function buildDeciduousWood(rand) {
  const parts = []
  const branches = []
  const X = new THREE.Vector3(1, 0, 0)

  const trunk = makeLoft([
    { x: 0, cy: 0, ry: 0.34, rz: 0.34 },
    { x: 0.8, cy: 0.05, ry: 0.24, rz: 0.24 },
    { x: 1.8, cy: 0.12, ry: 0.16, rz: 0.16 },
    { x: 2.8, cy: 0.18, ry: 0.1, rz: 0.1 },
    { x: 3.4, cy: 0.22, ry: 0.06, rz: 0.06 }
  ], 6)
  trunk.rotateZ(Math.PI / 2)
  parts.push(trunk)

  const branchSpecs = [
    { y: 2.2, len: 1.5, up: 0.55, r: 0.09 },
    { y: 2.6, len: 1.7, up: 0.7, r: 0.08 },
    { y: 3.0, len: 1.3, up: 0.8, r: 0.06 },
    { y: 3.3, len: 0.9, up: 0.9, r: 0.045 }
  ]
  const yaw0 = rand() * Math.PI * 2
  branchSpecs.forEach((bs, bi) => {
    const per = 3
    for (let b = 0; b < per; b++) {
      const a = yaw0 + (bi * per + b) * 2.1 + rand() * 0.6
      const d = new THREE.Vector3(Math.cos(a), bs.up, Math.sin(a)).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(X, d)
      const sec = [
        { x: 0, cy: 0, ry: bs.r, rz: bs.r },
        { x: bs.len * 0.5, cy: 0, ry: bs.r * 0.65, rz: bs.r * 0.65 },
        { x: bs.len, cy: 0, ry: bs.r * 0.25, rz: bs.r * 0.25 }
      ]
      const g = makeLoft(sec, 5)
      g.applyQuaternion(q)
      const bx = Math.cos(a) * 0.1
      const bz = Math.sin(a) * 0.1
      g.translate(bx, bs.y, bz)
      parts.push(g)
      branches.push({ ox: bx, oy: bs.y, oz: bz, dir: d, len: bs.len })
    }
  })

  return {
    geo: BufferGeometryUtils.mergeGeometries(parts, false),
    branches
  }
}

function makeSeededRand(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

export function useScene(containerRef) {
  let scene, camera, renderer, controls, animationId, stopCameraMove
  const texAssets = []
  let cloudGroups = []
  let lakeMaterial
  let grassWindShader = null
  let terrainHeights = {}

  const treeSpots = []
  const deciduousSpots = []

  // Deer herd
  const deerList = []

  // Squirrels
  const squirrels = []

  // Birds
  const birds = []

  // Butterflies
  const butterflies = []

  // Boat
  let boat = null

  // Pier tip (world pos)
  let pierTip = null

  // Falling leaves
  let leafMesh = null
  const leaves = []

  function windAt(x, z, t) {
    return {
      x: (Math.sin(x * 0.05 + t * 0.8) + Math.cos(z * 0.04 - t * 0.6) * 0.5) * 0.5,
      z: (Math.cos(x * 0.04 - t * 0.5) + Math.sin(z * 0.05 + t * 0.7) * 0.5) * 0.5,
    }
  }

  // Shared wind state, updated once per frame and read by every wind shader
  const windState = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2() }
  }

  // GPU wind sway: displaces vertices in the shader instead of recomposing
  // instance matrices on the CPU. Weight is per-vertex — local height for
  // lofted trunks/branches, or an `aSway` instance attribute for leaf cards
  // and needle tufts. Phase comes from the instance's world position, so
  // neighbouring trees move together in a travelling wave.
  function applyWindSway(material, amp, weightExpr, flutter = 0) {
    // onBeforeCompile is NOT part of the program cache key — without a
    // unique custom key, a material with identical standard parameters
    // (e.g. the tuft clone of needleMat) would reuse another's program.
    material.customProgramCacheKey = () => `wind-sway:${amp}:${weightExpr}:${flutter}`
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windState.uTime
      shader.uniforms.uWind = windState.uWind
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform vec2 uWind;${weightExpr === 'aSway' ? '\nattribute float aSway;' : ''}`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           {
             #ifdef USE_INSTANCING
               vec4 swayRoot = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
             #else
               vec4 swayRoot = vec4(0.0, 0.0, 0.0, 1.0);
             #endif
             float swayPhase = swayRoot.x * 0.31 + swayRoot.z * 0.23;
             float swayW = ${weightExpr};
             swayW = clamp(swayW, 0.0, 1.0);
             swayW *= swayW;
             float swayA = sin(uTime * 1.35 + swayPhase) + 0.5 * sin(uTime * 2.9 + swayPhase * 1.7 + 1.2);
             float swayB = cos(uTime * 1.05 + swayPhase * 1.31);
             transformed.x += (swayA * ${amp} + uWind.x * ${amp * 0.6}) * swayW;
             transformed.z += (swayB * ${amp} + uWind.y * ${amp * 0.6}) * swayW;
             ${flutter ? `transformed.x += sin(uTime * 5.5 + swayPhase * 3.1) * ${flutter} * swayW;` : ''}
           }`
        )
    }
  }

  // Noise instance
  const noise = new SimpleNoise(Math.random() * 1000 | 0)

  const autoRotate = ref(true)

  function toggleAutoRotate() {
    autoRotate.value = !autoRotate.value
    if (controls) controls.autoRotate = autoRotate.value
  }

  function init() {
    const container = containerRef.value
    if (!container) return

    // -- Scene --
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87ceeb)
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.004)

    // -- Camera --
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000)
    camera.position.set(0, 40, 80)

    // -- Renderer --
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    container.appendChild(renderer.domElement)

    // -- Controls --
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.3
    controls.maxPolarAngle = Math.PI / 2.1
    controls.minDistance = 20
    controls.maxDistance = 200
    controls.target.set(0, 5, 0)
    stopCameraMove = useCameraMove(camera, controls, 25)

    // -- Lighting --
    setupLights()

    // -- Scene elements --
    createTerrain()
    createLake()
    createTrees()
    createDeciduousTrees()
    createClouds()
    createRocks()
    createGrassPatches()
    createFlowers()
    createMushrooms()
    createBushes()
    createLogs()
    createPier()
    createBoat()
    createReeds()
    createDeerHerd()
    createSquirrels()
    createBirds()
    createButterflies()
    createLeaves()

    // -- Resize handler --
    window.addEventListener('resize', onResize)

    // -- Start animation --
    animate()
  }

  function setupLights() {
    // Hemisphere (sky/ground)
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a5f0b, 0.6)
    scene.add(hemi)

    // Ambient
    const ambient = new THREE.AmbientLight(0x404040, 0.4)
    scene.add(ambient)

    // Sun (directional)
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.8)
    sun.position.set(50, 80, 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -80
    sun.shadow.camera.right = 80
    sun.shadow.camera.top = 80
    sun.shadow.camera.bottom = -80
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 200
    sun.shadow.bias = -0.001
    scene.add(sun)

    // Subtle warm fill
    const fill = new THREE.DirectionalLight(0xffd4a6, 0.3)
    fill.position.set(-30, 20, -40)
    scene.add(fill)
  }

  // Terrain model:
  //  - rolling ground with a nominal minimum near 0 (bumps go a bit below 0 -> little streams)
  //  - a deep bowl carved in the center -> the lake
  //  - water fills a full-screen plane at WATER_Y (just below the terrain minimum),
  //    so it is only visible inside the bowl and in the stream dips
  const WATER_Y = -0.6
  const BOWL_RADIUS = 36
  const BOWL_BOTTOM = -11
  const SAFE_H = -0.1 // terrain height below which animals refuse to step

  function getHeight(x, z) {
    const key = `${x.toFixed(1)},${z.toFixed(1)}`
    if (terrainHeights[key] !== undefined) return terrainHeights[key]

    // Rolling ground: shifted so most of it sits at/above 0, with dips to ~-1.5
    const raw =
      noise.fbm(x * 0.015, z * 0.015, 6) * 30 +
      noise.fbm(x * 0.04, z * 0.04, 4) * 8 +
      noise.fbm(x * 0.1, z * 0.1, 3) * 2
    let h = raw * 0.6 + 5.4

    // Soft-cap broad dips: thin streams, not a second lake
    if (h < -1.8) h = -1.8 - (h + 1.8) * 0.25

    // Mountain rim near the outer edge only
    const rimT = (Math.max(Math.abs(x), Math.abs(z)) - 62) / 38
    if (rimT > 0) {
      h += rimT * 15 * Math.max(0, noise.fbm(x * 0.02 + 100, z * 0.02 + 100, 4) * 0.5 + 0.5)
    }

    // Bowl in the center (the lake)
    const d = Math.sqrt(x * x + z * z)
    if (d < BOWL_RADIUS) {
      const t = d / BOWL_RADIUS
      const bow = (1 - t) * (1 - t) * (3 - 2 * (1 - t))
      const floorH = BOWL_BOTTOM + noise.fbm(x * 0.08 + 40, z * 0.08 + 40, 3) * 1.5
      h = h * (1 - bow) + floorH * bow
    }

    terrainHeights[key] = h
    return h
  }

  function getTerrainColor(height) {
    const color = new THREE.Color()

    if (height < 0) {
      // Sandy bank / stream bed, darker the deeper it is
      color.setHex(0xc2b280)
      color.multiplyScalar(1 - Math.min(1, -height / 8) * 0.55)
    } else if (height < 3) {
      // Green grass
      color.setHex(0x4a8c2a)
      color.lerp(new THREE.Color(0x3d7a24), Math.random() * 0.3)
    } else if (height < 10) {
      // Forest green to brown
      color.setHex(0x3d7a24)
      color.lerp(new THREE.Color(0x8b7355), (height - 3) / 7)
    } else if (height < 18) {
      // Rock
      color.setHex(0x8b7355)
      color.lerp(new THREE.Color(0x707070), (height - 10) / 8)
    } else {
      // Snow cap
      color.setHex(0x707070)
      color.lerp(new THREE.Color(0xf5f5f5), Math.min(1, (height - 18) / 5))
    }
    return color
  }

  function createTerrain() {
    const size = 200
    const segments = 256
    const geo = new THREE.PlaneGeometry(size, size, segments, segments)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position
    const colors = []

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = getHeight(x, z)
      pos.setY(i, h)

      const color = getTerrainColor(h)
      // Add slight per-vertex noise for texture
      const noiseVal = noise.noise2D(x * 0.3, z * 0.3) * 0.05
      color.r = Math.max(0, Math.min(1, color.r + noiseVal))
      color.g = Math.max(0, Math.min(1, color.g + noiseVal))
      color.b = Math.max(0, Math.min(1, color.b + noiseVal))
      colors.push(color.r, color.g, color.b)
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const groundTex = makeGroundTexture(25)
    texAssets.push(groundTex)

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: groundTex,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: false,
    })

    const terrain = new THREE.Mesh(geo, mat)
    terrain.receiveShadow = true
    terrain.castShadow = true
    scene.add(terrain)
  }

  function createLake() {
    // Full-screen water plane, just below the terrain's minimum height:
    // only the bowl (lake) and the stream dips go underneath it
    const size = 200
    const segments = 160
    const geo = new THREE.PlaneGeometry(size, size, segments, segments)
    geo.rotateX(-Math.PI / 2)

    lakeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(0x1a5276) },
        uColor2: { value: new THREE.Color(0x2e86c1) },
        uOpacity: { value: 0.82 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying float vElevation;

        void main() {
          vUv = uv;
          vec3 pos = position;
          // geometry is baked horizontal: x/z are the planar coords, displace vertically
          float wave1 = sin(pos.x * 0.4 + uTime * 1.2) * cos(pos.z * 0.3 + uTime * 0.8) * 0.22;
          float wave2 = sin(pos.x * 0.9 + pos.z * 0.6 + uTime * 2.0) * 0.1;
          float wave3 = sin(pos.x * 1.8 - uTime * 1.5) * sin(pos.z * 1.4 + uTime) * 0.05;
          pos.y += wave1 + wave2 + wave3;
          vElevation = wave1 + wave2 + wave3;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uOpacity;
        uniform float uTime;
        varying vec2 vUv;
        varying float vElevation;

        void main() {
          float mixFactor = vUv.y + vElevation * 0.5;
          vec3 color = mix(uColor1, uColor2, mixFactor);

          // Sparkle / reflection
          float sparkle = sin(vUv.x * 40.0 + uTime * 3.0) * cos(vUv.y * 35.0 + uTime * 2.5);
          sparkle = smoothstep(0.85, 1.0, sparkle) * 0.3;
          color += sparkle;

          // Edge fade (softens the far seam)
          float edgeX = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
          float edgeY = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
          float edge = edgeX * edgeY;

          gl_FragColor = vec4(color, uOpacity * edge);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    })

    const lake = new THREE.Mesh(geo, lakeMaterial)
    lake.position.y = WATER_Y
    scene.add(lake)
  }

  function createTrees() {
    const count = 350
    const perVariant = Math.ceil(count / 3)
    const dummy = new THREE.Object3D()
    const X_AXIS = new THREE.Vector3(1, 0, 0)

    const barkTex = makeBarkTexture()
    const needleTex = makeNeedleTexture()
    texAssets.push(barkTex, needleTex)
    const woodMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.9 })
    const needleMat = new THREE.MeshStandardMaterial({
      map: needleTex,
      color: 0xffffff,
      roughness: 0.8,
      flatShading: true,
    })
    // tufts get their own material: sway weight comes from aSway, not height
    const tuftMat = needleMat.clone()
    applyWindSway(woodMat, 0.03, 'transformed.y / 3.6')
    applyWindSway(needleMat, 0.06, 'transformed.y / 4.0')
    applyWindSway(tuftMat, 0.1, 'aSway', 0.04)

    const tuftGeoBase = buildNeedleTuftGeo()
    const tuftSpots = [
      { t: 0.55, s: 0.8 },
      { t: 1.0, s: 1.0 }
    ]

    const meshes = [0, 1, 2].map(v => {
      const vg = buildPineGeos(makeSeededRand(4000 + v * 991))
      const tGeo = tuftGeoBase.clone()
      const tuftCapacity = perVariant * vg.branches.length * tuftSpots.length
      const sways = new Float32Array(tuftCapacity)
      tGeo.setAttribute('aSway', new THREE.InstancedBufferAttribute(sways, 1))
      return {
        vUsed: 0,
        branches: vg.branches,
        sways,
        wood: new THREE.InstancedMesh(vg.wood, woodMat, perVariant),
        needles: new THREE.InstancedMesh(vg.needles, needleMat, perVariant),
        tufts: new THREE.InstancedMesh(tGeo, tuftMat, tuftCapacity)
      }
    })

    const treeM = new THREE.Matrix4()
    const tuftT = new THREE.Matrix4()
    const tuftR = new THREE.Matrix4()
    const tuftS = new THREE.Matrix4()
    const tuftM = new THREE.Matrix4()
    const branchQ = new THREE.Quaternion()
    const branchQ2 = new THREE.Quaternion()
    const rollQ = new THREE.Quaternion()

    let placed = 0
    let attempts = 0

    while (placed < count && attempts < count * 10) {
      attempts++
      const x = (Math.random() - 0.5) * 170
      const z = (Math.random() - 0.5) * 170
      const h = getHeight(x, z)

      // Only place above the waterline
      if (h < 0.3 || h > 16) continue

      const m = meshes[placed % 3]
      const k = m.vUsed++
      const scale = 0.7 + Math.random() * 0.8

      dummy.position.set(x, h + 0.02, z)
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      m.wood.setMatrixAt(k, dummy.matrix)
      m.needles.setMatrixAt(k, dummy.matrix)
      treeM.copy(dummy.matrix)

      const greenVar = 0.7 + Math.random() * 0.6
      m.wood.setColorAt(k, new THREE.Color(0xffffff).multiplyScalar(0.75 + Math.random() * 0.4))
      m.needles.setColorAt(k, new THREE.Color(0xbfd8a8).multiplyScalar(greenVar))

      // needle tufts along each branch (mid + tip). Composed in the tree's
      // local space then transformed by the tree matrix, so they inherit the
      // tree's position, yaw and scale exactly like the lofted branches do.
      const base = k * m.branches.length * tuftSpots.length
      for (let b = 0; b < m.branches.length; b++) {
        const br = m.branches[b]
        branchQ.setFromUnitVectors(X_AXIS, br.dir)
        for (let ti = 0; ti < tuftSpots.length; ti++) {
          const sp = tuftSpots[ti]
          const idx = base + b * tuftSpots.length + ti
          const jx = 0.9 + Math.random() * 0.2
          const px = br.ox + br.dir.x * br.len * sp.t * jx
          const py = br.oy + br.dir.y * br.len * sp.t * jx
          const pz = br.oz + br.dir.z * br.len * sp.t * jx
          tuftT.makeTranslation(px, py, pz)
          branchQ2.copy(branchQ)
          rollQ.setFromAxisAngle(X_AXIS, (Math.random() - 0.5) * 0.6)
          branchQ2.multiply(rollQ)
          tuftR.makeRotationFromQuaternion(branchQ2)
          const ts = sp.s * (0.8 + Math.random() * 0.5)
          tuftS.makeScale(ts, ts, ts)
          tuftM.copy(treeM).multiply(tuftT).multiply(tuftR).multiply(tuftS)
          m.tufts.setMatrixAt(idx, tuftM)
          m.sways[idx] = Math.min(1, Math.max(0.15, py / 4.5))
          m.tufts.setColorAt(idx, new THREE.Color(0xbfd8a8).multiplyScalar(greenVar * (0.85 + Math.random() * 0.3)))
        }
      }

      treeSpots.push({ x, z, h })
      placed++
    }

    for (const m of meshes) {
      for (const im of [m.wood, m.needles, m.tufts]) {
        im.count = im === m.tufts ? m.vUsed * m.branches.length * tuftSpots.length : m.vUsed
        im.instanceMatrix.needsUpdate = true
        im.castShadow = true
        im.receiveShadow = true
        if (im.instanceColor) im.instanceColor.needsUpdate = true
      }
      m.tufts.geometry.attributes.aSway.needsUpdate = true
      scene.add(m.wood, m.needles, m.tufts)
    }
  }

  function createDeciduousTrees() {
    const count = 120
    const Z_AXIS = new THREE.Vector3(0, 0, 1)

    const barkTex = makeBarkTexture()
    const sprigTex = makeLeafSprigTexture()
    texAssets.push(barkTex, sprigTex)
    const trunkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0xcbb49b, roughness: 0.9 })
    applyWindSway(trunkMat, 0.05, 'transformed.y / 4.4')

    const wood = buildDeciduousWood(makeSeededRand(71))
    const trunkMesh = new THREE.InstancedMesh(wood.geo, trunkMat, count)
    trunkMesh.castShadow = true
    trunkMesh.receiveShadow = true

    // canopy: instanced leaf-sprig cards clustered on the lofted branch tips —
    // a real-leaf silhouette instead of blob spheres
    const cardsPerBranch = 11
    const trunkCards = 8
    const cardsPerTree = wood.branches.length * cardsPerBranch + trunkCards
    const cardGeo = new THREE.PlaneGeometry(1, 1)
    cardGeo.setAttribute('aSway', new THREE.InstancedBufferAttribute(new Float32Array(count * cardsPerTree), 1))
    const cardMat = new THREE.MeshStandardMaterial({
      map: sprigTex,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.85,
    })
    applyWindSway(cardMat, 0.16, 'aSway', 0.05)
    const cardDepth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: sprigTex,
      alphaTest: 0.5,
    })
    const cardMesh = new THREE.InstancedMesh(cardGeo, cardMat, count * cardsPerTree)
    cardMesh.customDepthMaterial = cardDepth
    cardMesh.castShadow = true

    const greenColors = [0x3f7d23, 0x4a8c2a, 0x57a036, 0x6ab04a, 0x74b34c]
    const warmColors = [0x9db53c, 0xd4ac3e, 0xc87d2f]

    const dummy = new THREE.Object3D()
    const treeM = new THREE.Matrix4()
    const cardM = new THREE.Matrix4()
    const finalM = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scl = new THREE.Vector3()
    const norm = new THREE.Vector3()
    const cardColor = new THREE.Color()
    const upDir = new THREE.Vector3(0, 1, 0)
    let placed = 0
    let attempts = 0
    let cardIdx = 0

    while (placed < count && attempts < count * 10) {
      attempts++
      const x = (Math.random() - 0.5) * 165
      const z = (Math.random() - 0.5) * 165
      const h = getHeight(x, z)
      if (h < 0.3 || h > 11) continue

      const scale = 0.7 + Math.random() * 0.9
      const rotation = Math.random() * Math.PI * 2

      dummy.position.set(x, h + 0.02, z)
      dummy.rotation.set(0, rotation, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      trunkMesh.setMatrixAt(placed, dummy.matrix)
      treeM.copy(dummy.matrix)
      trunkMesh.setColorAt(placed, new THREE.Color(0xcbb49b).multiplyScalar(0.8 + Math.random() * 0.4))

      const setCard = (px, py, pz, dir) => {
        pos.set(px, py, pz)
        // card normal: random direction made perpendicular to the branch,
        // then a random roll around it — leaves face every which way
        norm.set(Math.random() - 0.5, Math.random() * 0.6 - 0.2, Math.random() - 0.5)
        norm.addScaledVector(dir, -norm.dot(dir))
        if (norm.lengthSq() < 0.0001) norm.set(0, 1, 0)
        norm.normalize()
        quat.setFromUnitVectors(Z_AXIS, norm)
        // roll around the card's own normal (local Z) so the facing is kept
        quat.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, Math.random() * Math.PI * 2))
        const cs = 0.85 + Math.random() * 0.75
        scl.set(cs, cs, cs)
        cardM.compose(pos, quat, scl)
        finalM.copy(treeM).multiply(cardM)
        cardMesh.setMatrixAt(cardIdx, finalM)
        cardGeo.attributes.aSway.array[cardIdx] = Math.min(1, Math.max(0.25, py / 5.5))
        const pool = Math.random() < 0.82 ? greenColors : warmColors
        cardColor.setHex(pool[Math.floor(Math.random() * pool.length)]).multiplyScalar(0.75 + Math.random() * 0.45)
        cardMesh.setColorAt(cardIdx, cardColor)
        cardIdx++
      }

      for (const br of wood.branches) {
        for (let c = 0; c < cardsPerBranch; c++) {
          const t = 0.45 + 0.65 * Math.pow(Math.random(), 0.6)
          setCard(
            br.ox + br.dir.x * br.len * t + (Math.random() - 0.5) * 0.4,
            br.oy + br.dir.y * br.len * t + (Math.random() - 0.5) * 0.35,
            br.oz + br.dir.z * br.len * t + (Math.random() - 0.5) * 0.4,
            br.dir
          )
        }
      }
      for (let c = 0; c < trunkCards; c++) {
        const a = Math.random() * Math.PI * 2
        const r = 0.5 + Math.random() * 0.9
        setCard(Math.cos(a) * r - 0.15, 3.5 + Math.random() * 0.9, Math.sin(a) * r, upDir)
      }

      deciduousSpots.push({ x, z, h })
      placed++
    }

    trunkMesh.count = placed
    trunkMesh.instanceMatrix.needsUpdate = true
    if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true

    cardMesh.count = placed * cardsPerTree
    cardMesh.instanceMatrix.needsUpdate = true
    if (cardMesh.instanceColor) cardMesh.instanceColor.needsUpdate = true
    cardGeo.attributes.aSway.needsUpdate = true

    scene.add(trunkMesh, cardMesh)
  }

  function createClouds() {
    const cloudCount = 12
    const group = new THREE.Group()
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
    })

    for (let i = 0; i < cloudCount; i++) {
      const numPuffs = 5 + Math.floor(Math.random() * 5)
      const geos = []
      for (let j = 0; j < numPuffs; j++) {
        const size = 1.5 + Math.random() * 3
        const puff = new THREE.SphereGeometry(size, 7, 5)
        puff.scale(1, 0.6, 1)
        puff.translate(
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 4
        )
        geos.push(puff)
      }
      const geo = BufferGeometryUtils.mergeGeometries(geos)
      const cloud = new THREE.Mesh(geo, cloudMat)
      const x = (Math.random() - 0.5) * 200
      const y = 35 + Math.random() * 20
      const z = (Math.random() - 0.5) * 150
      cloud.position.set(x, y, z)
      cloud.scale.setScalar(0.8 + Math.random() * 0.7)
      cloud.castShadow = true
      cloud.userData = {
        speed: 0.3 + Math.random() * 0.5,
        originalX: x,
        range: 80 + Math.random() * 40,
        phase: Math.random() * Math.PI * 2,
      }
      group.add(cloud)
      cloudGroups.push(cloud)
    }

    scene.add(group)
  }

  function createRocks() {
    const stoneTex = makeStoneTexture()
    texAssets.push(stoneTex)
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stoneTex,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    })

    const variants = 3
    const perVariant = Math.ceil(60 / variants)
    const dummy = new THREE.Object3D()

    for (let v = 0; v < variants; v++) {
      const geo = new THREE.DodecahedronGeometry(1, 1)
      const pos = geo.attributes.position
      for (let j = 0; j < pos.count; j++) {
        const px = pos.getX(j)
        const py = pos.getY(j)
        const pz = pos.getZ(j)
        const noiseVal = noise.noise2D(px * 2 + v * 31, pz * 2 + v * 17) * 0.35
        pos.setX(j, px + noiseVal)
        pos.setY(j, py * (0.55 + Math.random() * 0.35))
        pos.setZ(j, pz + noiseVal * 0.8)
      }
      geo.computeVertexNormals()

      const mesh = new THREE.InstancedMesh(geo, rockMat, perVariant)
      mesh.castShadow = true
      mesh.receiveShadow = true

      let placed = 0
      let attempts = 0
      while (placed < perVariant && attempts < perVariant * 30) {
        attempts++
        const x = (Math.random() - 0.5) * 180
        const z = (Math.random() - 0.5) * 180
        const h = getHeight(x, z)
        if (h < -0.2 || h > 20) continue

        const size = 0.3 + Math.random() * 1.5
        dummy.position.set(x, h + size * 0.3, z)
        dummy.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        )
        dummy.scale.set(size, size * (0.5 + Math.random() * 0.5), size)
        dummy.updateMatrix()
        mesh.setMatrixAt(placed, dummy.matrix)

        const color = new THREE.Color(0x606060).lerp(new THREE.Color(0x909090), Math.random())
        mesh.setColorAt(placed, color)
        placed++
      }

      mesh.count = placed
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      scene.add(mesh)
    }
  }

  function createGrassPatches() {
    const count = 2000

    // Crossed double plane blades, pivot at base
    const g1 = new THREE.PlaneGeometry(0.14, 0.95)
    g1.translate(0, 0.475, 0)
    const g2 = g1.clone()
    g2.rotateY(Math.PI / 2)
    const bladeGeo = BufferGeometryUtils.mergeGeometries([g1, g2])
    g1.dispose()
    g2.dispose()

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x5a9e3a,
      roughness: 0.9,
      side: THREE.DoubleSide,
    })

    // GPU wind: sway weighted by blade height, phase from instance position
    bladeMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      shader.uniforms.uWind = { value: new THREE.Vector2(0, 0) }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform vec2 uWind;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 grassPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           float grassPhase = grassPos.x * 0.55 + grassPos.z * 0.71;
           float grassWeight = transformed.y * 1.3;
           grassWeight *= grassWeight;
           transformed.x += grassWeight * (sin(uTime * 1.9 + grassPhase) * 0.1 + uWind.x * 0.12);
           transformed.z += grassWeight * (cos(uTime * 1.5 + grassPhase * 1.3) * 0.08 + uWind.y * 0.12);`
        )
      grassWindShader = shader
    }

    const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, count)
    const dummy = new THREE.Object3D()
    let placed = 0

    for (let attempt = 0; attempt < count * 5 && placed < count; attempt++) {
      const x = (Math.random() - 0.5) * 160
      const z = (Math.random() - 0.5) * 160
      const h = getHeight(x, z)
      if (h < 0.25 || h > 10) continue

      const scale = 0.5 + Math.random() * 1.0
      dummy.position.set(x, h, z)
      dummy.rotation.y = Math.random() * Math.PI
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      grass.setMatrixAt(placed, dummy.matrix)

      const greenVar = 0.7 + Math.random() * 0.5
      const color = new THREE.Color(0x5a9e3a).multiplyScalar(greenVar)
      grass.setColorAt(placed, color)
      placed++
    }

    grass.count = placed
    grass.instanceMatrix.needsUpdate = true
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true
    grass.receiveShadow = true
    scene.add(grass)
  }

  function createFlowers() {
    const count = 300
    const stemGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.5, 4)
    stemGeo.translate(0, 0.25, 0)
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3f7a28, roughness: 0.9 })

    // petal: flat ellipse on XZ, base at origin, tip drooping
    const petalGeo = new THREE.PlaneGeometry(0.15, 0.24)
    petalGeo.rotateX(-Math.PI / 2)
    petalGeo.scale(0.62, 1, 1)
    petalGeo.translate(0, 0, 0.12)
    petalGeo.rotateX(0.45)
    const petalMat = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide })

    const centerGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.06, 8)
    centerGeo.translate(0, 0.53, 0)
    const centerMat = new THREE.MeshStandardMaterial({ color: 0xf4d03f, roughness: 0.5 })

    const stems = new THREE.InstancedMesh(stemGeo, stemMat, count)
    const petals = new THREE.InstancedMesh(petalGeo, petalMat, count * 5)
    const centers = new THREE.InstancedMesh(centerGeo, centerMat, count)
    const dummy = new THREE.Object3D()
    const palette = [0xf6e58d, 0xf1948a, 0xd2b4de, 0xffffff, 0xf9e79f]
    let placed = 0
    let attempts = 0

    while (placed < count && attempts < count * 8) {
      attempts++
      const x = (Math.random() - 0.5) * 140
      const z = (Math.random() - 0.5) * 140
      const dist = Math.sqrt(x * x + z * z)
      if (dist > 70) continue

      const h = getHeight(x, z)
      if (h < 0.35 || h > 7) continue

      const scale = 0.7 + Math.random() * 1.1
      const yaw = Math.random() * Math.PI * 2
      const color = new THREE.Color(palette[Math.floor(Math.random() * palette.length)])

      dummy.position.set(x, h + 0.5, z)
      dummy.scale.set(scale, scale, scale)
      for (let p = 0; p < 5; p++) {
        dummy.rotation.set(0, yaw + (p / 5) * Math.PI * 2, 0)
        dummy.updateMatrix()
        petals.setMatrixAt(placed * 5 + p, dummy.matrix)
        petals.setColorAt(placed * 5 + p, color)
      }
      dummy.position.set(x, h, z)
      dummy.rotation.set(0, yaw, 0)
      dummy.updateMatrix()
      stems.setMatrixAt(placed, dummy.matrix)
      centers.setMatrixAt(placed, dummy.matrix)
      placed++
    }

    stems.count = placed
    petals.count = placed * 5
    centers.count = placed
    stems.instanceMatrix.needsUpdate = true
    petals.instanceMatrix.needsUpdate = true
    centers.instanceMatrix.needsUpdate = true
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true
    scene.add(stems)
    scene.add(petals)
    scene.add(centers)
  }

  function createMushrooms() {
    if (!treeSpots.length) return
    const count = 25
    const stemGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.28, 6)
    stemGeo.translate(0, 0.14, 0)
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.85 })
    const capGeo = new THREE.SphereGeometry(0.24, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
    capGeo.translate(0, 0.24, 0)
    const amanitaTex = makeAmanitaTexture()
    texAssets.push(amanitaTex)
    const capMat = new THREE.MeshStandardMaterial({
      map: amanitaTex,
      roughness: 0.6,
      flatShading: true,
    })

    const stems = new THREE.InstancedMesh(stemGeo, stemMat, count)
    const caps = new THREE.InstancedMesh(capGeo, capMat, count)
    const dummy = new THREE.Object3D()
    const redCap = new THREE.Color(0xc0392b)
    const tanCap = new THREE.Color(0xb5651d)
    let placed = 0

    for (let attempts = 0; placed < count && attempts < count * 20; attempts++) {
      const spot = treeSpots[Math.floor(Math.random() * treeSpots.length)]
      const ang = Math.random() * Math.PI * 2
      const r = 0.6 + Math.random() * 1.8
      const x = spot.x + Math.cos(ang) * r
      const z = spot.z + Math.sin(ang) * r
      const h = getHeight(x, z)
      if (h < 0.25 || h > 16) continue

      const scale = 0.7 + Math.random() * 1.3
      dummy.position.set(x, h, z)
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      stems.setMatrixAt(placed, dummy.matrix)
      caps.setMatrixAt(placed, dummy.matrix)
      const base = Math.random() < 0.6 ? redCap : tanCap
      caps.setColorAt(placed, base.clone().multiplyScalar(0.85 + Math.random() * 0.3))
      placed++
    }

    stems.count = placed
    caps.count = placed
    stems.instanceMatrix.needsUpdate = true
    caps.instanceMatrix.needsUpdate = true
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true
    scene.add(stems)
    scene.add(caps)
  }

  function createBushes() {
    const count = 80
    const geo = new THREE.IcosahedronGeometry(0.9, 1)
    const pos = geo.attributes.position
    for (let j = 0; j < pos.count; j++) {
      const px = pos.getX(j)
      const py = pos.getY(j)
      const pz = pos.getZ(j)
      const n = noise.noise2D(px * 2.5 + 5, pz * 2.5 + 9) * 0.25
      pos.setX(j, px + n)
      pos.setY(j, py * 0.75)
      pos.setZ(j, pz - n * 0.7)
    }
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true })

    const mesh = new THREE.InstancedMesh(geo, mat, count)
    const dummy = new THREE.Object3D()
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < count * 10) {
      attempts++
      const x = (Math.random() - 0.5) * 150
      const z = (Math.random() - 0.5) * 150
      const dist = Math.sqrt(x * x + z * z)
      if (dist > 80) continue

      const h = getHeight(x, z)
      if (h < 0.3 || h > 12) continue

      const s = 0.6 + Math.random() * 1.1
      dummy.position.set(x, h + s * 0.25, z)
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
      dummy.scale.set(s * (0.8 + Math.random() * 0.5), s * 0.9, s * (0.8 + Math.random() * 0.5))
      dummy.updateMatrix()
      mesh.setMatrixAt(placed, dummy.matrix)
      mesh.setColorAt(placed, new THREE.Color(0x3d7a2f).multiplyScalar(0.7 + Math.random() * 0.5))
      placed++
    }

    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  function createLogs() {
    const barkTex = makeBarkTexture()
    const ringsTex = makeRingsTexture()
    texAssets.push(barkTex, ringsTex)
    const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 })
    const coreMat = new THREE.MeshStandardMaterial({ map: ringsTex, roughness: 0.85 })

    for (let i = 0; i < 3; i++) {
      let x, z, h
      let attempts = 0
      do {
        x = (Math.random() - 0.5) * 140
        z = (Math.random() - 0.5) * 140
        h = getHeight(x, z)
        attempts++
      } while ((h < 0.3 || h > 13) && attempts < 50)

      const radius = 0.4 + Math.random() * 0.3
      const length = 4 + Math.random() * 3

      const logGroup = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.15, length, 9), barkMat)
      trunk.rotation.z = Math.PI / 2
      trunk.castShadow = true
      trunk.receiveShadow = true
      logGroup.add(trunk)

      const endGeo = new THREE.CircleGeometry(radius, 10)
      const end1 = new THREE.Mesh(endGeo, coreMat)
      end1.position.x = length / 2
      end1.rotation.y = Math.PI / 2
      const end2 = new THREE.Mesh(endGeo, coreMat)
      end2.position.x = -length / 2
      end2.rotation.y = -Math.PI / 2
      logGroup.add(end1, end2)

      logGroup.position.set(x, h + radius * 0.9, z)
      logGroup.rotation.y = Math.random() * Math.PI
      scene.add(logGroup)
    }
  }

  function createPier() {
    // Walk inward from outside along each of 16 radial directions; the first point
    // where terrain sinks below the waterline is the shoreline. Pick the direction
    // whose water is deepest just inside the shore.
    let best = null
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      let shoreD = null
      for (let d = 46; d >= 10; d -= 0.5) {
        if (getHeight(ca * d, sa * d) < -0.3) {
          shoreD = d
          break
        }
      }
      if (shoreD === null) continue
      const depth = -getHeight(ca * (shoreD - 6), sa * (shoreD - 6))
      if (!best || depth > best.depth) best = { ca, sa, shoreD, depth }
    }

    if (!best) {
      pierTip = null
      return
    }

    const { ca, sa, shoreD } = best
    const deckY = -0.25

    const plankTex = makePlankTexture()
    texAssets.push(plankTex)
    const woodMat = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 })
    const darkWoodMat = new THREE.MeshStandardMaterial({ map: plankTex, color: 0xbfa88a, roughness: 0.95 })
    const pier = new THREE.Group()

    // Planks along local +Z (shore end -> lake center after group rotation)
    for (let i = 0; i < 7; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.85), woodMat)
      plank.position.set(0, 0, 0.4 + i * 1.0)
      plank.castShadow = true
      plank.receiveShadow = true
      pier.add(plank)
    }

    // Long piles down to the lake bottom, with chipped caps
    const postLen = 13
    const postPositions = [
      [-0.8, 1.0], [0.8, 1.0],
      [-0.8, 5.0], [0.8, 5.0],
    ]
    postPositions.forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, postLen, 6), darkWoodMat)
      post.position.set(px, -postLen / 2 + 0.06, pz)
      post.castShadow = true
      pier.add(post)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.1, 6), darkWoodMat)
      cap.position.set(px, 0.12, pz)
      pier.add(cap)
    })

    // Small bench at the shore end, with backrest
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.4), darkWoodMat)
    bench.position.set(0, 0.35, 0.3)
    bench.castShadow = true
    pier.add(bench)
    const benchLegL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.3), darkWoodMat)
    benchLegL.position.set(-0.4, 0.17, 0.3)
    const benchLegR = benchLegL.clone()
    benchLegR.position.x = 0.4
    pier.add(benchLegL, benchLegR)
    const backLegL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), darkWoodMat)
    backLegL.position.set(-0.4, 0.62, 0.14)
    backLegL.rotation.x = 0.18
    const backLegR = backLegL.clone()
    backLegR.position.x = 0.4
    const backRail = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.09, 0.09), darkWoodMat)
    backRail.position.set(0, 0.78, 0.1)
    backRail.rotation.x = 0.18
    pier.add(backLegL, backLegR, backRail)

    // Bollards at the lake end
    for (const bx of [-0.55, 0.55]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 7), darkWoodMat)
      bollard.position.set(bx, 0.28, 6.4)
      bollard.castShadow = true
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), darkWoodMat)
      knob.position.set(bx, 0.55, 6.4)
      pier.add(bollard, knob)
    }

    pier.position.set(ca * (shoreD + 0.6), deckY, sa * (shoreD + 0.6))
    pier.rotation.y = Math.atan2(-ca, -sa)
    scene.add(pier)

    pierTip = { x: ca * (shoreD + 0.6 - 6.4), z: sa * (shoreD + 0.6 - 6.4) }
  }

  function createBoat() {
    if (!pierTip) return
    const g = new THREE.Group()
    const plankTex = makePlankTexture()
    texAssets.push(plankTex)
    const hullMat = new THREE.MeshStandardMaterial({ map: plankTex, color: 0x9c7f5e, roughness: 0.85 })
    const seatMat = new THREE.MeshStandardMaterial({ map: plankTex, color: 0xcbb49b, roughness: 0.9 })

    hullMat.side = THREE.DoubleSide
    // Hull: open-top bowl (lower hemisphere), narrow-ish ends from the taper
    const hullGeo = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5)
    hullGeo.scale(1.5, 0.5, 0.8)
    // taper the bow/stern so it reads as a boat, not a tub
    {
      const hp = hullGeo.attributes.position
      for (let i = 0; i < hp.count; i++) {
        const x = hp.getX(i)
        const t = Math.min(1, Math.abs(x) / 1.5)
        const squeeze = 1 - 0.55 * t * t
        hp.setZ(i, hp.getZ(i) * squeeze)
        hp.setY(i, hp.getY(i) * (1 - 0.35 * t * t))
      }
      hullGeo.computeVertexNormals()
    }
    const hull = new THREE.Mesh(hullGeo, hullMat)
    g.add(hull)

    // Gunwale: a thin rail hugging the rim (not a puffy torus)
    const rimPts = new THREE.EllipseCurve(0, 0, 1.44, 0.76, 0, Math.PI * 2, false, 0)
      .getPoints(40).map((p) => new THREE.Vector3(p.x, 0.01, p.y))
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 48, 0.035, 6, true),
      seatMat
    )
    g.add(rim)

    // Interior floor
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 24), seatMat)
    floor.scale.set(1.32, 1, 0.7)
    floor.position.y = -0.16
    g.add(floor)

    // Three seats
    for (const sx of [-0.6, 0, 0.6]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 1.0), seatMat)
      seat.position.set(sx, -0.05, 0)
      g.add(seat)
    }

    // Oars resting on the rim
    const oarMat = new THREE.MeshStandardMaterial({ map: plankTex, color: 0x8a6f52, roughness: 0.85 })
    for (const oz of [-1, 1]) {
      const oar = new THREE.Group()
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.6, 5), oarMat)
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.34), oarMat)
      blade.position.y = -0.75
      oar.add(shaft, blade)
      oar.position.set(-0.15, 0.05, oz * 0.7)
      oar.rotation.z = 0.95
      oar.rotation.x = -oz * 0.28
      g.add(oar)
    }

    g.traverse(c => { if (c.isMesh) c.castShadow = true })

    // Drift a small circle in the deep central water, opposite the pier line
    const tipDist = Math.hypot(pierTip.x, pierTip.z)
    const dirx = pierTip.x / tipDist
    const dirz = pierTip.z / tipDist
    const cx = -dirx * 3
    const cz = -dirz * 3
    const radius = 2.5
    const angle = Math.random() * Math.PI * 2

    g.position.set(cx + Math.cos(angle) * radius, -0.27, cz + Math.sin(angle) * radius)

    g.userData = {
      cx, cz, radius,
      angle,
      speed: 0.12,
      baseY: -0.27,
    }
    scene.add(g)
    boat = g
  }

  function createReeds() {
    // Find shoreline rings like the pier does, then scatter cattails along the banks
    const spots = []
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + Math.random() * 0.1
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      let shoreD = null
      for (let d = 46; d >= 10; d -= 0.5) {
        if (getHeight(ca * d, sa * d) < -0.3) {
          shoreD = d
          break
        }
      }
      if (shoreD === null) continue
      spots.push({ ca, sa, shoreD })
    }

    const count = 90
    const stemGeo = new THREE.CylinderGeometry(0.018, 0.028, 1.15, 5)
    stemGeo.translate(0, 0.575, 0)
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x6a8f3f, roughness: 0.9 })
    const headGeo = new THREE.CapsuleGeometry(0.05, 0.22, 3, 6)
    headGeo.translate(0, 1.28, 0)
    const headMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 })

    const stems = new THREE.InstancedMesh(stemGeo, stemMat, count)
    const heads = new THREE.InstancedMesh(headGeo, headMat, count)
    const dummy = new THREE.Object3D()
    let placed = 0

    for (let attempts = 0; placed < count && attempts < count * 12; attempts++) {
      const s = spots[Math.floor(Math.random() * spots.length)]
      if (!s) break
      // Just inside (wet) to just outside (bank) of the waterline
      const d = s.shoreD + (Math.random() - 0.65) * 3.5
      const x = s.ca * d
      const z = s.sa * d
      const h = getHeight(x, z)
      if (h < -0.55 || h > 0.9) continue

      const scale = 0.7 + Math.random() * 0.9
      const tilt = (Math.random() - 0.5) * 0.3
      dummy.position.set(x, h, z)
      dummy.rotation.set(tilt * 0.6, Math.random() * Math.PI, tilt)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      stems.setMatrixAt(placed, dummy.matrix)
      heads.setMatrixAt(placed, dummy.matrix)
      const gv = 0.75 + Math.random() * 0.5
      stems.setColorAt(placed, new THREE.Color(0x6a8f3f).multiplyScalar(gv))
      heads.setColorAt(placed, new THREE.Color(0x6b4423).multiplyScalar(0.8 + Math.random() * 0.4))
      placed++
    }

    stems.count = placed
    heads.count = placed
    stems.instanceMatrix.needsUpdate = true
    heads.instanceMatrix.needsUpdate = true
    if (stems.instanceColor) stems.instanceColor.needsUpdate = true
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true
    stems.castShadow = true
    heads.castShadow = true
    scene.add(stems)
    scene.add(heads)
  }

  function updateBoat(delta, elapsed) {
    if (!boat) return
    const u = boat.userData
    u.angle += u.speed * delta
    const x = u.cx + Math.cos(u.angle) * u.radius
    const z = u.cz + Math.sin(u.angle) * u.radius
    const dx = -Math.sin(u.angle) * u.radius
    const dz = Math.cos(u.angle) * u.radius
    boat.position.set(x, u.baseY + Math.sin(elapsed * 1.1) * 0.07, z)

    const targetRot = -Math.atan2(dz, dx)
    let rotDiff = targetRot - boat.rotation.y
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2
    boat.rotation.y += rotDiff * 2 * delta
    boat.rotation.x = Math.cos(elapsed * 0.7) * 0.05
    boat.rotation.z = Math.sin(elapsed * 0.9) * 0.05
  }

  function pickNewDeerTarget(deer) {
    // Random target above the waterline (avoids the lake and streams)
    let x, z, h
    let attempts = 0
    do {
      x = (Math.random() - 0.5) * 140
      z = (Math.random() - 0.5) * 140
      h = getHeight(x, z)
      attempts++
    } while ((h < 0.4 || h > 15) && attempts < 50)

    deer.target.set(x, h, z)
  }

  function pickDryTargetBehind(deer) {
    // Turn around: aim behind the current heading (away from the water)
    const ry = deer.group.rotation.y
    const backAng = Math.atan2(Math.sin(ry), -Math.cos(ry))
    for (let i = 0; i < 15; i++) {
      const ang = backAng + (Math.random() - 0.5) * 2.2
      const dist = 8 + Math.random() * 14
      const x = deer.pos.x + Math.cos(ang) * dist
      const z = deer.pos.z + Math.sin(ang) * dist
      if (Math.abs(x) > 88 || Math.abs(z) > 88) continue
      const h = getHeight(x, z)
      if (h >= 0.4 && h <= 15) {
        deer.target.set(x, h, z)
        return
      }
    }
    pickNewDeerTarget(deer)
  }

  function createDeer(config) {
    const { scale = 1, colorMul = 1, antlers = false, fawn = false } = config
    const deerGroup = new THREE.Group()
    const deerLegs = []
    const seed = Math.random() * Math.PI * 2
    const X_AXIS = new THREE.Vector3(1, 0, 0)

    // ---- materials ----
    const coatTex = fawn ? makeFawnTexture() : makeDeerCoatTexture()
    texAssets.push(coatTex)
    const bodyMat = new THREE.MeshStandardMaterial({
      map: coatTex,
      roughness: 0.85,
      color: fawn ? new THREE.Color(0xffffff) : new THREE.Color(0xffffff).multiplyScalar(colorMul)
    })
    const legMat = new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.9, color: new THREE.Color(0xffffff).multiplyScalar(0.72 * (fawn ? 1 : colorMul)) })
    const creamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xe9dcc4).multiplyScalar(colorMul), roughness: 0.85 })
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4a3226).multiplyScalar(colorMul), roughness: 0.8 })
    const noseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x33241b).multiplyScalar(colorMul), roughness: 0.5 })
    const hoofMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2b1f17).multiplyScalar(colorMul), roughness: 0.45 })
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.25 })
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 })
    const innerEarMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc9a68a).multiplyScalar(colorMul), roughness: 0.9 })

    // ---- body: sculpted loft (rump -> haunch -> belly -> chest -> withers) ----
    const body = new THREE.Group()
    body.add(new THREE.Mesh(makeLoft([
      { x: -1.05, cy: 2.12, ry: 0.46, rz: 0.40 },
      { x: -0.85, cy: 2.22, ry: 0.55, rz: 0.47 },
      { x: -0.55, cy: 2.28, ry: 0.55, rz: 0.48 },
      { x: -0.25, cy: 2.24, ry: 0.52, rz: 0.47 },
      { x: 0.05, cy: 2.18, ry: 0.50, rz: 0.46 },
      { x: 0.35, cy: 2.26, ry: 0.50, rz: 0.46 },
      { x: 0.62, cy: 2.38, ry: 0.50, rz: 0.44 },
      { x: 0.82, cy: 2.48, ry: 0.46, rz: 0.40 },
      { x: 0.95, cy: 2.58, ry: 0.40, rz: 0.35 },
      { x: 1.02, cy: 2.68, ry: 0.33, rz: 0.30 }
    ], 40), bodyMat))
    // white rump patch
    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 26, 18), creamMat)
    rump.scale.set(0.28, 0.72, 0.58)
    rump.position.set(-1.0, 2.44, 0)
    body.add(rump)
    // neck: separate loft rising off the chest
    body.add(new THREE.Mesh(makeLoft([
      { x: 0.78, cy: 2.42, ry: 0.42, rz: 0.40 },
      { x: 0.98, cy: 2.60, ry: 0.30, rz: 0.30 },
      { x: 1.12, cy: 2.78, ry: 0.25, rz: 0.25 },
      { x: 1.24, cy: 2.94, ry: 0.22, rz: 0.22 },
      { x: 1.34, cy: 3.06, ry: 0.20, rz: 0.20 },
      { x: 1.44, cy: 3.14, ry: 0.185, rz: 0.185 }
    ], 30), bodyMat))
    deerGroup.add(body)

    // ---- head: group pivoted at the neck base so it can bob and look around ----
    const head = new THREE.Group()
    head.position.set(1.44, 3.14, 0)
    head.add(new THREE.Mesh(makeLoft([
      { x: -0.06, cy: 0.0, ry: 0.19, rz: 0.185 },
      { x: 0.06, cy: 0.015, ry: 0.195, rz: 0.18 },
      { x: 0.18, cy: 0.02, ry: 0.17, rz: 0.15 },
      { x: 0.32, cy: 0.01, ry: 0.13, rz: 0.115 },
      { x: 0.45, cy: -0.005, ry: 0.095, rz: 0.085 },
      { x: 0.56, cy: -0.015, ry: 0.075, rz: 0.07 },
      { x: 0.64, cy: -0.02, ry: 0.065, rz: 0.062 }
    ], 36), bodyMat))
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), creamMat)
    throat.scale.set(0.65, 0.42, 0.55)
    throat.position.set(0.4, -0.085, 0)
    head.add(throat)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 28, 20), noseMat)
    nose.scale.set(0.75, 0.8, 1.05)
    nose.position.set(0.645, -0.02, 0)
    head.add(nose)
    const nostrilGeo = new THREE.SphereGeometry(0.013, 12, 10)
    const nostrilL = new THREE.Mesh(nostrilGeo, darkMat)
    nostrilL.position.set(0.66, -0.006, 0.028)
    const nostrilR = nostrilL.clone()
    nostrilR.position.z = -0.028
    head.add(nostrilL, nostrilR)
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.085), darkMat)
    mouth.position.set(0.615, -0.075, 0)
    head.add(mouth)
    const eyeGeo = new THREE.SphereGeometry(0.04, 32, 22)
    const shineGeo = new THREE.SphereGeometry(0.013, 18, 12)
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
    eyeL.position.set(0.16, 0.055, 0.16)
    const eyeR = eyeL.clone()
    eyeR.position.z = -0.16
    const shineL = new THREE.Mesh(shineGeo, shineMat)
    shineL.position.set(0.175, 0.068, 0.172)
    const shineR = shineL.clone()
    shineR.position.z = -0.172
    head.add(eyeL, eyeR, shineL, shineR)

    // ears: flat tapered loft with a lighter inner surface
    const earOuterGeo = makeLoft([
      { x: 0, cy: 0, ry: 0.045, rz: 0.014 },
      { x: 0.14, cy: 0, ry: 0.055, rz: 0.02 },
      { x: 0.3, cy: 0, ry: 0.035, rz: 0.013 },
      { x: 0.42, cy: 0, ry: 0.008, rz: 0.006 }
    ], 18)
    const earInnerGeo = makeLoft([
      { x: 0.03, cy: 0, ry: 0.032, rz: 0.011 },
      { x: 0.15, cy: 0, ry: 0.038, rz: 0.014 },
      { x: 0.3, cy: 0, ry: 0.02, rz: 0.008 }
    ], 16)
    const makeEar = (zSide) => {
      const ear = new THREE.Group()
      ear.position.set(0.02, 0.17, 0.13 * zSide)
      ear.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(X_AXIS, new THREE.Vector3(-0.35, 0.75, 0.55 * zSide).normalize()))
      const outer = new THREE.Mesh(earOuterGeo, bodyMat)
      const inner = new THREE.Mesh(earInnerGeo, innerEarMat)
      inner.position.z = -0.012 * zSide
      ear.add(outer, inner)
      return ear
    }
    const earL = makeEar(1)
    const earR = makeEar(-1)
    if (fawn) { earL.scale.setScalar(0.8); earR.scale.setScalar(0.8) }
    head.add(earL, earR)

    // antlers (adults only): curved main beam + tines as tube sweeps
    if (antlers) {
      const antlerTex = makeAntlerTexture()
      texAssets.push(antlerTex)
      const antlerMat = new THREE.MeshStandardMaterial({ map: antlerTex, roughness: 0.7 })
      const addTube = (pts, r, s) => {
        const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2] * s)))
        head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r, 18), antlerMat))
      }
      for (const s of [1, -1]) {
        addTube([[0.06, 0.17, 0.14], [0.05, 0.36, 0.16], [-0.03, 0.56, 0.11]], 0.026, s)
        addTube([[-0.03, 0.56, 0.11], [-0.15, 0.7, 0.05], [-0.28, 0.72, -0.01]], 0.016, s)
        addTube([[0.01, 0.32, 0.15], [0.08, 0.46, 0.18], [0.04, 0.58, 0.14]], 0.013, s)
        addTube([[-0.09, 0.5, 0.08], [-0.03, 0.66, 0.03], [-0.12, 0.78, -0.01]], 0.01, s)
        addTube([[-0.28, 0.72, -0.01], [-0.38, 0.79, -0.05]], 0.008, s)
        addTube([[-0.27, 0.7, -0.02], [-0.33, 0.72, -0.08]], 0.007, s)
        const joint = new THREE.Mesh(new THREE.SphereGeometry(0.028, 18, 12), antlerMat)
        joint.position.set(-0.03, 0.56, 0.11 * s)
        head.add(joint)
      }
    }
    body.add(head)

    // ---- legs: two joints each (hip pivot -> thigh, knee/hock -> cannon + hoof) ----
    // sections above the hip pivot stay buried in the body through the full
    // swing, so the leg never visibly detaches from the torso
    const thighGeoF = makeLoft([
      { x: -0.4, cy: 0, ry: 0.2, rz: 0.18 },
      { x: -0.2, cy: 0, ry: 0.17, rz: 0.155 },
      { x: 0, cy: 0, ry: 0.15, rz: 0.135 },
      { x: 0.45, cy: 0, ry: 0.125, rz: 0.115 },
      { x: 0.92, cy: 0, ry: 0.095, rz: 0.088 }
    ], 32)
    thighGeoF.rotateZ(-Math.PI / 2)
    const thighGeoH = makeLoft([
      { x: -0.4, cy: 0, ry: 0.26, rz: 0.24 },
      { x: -0.2, cy: 0, ry: 0.23, rz: 0.21 },
      { x: 0, cy: 0, ry: 0.21, rz: 0.19 },
      { x: 0.4, cy: 0, ry: 0.17, rz: 0.155 },
      { x: 0.9, cy: 0, ry: 0.11, rz: 0.1 }
    ], 34)
    thighGeoH.rotateZ(-Math.PI / 2)
    const cannonGeoF = makeLoft([
      { x: 0, cy: 0, ry: 0.085, rz: 0.08 },
      { x: 0.45, cy: 0, ry: 0.068, rz: 0.065 },
      { x: 0.88, cy: 0, ry: 0.055, rz: 0.058 }
    ], 26)
    cannonGeoF.rotateZ(-Math.PI / 2)
    const cannonGeoH = makeLoft([
      { x: 0, cy: 0, ry: 0.08, rz: 0.075 },
      { x: 0.45, cy: 0, ry: 0.062, rz: 0.06 },
      { x: 0.95, cy: 0, ry: 0.05, rz: 0.052 }
    ], 26)
    cannonGeoH.rotateZ(-Math.PI / 2)
    const kneeGeo = new THREE.SphereGeometry(0.082, 24, 16)
    const hockGeo = new THREE.SphereGeometry(0.088, 24, 16)
    const hoofGeo = makeLoft([
      { x: 0, cy: 0, ry: 0.05, rz: 0.042 },
      { x: 0.05, cy: 0, ry: 0.055, rz: 0.05 },
      { x: 0.1, cy: 0, ry: 0.045, rz: 0.06 }
    ], 24)
    hoofGeo.rotateZ(-Math.PI / 2)

    const legDefs = [
      { name: 'frontLeft', x: 0.62, y: 1.9, z: 0.27, hind: false },
      { name: 'frontRight', x: 0.62, y: 1.9, z: -0.27, hind: false },
      { name: 'backLeft', x: -0.72, y: 1.85, z: 0.3, hind: true },
      { name: 'backRight', x: -0.72, y: 1.85, z: -0.3, hind: true }
    ]
    legDefs.forEach(ld => {
      const hip = new THREE.Group()
      hip.position.set(ld.x, ld.y, ld.z)
      hip.add(new THREE.Mesh(ld.hind ? thighGeoH : thighGeoF, legMat))

      const lower = new THREE.Group()
      const jointLen = ld.hind ? 0.9 : 0.92
      lower.position.set(ld.hind ? 0.02 : 0, -jointLen, 0)
      const baseRot = ld.hind ? 0.42 : 0
      lower.rotation.z = baseRot
      lower.add(new THREE.Mesh(ld.hind ? cannonGeoH : cannonGeoF, legMat))
      const joint = new THREE.Mesh(ld.hind ? hockGeo : kneeGeo, legMat)
      lower.add(joint)
      const hoof = new THREE.Mesh(hoofGeo, hoofMat)
      hoof.position.set(0.01, ld.hind ? -0.93 : -0.88, 0)
      hoof.userData.hoof = true
      lower.add(hoof)
      hip.add(lower)

      hip.userData = { name: ld.name, lower, base: baseRot, hind: ld.hind }
      deerGroup.add(hip)
      deerLegs.push(hip)
    })

    // white tail: curved loft pointing up and back off the rump; base
    // orientation lives on the mesh, group rotation is the wag
    const tail = new THREE.Group()
    tail.position.set(-0.98, 2.48, 0)
    const tailMesh = new THREE.Mesh(makeLoft([
      { x: 0, cy: 0, ry: 0.13, rz: 0.125 },
      { x: 0.14, cy: 0.02, ry: 0.1, rz: 0.095 },
      { x: 0.26, cy: 0.08, ry: 0.065, rz: 0.06 },
      { x: 0.36, cy: 0.17, ry: 0.042, rz: 0.04 }
    ], 24), creamMat)
    tailMesh.quaternion.setFromUnitVectors(X_AXIS, new THREE.Vector3(-0.45, 0.89, 0).normalize())
    tail.add(tailMesh)
    deerGroup.add(tail)

    deerGroup.scale.setScalar(scale)
    deerGroup.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    const deer = {
      group: deerGroup,
      body,
      head,
      earL,
      earR,
      legs: deerLegs,
      tail,
      pos: new THREE.Vector3(),
      target: new THREE.Vector3(),
      state: 'idle',
      idleTime: 1 + Math.random() * 4,
      isFawn: fawn,
      speed: fawn ? 3.8 : 3.0,
      seed,
      earTwitch: 2 + Math.random() * 6,
      earTwitchAmp: 0,
    }
    deerList.push(deer)
    scene.add(deerGroup)
    return deer
  }

  function spawnDeer(x, z, config) {
    const deer = createDeer(config)
    const h = getHeight(x, z)
    deer.pos.set(x, h, z)
    deer.group.position.set(x, h, z)
    deer.group.rotation.y = Math.random() * Math.PI * 2
    pickNewDeerTarget(deer)
    return deer
  }

  function createDeerHerd() {
    spawnDeer(30, 20, { scale: 1, colorMul: 1, antlers: true })
    spawnDeer(26, 25, { scale: 0.95, colorMul: 0.95, antlers: false })
    spawnDeer(28, 27, { scale: 0.55, colorMul: 0.85, antlers: false, fawn: true })
  }

  function updateDeerAnimation(delta, elapsed) {
    for (let i = 0; i < deerList.length; i++) {
      const deer = deerList[i]
      const mom = deer.isFawn ? deerList[1] : null

      if (mom) {
        // Fawn holds a spot just behind its mother
        const hx = Math.cos(mom.group.rotation.y)
        const hz = -Math.sin(mom.group.rotation.y)
        deer.target.set(mom.pos.x - hx * 2.4, 0, mom.pos.z - hz * 2.4)
        deer.target.y = getHeight(deer.target.x, deer.target.z)
      }

      const settle = Math.min(1, delta * 5)

      if (deer.state === 'idle') {
        deer.idleTime -= delta
        deer.legs.forEach(leg => {
          leg.rotation.z += (0 - leg.rotation.z) * settle
          const ud = leg.userData
          ud.lower.rotation.z += (ud.base - ud.lower.rotation.z) * settle
        })
        deer.body.position.y += (Math.sin(elapsed * 1.5 + deer.seed) * 0.012 - deer.body.position.y) * settle
        deer.body.rotation.z += (0 - deer.body.rotation.z) * settle
        deer.tail.rotation.z += (0 - deer.tail.rotation.z) * settle
        deer.tail.rotation.y *= 1 - settle
        deer.head.rotation.x += (0.06 - deer.head.rotation.x) * settle
        deer.head.rotation.y = Math.sin(elapsed * 0.35 + deer.seed) * 0.28
        deer.earTwitch -= delta
        if (deer.earTwitch <= 0) { deer.earTwitch = 3 + Math.random() * 6; deer.earTwitchAmp = 1 }
        deer.earTwitchAmp *= Math.max(0, 1 - delta * 8)
        const tw = Math.sin(elapsed * 42) * deer.earTwitchAmp * 0.25
        deer.earL.rotation.y = Math.sin(elapsed * 0.9 + deer.seed) * 0.08 + tw
        deer.earR.rotation.y = -Math.sin(elapsed * 0.9 + deer.seed + 0.7) * 0.08 + tw * 0.6
        if (deer.idleTime <= 0) {
          deer.state = 'walking'
          if (!deer.isFawn) pickNewDeerTarget(deer)
        }
      } else {
        const dx = deer.target.x - deer.pos.x
        const dz = deer.target.z - deer.pos.z
        const distToTarget = Math.sqrt(dx * dx + dz * dz)
        const canWalk = !mom || mom.state === 'walking' || distToTarget > 1.8

        if (distToTarget < (mom ? 1.2 : 2) || !canWalk) {
          deer.state = 'idle'
          deer.idleTime = 2 + Math.random() * 4
        } else {
          // Move toward target
          const step = deer.speed * delta
          const nx = deer.pos.x + (dx / distToTarget) * step
          const nz = deer.pos.z + (dz / distToTarget) * step
          const nextH = getHeight(nx, nz)

          // Refuse to step into water: pause and turn around
          if (deer.pos.y >= SAFE_H && nextH < SAFE_H) {
            deer.state = 'idle'
            deer.idleTime = 0.3 + Math.random() * 0.7
            if (!deer.isFawn) pickDryTargetBehind(deer)
          } else {
            deer.pos.x = nx
            deer.pos.z = nz
            const terrainH = nextH
            deer.pos.y = terrainH
            deer.group.position.set(deer.pos.x, terrainH, deer.pos.z)

            // Face movement direction (deer model faces +X), smoothed
            const targetRotation = -Math.atan2(dz, dx)
            let rotDiff = targetRotation - deer.group.rotation.y
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2
            deer.group.rotation.y += rotDiff * 3 * delta

            // Legs: diagonal pairs swing around Z (feet track forward/back in
            // the X-Y plane); the lower leg counter-bends, the hind hock kicks
            // back as the leg swings forward
            const walkSpeed = 7.5
            const gaitPhase = elapsed * walkSpeed + deer.seed
            deer.legs.forEach(leg => {
              const ud = leg.userData
              const ph = (ud.name === 'frontLeft' || ud.name === 'backRight') ? 0 : Math.PI
              const s = Math.sin(gaitPhase + ph)
              leg.rotation.z = s * (ud.hind ? 0.5 : 0.4)
              ud.lower.rotation.z = ud.base + (ud.hind ? -Math.max(0, s) * 0.8 : s * 0.3)
            })

            // Body bob + pitch
            deer.body.position.y = Math.sin(gaitPhase * 2) * 0.05
            deer.body.rotation.z = Math.sin(gaitPhase * 2 + 0.7) * 0.015

            // Head bob + slow glance
            deer.head.rotation.x = 0.04 + Math.sin(gaitPhase) * 0.03
            deer.head.rotation.y = Math.sin(elapsed * 0.5 + deer.seed) * 0.05

            // Tail flick
            deer.tail.rotation.z = Math.sin(gaitPhase * 2 + 1) * 0.2
            deer.tail.rotation.y = Math.sin(elapsed * 2.6 + deer.seed) * 0.12

            // Ear twitch
            deer.earTwitch -= delta
            if (deer.earTwitch <= 0) { deer.earTwitch = 3 + Math.random() * 6; deer.earTwitchAmp = 1 }
            deer.earTwitchAmp *= Math.max(0, 1 - delta * 8)
            const tw = Math.sin(elapsed * 42) * deer.earTwitchAmp * 0.25
            deer.earL.rotation.y = Math.sin(elapsed * 1.1 + deer.seed) * 0.06 + tw
            deer.earR.rotation.y = -Math.sin(elapsed * 1.1 + deer.seed + 0.7) * 0.06 + tw * 0.6
          }
        }
      }
    }
  }

  function createSquirrels() {
    for (let i = 0; i < 2; i++) {
      const furTex = makeSquirrelFurTexture()
      texAssets.push(furTex)
      const bodyMat = new THREE.MeshStandardMaterial({
        map: furTex,
        color: new THREE.Color(0xffffff).multiplyScalar(0.92 + Math.random() * 0.16),
        roughness: 0.82,
      })
      const bellyMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc4, roughness: 0.85 })
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.85 })
      const noseMat = new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.5 })
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.25 })
      const shineMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 })
      const whiskerMat = new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 0.6 })

      const sq = new THREE.Group()
      const legs = []

      // Body: hunched rump -> arched back -> shoulders (head is a separate
      // sculpted piece attached at the neck, not swept into the same loft)
      const body = new THREE.Mesh(makeLoft([
        { x: -0.36, cy: 0.40, ry: 0.19, rz: 0.185 },
        { x: -0.20, cy: 0.47, ry: 0.235, rz: 0.22 },
        { x: -0.02, cy: 0.53, ry: 0.245, rz: 0.225 },
        { x: 0.16, cy: 0.565, ry: 0.215, rz: 0.195 },
        { x: 0.30, cy: 0.575, ry: 0.165, rz: 0.15 },
        { x: 0.40, cy: 0.565, ry: 0.125, rz: 0.115 }
      ], 12), bodyMat)
      sq.add(body)

      // cream belly patch riding the underside from haunch to chest
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), bellyMat)
      belly.scale.set(1.55, 0.7, 0.85)
      belly.rotation.z = Math.PI
      belly.position.set(0.0, 0.44, 0)
      sq.add(belly)

      // Head: rounded skull with cheek bulges tapering to a short snout,
      // built in its own local space and tilted up off the neck (alert pose)
      const headPivot = new THREE.Group()
      headPivot.position.set(0.40, 0.575, 0)
      headPivot.rotation.z = -0.18
      const head = new THREE.Mesh(makeLoft([
        { x: 0.00, cy: 0.00, ry: 0.125, rz: 0.115 },
        { x: 0.09, cy: 0.02, ry: 0.155, rz: 0.15 },
        { x: 0.20, cy: 0.03, ry: 0.145, rz: 0.14 },
        { x: 0.31, cy: 0.015, ry: 0.10, rz: 0.10 },
        { x: 0.40, cy: -0.01, ry: 0.058, rz: 0.062 }
      ], 12), bodyMat)
      headPivot.add(head)

      const earGeo = new THREE.ConeGeometry(0.065, 0.16, 7)
      const earInnerGeo = new THREE.ConeGeometry(0.036, 0.09, 6)
      const earL = new THREE.Mesh(earGeo, bodyMat)
      earL.position.set(0.155, 0.185, 0.095)
      earL.rotation.set(0.1, 0, -0.28)
      const earInnerL = new THREE.Mesh(earInnerGeo, darkMat)
      earInnerL.position.set(0.16, 0.175, 0.10)
      earInnerL.rotation.set(0.1, 0, -0.28)
      const earR = earL.clone()
      earR.position.z = -0.095
      earR.rotation.z = 0.28
      const earInnerR = earInnerL.clone()
      earInnerR.position.z = -0.10
      earInnerR.rotation.z = 0.28
      headPivot.add(earL, earR, earInnerL, earInnerR)

      const eyeGeo = new THREE.SphereGeometry(0.034, 10, 8)
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
      eyeL.position.set(0.255, 0.075, 0.115)
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
      eyeR.position.set(0.255, 0.075, -0.115)
      const shineGeo = new THREE.SphereGeometry(0.010, 6, 5)
      const shineL = new THREE.Mesh(shineGeo, shineMat)
      shineL.position.set(0.267, 0.086, 0.128)
      const shineR = new THREE.Mesh(shineGeo, shineMat)
      shineR.position.set(0.267, 0.086, -0.128)
      headPivot.add(eyeL, eyeR, shineL, shineR)

      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), noseMat)
      nose.scale.set(1.1, 0.85, 0.95)
      nose.position.set(0.415, -0.012, 0)
      headPivot.add(nose)

      // whiskers: thin tapered fins fanned from the snout
      const whiskerGeo = new THREE.ConeGeometry(0.004, 0.20, 3)
      for (const side of [1, -1]) {
        for (let w = 0; w < 3; w++) {
          const wh = new THREE.Mesh(whiskerGeo, whiskerMat)
          wh.position.set(0.37, -0.01 + w * 0.018, side * 0.05)
          wh.rotation.z = side * (Math.PI / 2 - 0.15)
          wh.rotation.y = (w - 1) * 0.35
          headPivot.add(wh)
        }
      }
      sq.add(headPivot)

      // Front paws tucked near the chest: short lofted forelegs
      const frontLegGeo = makeLoft([
        { x: 0, cy: 0, ry: 0.050, rz: 0.045 },
        { x: 0.20, cy: 0, ry: 0.036, rz: 0.033 },
        { x: 0.34, cy: 0, ry: 0.028, rz: 0.030 },
        { x: 0.42, cy: 0, ry: 0.032, rz: 0.038 }
      ], 8)
      frontLegGeo.rotateZ(-Math.PI / 2)
      const pawGeo = new THREE.SphereGeometry(0.036, 8, 6)
      for (const sz of [1, -1]) {
        const pivot = new THREE.Group()
        pivot.position.set(0.28, 0.48, sz * 0.14)
        const leg = new THREE.Mesh(frontLegGeo, bodyMat)
        pivot.add(leg)
        const paw = new THREE.Mesh(pawGeo, darkMat)
        paw.scale.set(1, 0.65, 1.1)
        paw.position.set(0, -0.42, 0)
        pivot.add(paw)
        sq.add(pivot)
        pivot.userData = { name: 'front', side: sz }
        legs.push(pivot)
      }

      // Hind legs: thicker, powerful haunches for the bounding gait
      const hindLegGeo = makeLoft([
        { x: 0, cy: 0, ry: 0.078, rz: 0.072 },
        { x: 0.17, cy: 0, ry: 0.058, rz: 0.052 },
        { x: 0.30, cy: 0, ry: 0.042, rz: 0.046 },
        { x: 0.40, cy: 0, ry: 0.050, rz: 0.058 }
      ], 8)
      hindLegGeo.rotateZ(-Math.PI / 2)
      const hindPawGeo = new THREE.SphereGeometry(0.048, 8, 6)
      for (const sz of [1, -1]) {
        const pivot = new THREE.Group()
        pivot.position.set(-0.24, 0.44, sz * 0.16)
        const leg = new THREE.Mesh(hindLegGeo, bodyMat)
        pivot.add(leg)
        const paw = new THREE.Mesh(hindPawGeo, darkMat)
        paw.scale.set(1.2, 0.6, 1)
        paw.position.set(0.02, -0.40, 0)
        pivot.add(paw)
        sq.add(pivot)
        pivot.userData = { name: 'hind', side: sz }
        legs.push(pivot)
      }

      // Bushy tail: three overlapping lofted plumes fanned side by side,
      // arched up and forward over the back, dark-tipped
      const tail = new THREE.Group()
      const tailCurve = (scale) => makeLoft([
        { x: 0.00, cy: 0.00, ry: 0.135 * scale, rz: 0.125 * scale },
        { x: -0.16, cy: 0.12, ry: 0.175 * scale, rz: 0.155 * scale },
        { x: -0.30, cy: 0.32, ry: 0.19 * scale, rz: 0.165 * scale },
        { x: -0.38, cy: 0.54, ry: 0.17 * scale, rz: 0.145 * scale },
        { x: -0.38, cy: 0.74, ry: 0.125 * scale, rz: 0.105 * scale },
        { x: -0.30, cy: 0.90, ry: 0.070 * scale, rz: 0.060 * scale },
        { x: -0.20, cy: 0.99, ry: 0.026 * scale, rz: 0.024 * scale }
      ], 10)
      const tailMain = new THREE.Mesh(tailCurve(1), bodyMat)
      const tailL = new THREE.Mesh(tailCurve(0.82), bodyMat)
      tailL.position.z = 0.055
      tailL.rotation.y = 0.05
      const tailR = new THREE.Mesh(tailCurve(0.82), bodyMat)
      tailR.position.z = -0.055
      tailR.rotation.y = -0.05
      const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), darkMat)
      tailTip.position.set(-0.20, 0.99, 0)
      tail.add(tailL, tailR, tailMain, tailTip)
      tail.position.set(-0.36, 0.46, 0)
      tail.rotation.z = 0.30
      sq.add(tail)

      sq.traverse(c => { if (c.isMesh) { c.castShadow = true } })

      let x, z, h
      let attempts = 0
      do {
        x = (Math.random() - 0.5) * 140
        z = (Math.random() - 0.5) * 140
        h = getHeight(x, z)
        attempts++
      } while ((h < 0.4 || h > 14) && attempts < 50)
      sq.position.set(x, h, z)

      squirrels.push({
        group: sq,
        tail,
        legs,
        pos: new THREE.Vector3(x, h, z),
        target: new THREE.Vector3(),
        state: 'pausing',
        timer: 0.5 + Math.random(),
        speed: 4.5 + Math.random() * 1.5,
      })
      scene.add(sq)
    }
  }

  function pickSquirrelTarget(sq) {
    let x, z, h
    let attempts = 0
    do {
      x = (Math.random() - 0.5) * 140
      z = (Math.random() - 0.5) * 140
      h = getHeight(x, z)
      attempts++
    } while ((h < 0.4 || h > 14) && attempts < 50)
    sq.target.set(x, h, z)
  }

  function updateSquirrels(delta, elapsed) {
    squirrels.forEach((sq, i) => {
      if (sq.state === 'pausing') {
        sq.timer -= delta
        sq.tail.rotation.y = Math.sin(elapsed * 2 + i) * 0.2
        sq.legs.forEach(leg => { leg.rotation.x *= 0.85 })
        sq.group.position.y += (sq.pos.y - sq.group.position.y) * 0.2
        if (sq.timer <= 0) {
          sq.state = 'dashing'
          sq.timer = 1 + Math.random()
          pickSquirrelTarget(sq)
        }
      } else {
        const dx = sq.target.x - sq.pos.x
        const dz = sq.target.z - sq.pos.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist < 1.5) {
          sq.state = 'pausing'
          sq.timer = 0.5 + Math.random()
        } else {
          const step = sq.speed * delta
          const nx = sq.pos.x + (dx / dist) * step
          const nz = sq.pos.z + (dz / dist) * step
          const h = getHeight(nx, nz)

          // Refuse to run into water: freeze briefly, then dash elsewhere
          if (sq.pos.y >= SAFE_H && h < SAFE_H) {
            sq.state = 'pausing'
            sq.timer = 0.4 + Math.random() * 0.6
          } else {
            sq.pos.x = nx
            sq.pos.z = nz
            sq.pos.y = h
            sq.group.position.set(sq.pos.x, h + Math.abs(Math.sin(elapsed * 14 + i)) * 0.08, sq.pos.z)

            const targetRot = -Math.atan2(dz, dx)
            let rotDiff = targetRot - sq.group.rotation.y
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2
            sq.group.rotation.y += rotDiff * 8 * delta

            // bounding gait: fronts and hinds swing in opposing pairs,
            // synced to the same hop frequency as the body bounce
            const gaitPhase = elapsed * 14 + i
            const frontSwing = Math.sin(gaitPhase) * 0.5
            const hindSwing = Math.sin(gaitPhase + Math.PI) * 0.6
            sq.legs.forEach(leg => {
              leg.rotation.x = leg.userData.name === 'front' ? frontSwing : hindSwing
            })

            sq.tail.rotation.y = Math.sin(elapsed * 10 + i) * 0.4
          }
        }
      }
    })
  }

  function createBirds() {
    const group = new THREE.Group()

    for (let i = 0; i < 8; i++) {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5f, roughness: 0.7 })
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x2c3949, roughness: 0.8, side: THREE.DoubleSide })
      const beakMat = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.6 })

      const bird = new THREE.Group()

      // Body: single loft — chest -> neck -> head
      const body = new THREE.Mesh(makeLoft([
        { x: -0.25, cy: 0, ry: 0.11, rz: 0.09 },
        { x: -0.05, cy: 0.01, ry: 0.14, rz: 0.12 },
        { x: 0.15, cy: 0.04, ry: 0.1, rz: 0.09 },
        { x: 0.3, cy: 0.05, ry: 0.085, rz: 0.08 },
        { x: 0.42, cy: 0.04, ry: 0.05, rz: 0.05 }
      ], 8), bodyMat)
      bird.add(body)

      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 5), beakMat)
      beak.position.set(0.5, 0.04, 0)
      beak.rotation.z = -Math.PI / 2
      bird.add(beak)

      // Tail: lofted fan
      const tail = new THREE.Mesh(makeLoft([
        { x: -0.3, cy: 0, ry: 0.04, rz: 0.05 },
        { x: -0.55, cy: 0.02, ry: 0.08, rz: 0.07 }
      ], 6), wingMat)
      bird.add(tail)

      // Triangular wings, root at shoulder, span along +Z
      const wingGeo = new THREE.BufferGeometry()
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0.05, 0,
        0.15, 0.05, 1.0,
        -0.4, 0.05, 0.4,
      ], 3))
      wingGeo.computeVertexNormals()
      const wingL = new THREE.Mesh(wingGeo, wingMat)
      const wingR = new THREE.Mesh(wingGeo, wingMat)
      wingR.scale.z = -1
      bird.add(wingL, wingR)

      bird.traverse(c => { if (c.isMesh) c.castShadow = true })

      bird.userData = {
        wingL,
        wingR,
        cx: (Math.random() - 0.5) * 120,
        cz: (Math.random() - 0.5) * 120,
        radius: 14 + Math.random() * 22,
        baseY: 18 + Math.random() * 12,
        theta: Math.random() * Math.PI * 2,
        speed: (0.08 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1),
        figure8: Math.random() < 0.5,
        phase: Math.random() * Math.PI * 2,
        flapFreq: 5 + Math.random() * 3,
      }
      group.add(bird)
      birds.push(bird)
    }

    scene.add(group)
  }

  function updateBirds(delta, elapsed) {
    birds.forEach(bird => {
      const u = bird.userData
      u.theta += u.speed * delta
      const t = u.theta
      let x, z, dx, dz
      if (u.figure8) {
        x = u.cx + u.radius * Math.cos(t)
        z = u.cz + u.radius * 0.5 * Math.sin(2 * t)
        dx = -u.radius * Math.sin(t)
        dz = u.radius * Math.cos(2 * t)
      } else {
        x = u.cx + u.radius * Math.cos(t)
        z = u.cz + u.radius * Math.sin(t)
        dx = -u.radius * Math.sin(t)
        dz = u.radius * Math.cos(t)
      }
      bird.position.set(x, u.baseY + Math.sin(t * 3 + u.phase) * 1.5, z)
      bird.rotation.y = -Math.atan2(dz * u.speed, dx * u.speed)

      const flap = Math.sin(elapsed * u.flapFreq + u.phase) * 0.75
      u.wingL.rotation.x = -0.1 - flap
      u.wingR.rotation.x = 0.1 + flap
    })
  }

  function createButterflies() {
    const palette = [0xf5b041, 0xfdfefe, 0x5dade2, 0xec7063, 0xf7dc6f]

    // Wing membranes (XY, root at origin, outward +y, body axis +x) -> laid on XZ
    const foreShape = new THREE.Shape()
    foreShape.moveTo(0.0, 0.0)
    foreShape.lineTo(0.26, 0.05)
    foreShape.quadraticCurveTo(0.34, 0.12, 0.3, 0.26)
    foreShape.quadraticCurveTo(0.27, 0.42, 0.13, 0.46)
    foreShape.quadraticCurveTo(0.04, 0.46, 0.02, 0.3)
    foreShape.quadraticCurveTo(-0.01, 0.15, 0.0, 0.0)

    const hindShape = new THREE.Shape()
    hindShape.moveTo(0.0, 0.0)
    hindShape.quadraticCurveTo(-0.08, 0.16, -0.18, 0.22)
    hindShape.quadraticCurveTo(-0.3, 0.24, -0.29, 0.12)
    hindShape.quadraticCurveTo(-0.27, 0.02, -0.16, -0.03)
    hindShape.quadraticCurveTo(-0.06, -0.05, 0.0, 0.0)

    const makeWingGeo = (shape, maxOut) => {
      const geo = new THREE.ShapeGeometry(shape, 10)
      geo.rotateX(Math.PI / 2) // outward +y -> +z
      const pos = geo.attributes.position
      const colors = []
      for (let i = 0; i < pos.count; i++) {
        let t = THREE.MathUtils.clamp(pos.getZ(i) / maxOut, 0, 1)
        t = t * t * (3 - 2 * t)
        const c = 1 - 0.55 * t
        colors.push(c, c, c)
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      return geo
    }
    const foreGeo = makeWingGeo(foreShape, 0.47)
    const hindGeo = makeWingGeo(hindShape, 0.25)

    for (let i = 0; i < 10; i++) {
      let hx, hz, hh
      let attempts = 0
      do {
        hx = (Math.random() - 0.5) * 130
        hz = (Math.random() - 0.5) * 130
        hh = getHeight(hx, hz)
        attempts++
      } while ((Math.sqrt(hx * hx + hz * hz) > 70 || hh < 0.35 || hh > 8) && attempts < 50)

      const color = palette[i % palette.length]
      const wingMat = new THREE.MeshStandardMaterial({
        color, roughness: 0.6, side: THREE.DoubleSide, vertexColors: true,
        emissive: new THREE.Color(color).multiplyScalar(0.12)
      })
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 })

      const bf = new THREE.Group()

      // Wings: fore + hind lobe per side, mirrored, flapped as a group
      const wingL = new THREE.Group()
      wingL.add(new THREE.Mesh(foreGeo, wingMat), new THREE.Mesh(hindGeo, wingMat))
      const wingR = new THREE.Group()
      const foreR = new THREE.Mesh(foreGeo, wingMat); foreR.scale.z = -1
      const hindR = new THREE.Mesh(hindGeo, wingMat); hindR.scale.z = -1
      wingR.add(foreR, hindR)
      bf.add(wingL, wingR)

      // Body: lofted abdomen -> thorax -> head base
      const body = new THREE.Mesh(makeLoft([
        { x: -0.16, cy: 0, ry: 0.018, rz: 0.018 },
        { x: -0.1, cy: 0.005, ry: 0.03, rz: 0.03 },
        { x: -0.02, cy: 0.01, ry: 0.038, rz: 0.038 },
        { x: 0.06, cy: 0.012, ry: 0.032, rz: 0.032 },
        { x: 0.12, cy: 0.01, ry: 0.022, rz: 0.022 }
      ], 8), bodyMat)
      bf.add(body)

      const headDot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), bodyMat)
      headDot.position.set(0.14, 0.012, 0)
      bf.add(headDot)

      // Antennae: thin curved tubes with club tips
      for (const side of [1, -1]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.15, 0.03, side * 0.01),
          new THREE.Vector3(0.2, 0.09, side * 0.03),
          new THREE.Vector3(0.24, 0.12, side * 0.05)
        ])
        bf.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.004, 4), bodyMat))
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), bodyMat)
        tip.position.set(0.24, 0.12, side * 0.05)
        bf.add(tip)
      }

      bf.scale.setScalar(0.8 + Math.random() * 0.4)
      bf.position.set(hx, hh + 1.2, hz)
      bf.traverse(c => { if (c.isMesh) c.castShadow = true })

      butterflies.push({
        group: bf,
        wingL,
        wingR,
        home: new THREE.Vector3(hx, hh, hz),
        target: new THREE.Vector3(hx, hh, hz),
        timer: 0,
        phase: Math.random() * Math.PI * 2,
      })
      scene.add(bf)
    }
  }

  function updateButterflies(delta, elapsed) {
    butterflies.forEach(bf => {
      bf.timer -= delta
      const dx = bf.target.x - bf.group.position.x
      const dz = bf.target.z - bf.group.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (bf.timer <= 0 || dist < 0.8) {
        const ang = Math.random() * Math.PI * 2
        const r = 2.5 + Math.random() * 5
        bf.target.set(
          THREE.MathUtils.clamp(bf.home.x + Math.cos(ang) * r, -85, 85),
          0,
          THREE.MathUtils.clamp(bf.home.z + Math.sin(ang) * r, -85, 85)
        )
        bf.timer = 2 + Math.random() * 3
      }

      const h = getHeight(bf.group.position.x, bf.group.position.z)
      const targetY = h + 1 + Math.sin(elapsed * 2.5 + bf.phase) * 0.4
      bf.group.position.x += (dx / (dist || 1)) * 2.2 * delta
      bf.group.position.z += (dz / (dist || 1)) * 2.2 * delta
      bf.group.position.y += (targetY - bf.group.position.y) * 4 * delta

      if (dist > 0.1) {
        bf.group.rotation.y = -Math.atan2(dz, dx)
      }

      const flap = Math.sin(elapsed * 16 + bf.phase)
      bf.wingL.rotation.x = -0.25 - flap * 0.9
      bf.wingR.rotation.x = 0.25 + flap * 0.9
    })
  }

  function createLeaves() {
    const count = 130
    const geo = new THREE.PlaneGeometry(0.3, 0.3)
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      side: THREE.DoubleSide,
      flatShading: true,
    })
    leafMesh = new THREE.InstancedMesh(geo, mat, count)
    leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    const palette = [0x7ab648, 0xd4ac3e, 0xc87d2f, 0x8a9a3a]
    const spots = (deciduousSpots.length ? deciduousSpots : treeSpots)

    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const spot = spots.length ? spots[Math.floor(Math.random() * spots.length)] : { x: 0, z: 0, h: 3 }
      const x = spot.x + (Math.random() - 0.5) * 6
      const z = spot.z + (Math.random() - 0.5) * 6
      const y = getHeight(x, z) + 5 + Math.random() * 5

      leaves.push({
        x, z, y,
        vy: 0.3 + Math.random() * 0.5,
        swayAmp: 0.4 + Math.random() * 0.8,
        swaySpeed: 0.8 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
        spin: 1 + Math.random() * 2,
      })
      dummy.position.set(x, y, z)
      dummy.rotation.set(Math.random() * 3, Math.random() * 3, 0)
      dummy.updateMatrix()
      leafMesh.setMatrixAt(i, dummy.matrix)
      leafMesh.setColorAt(i, new THREE.Color(palette[i % palette.length]).multiplyScalar(0.85 + Math.random() * 0.3))
    }

    leafMesh.instanceMatrix.needsUpdate = true
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true
    scene.add(leafMesh)
  }

  function updateLeaves(delta, elapsed, wind) {
    if (!leafMesh) return
    const spots = deciduousSpots.length ? deciduousSpots : treeSpots
    const dummy = new THREE.Object3D()

    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i]
      leaf.y -= leaf.vy * delta
      leaf.x += (wind.x + Math.sin(elapsed * leaf.swaySpeed + leaf.phase) * leaf.swayAmp) * 0.6 * delta
      leaf.z += (wind.z + Math.cos(elapsed * leaf.swaySpeed * 0.9 + leaf.phase) * leaf.swayAmp) * 0.6 * delta

      const h = getHeight(leaf.x, leaf.z)
      if (leaf.y < h + 0.15 || Math.abs(leaf.x) > 95 || Math.abs(leaf.z) > 95) {
        const spot = spots.length ? spots[Math.floor(Math.random() * spots.length)] : { x: 0, z: 0, h: 3 }
        leaf.x = spot.x + (Math.random() - 0.5) * 6
        leaf.z = spot.z + (Math.random() - 0.5) * 6
        leaf.y = getHeight(leaf.x, leaf.z) + 5 + Math.random() * 5
        leaf.phase = Math.random() * Math.PI * 2
      }

      const s = elapsed * leaf.spin + leaf.phase
      dummy.position.set(leaf.x, leaf.y, leaf.z)
      dummy.rotation.set(Math.sin(s * 0.7) * 0.9, s * 0.5, Math.cos(s * 0.6) * 0.9)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      leafMesh.setMatrixAt(i, dummy.matrix)
    }

    leafMesh.instanceMatrix.needsUpdate = true
  }

  function onResize() {
    if (!containerRef.value || !camera || !renderer) return
    const w = containerRef.value.clientWidth
    const h = containerRef.value.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  let prevTime = 0
  function animate(time) {
    animationId = requestAnimationFrame(animate)

    const elapsed = time * 0.001 || 0
    const delta = prevTime ? (time - prevTime) * 0.001 : 0.016
    prevTime = time

    // Update lake shader
    if (lakeMaterial) {
      lakeMaterial.uniforms.uTime.value = elapsed
    }

    // Animate clouds
    cloudGroups.forEach(cloud => {
      const { speed, range, phase } = cloud.userData
      cloud.position.x = Math.sin(elapsed * speed * 0.1 + phase) * range
      cloud.position.y += Math.sin(elapsed * 0.2 + phase) * 0.002
    })

    // Shared breeze for everything animated by wind
    const wind = windAt(0, 0, elapsed)

    // Grass + tree wind (GPU): one shared state feeds every wind shader
    windState.uTime.value = elapsed
    windState.uWind.value.set(wind.x, wind.z)
    if (grassWindShader) {
      grassWindShader.uniforms.uTime.value = elapsed
      grassWindShader.uniforms.uWind.value.set(wind.x, wind.z)
    }

    // Update deer herd
    updateDeerAnimation(delta, elapsed)

    // Squirrels
    updateSquirrels(delta, elapsed)

    // Birds
    updateBirds(delta, elapsed)

    // Butterflies
    updateButterflies(delta, elapsed)

    // Boat
    updateBoat(delta, elapsed)

    // Falling leaves
    updateLeaves(delta, elapsed, wind)

    controls.update()
    renderer.render(scene, camera)
  }

  function dispose() {
    if (animationId) cancelAnimationFrame(animationId)
    window.removeEventListener('resize', onResize)
    stopCameraMove?.()
    controls?.dispose()
    if (renderer) {
      const container = containerRef.value
      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
    // Dispose geometries and materials
    if (scene) {
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose())
          } else {
            obj.material.dispose()
          }
        }
      })
    }
    for (const t of texAssets) t.dispose()
  }

  return { init, dispose, autoRotate, toggleAutoRotate }
}