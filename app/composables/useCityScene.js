import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const MAP = 160
const ROADS = [0, 20, -20, 40, -40, 60, -60, 80, -80]

// ---------- canvas texture helpers ----------

function makeCanvas(size, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  draw(ctx, canvas)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeRadialTexture(size, stops) {
  return makeCanvas(size, (ctx) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    for (const [offset, color] of stops) g.addColorStop(offset, color)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  })
}

// ---------- ground texture (baked city grid) ----------

function makeGroundTexture() {
  const SCALE = 4
  const c = document.createElement('canvas')
  c.width = c.height = MAP * SCALE
  const ctx = c.getContext('2d')
  ctx.scale(SCALE, SCALE)
  {
    ctx.fillStyle = '#3a3d48'
    ctx.fillRect(0, 0, MAP, MAP)
    // subtle block speckle so the ground is not flat
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = Math.random() < 0.5
        ? `rgba(96,101,118,${0.04 + Math.random() * 0.06})`
        : `rgba(24,26,36,${0.05 + Math.random() * 0.08})`
      ctx.fillRect(Math.random() * MAP, Math.random() * MAP, 0.25, 0.25)
    }
    const roadSpans = (r) => {
      if (r === 40) return [[0, 102], [138, 22]]
      if (r === -40) return [[0, 22], [58, 102]]
      return [[0, MAP]]
    }
    // sidewalks flanking each road
    ctx.fillStyle = '#4a4e5a'
    for (const r of ROADS) {
      for (const [s, l] of roadSpans(r)) {
        ctx.fillRect(MAP / 2 + r - 3.6, s, 1.6, l)
        ctx.fillRect(MAP / 2 + r + 2, s, 1.6, l)
        ctx.fillRect(s, MAP / 2 + r - 3.6, l, 1.6)
        ctx.fillRect(s, MAP / 2 + r + 2, l, 1.6)
      }
    }
    // roads (clearly visible asphalt)
    for (const r of ROADS) {
      ctx.fillStyle = r === 0 ? '#2e313a' : '#33363f'
      for (const [s, l] of roadSpans(r)) {
        ctx.fillRect(MAP / 2 + r - 2, s, 4, l)
        ctx.fillRect(s, MAP / 2 + r - 2, l, 4)
      }
      // road wear patches
      ctx.fillStyle = 'rgba(18,20,28,0.5)'
      for (let i = 0; i < 3; i++) {
        const x = MAP / 2 + r + (Math.random() - 0.5) * 2
        ctx.fillRect(x, Math.random() * MAP, 1.5, 9)
      }
    }
    ctx.fillStyle = '#3f4350'
    ctx.fillRect(MAP / 2 + 22, MAP / 2 + 22, 36, 36)
    ctx.fillRect(MAP / 2 - 58, MAP / 2 - 58, 36, 36)
    ctx.fillRect(MAP / 2 + 22, MAP / 2 - 38, 36, 16)
    ctx.fillStyle = '#d8d8e0'
    for (let k = -4; k < 5; k++) {
      const t = k * 16 + 2
      ctx.fillRect(MAP / 2 + t, MAP / 2 - 1.5, 3, 1)
      ctx.fillRect(MAP / 2 + t, MAP / 2 + 0.5, 3, 1)
      ctx.fillRect(MAP / 2 - 1.5, MAP / 2 + t, 1, 3)
      ctx.fillRect(MAP / 2 + 0.5, MAP / 2 + t, 1, 3)
    }
    ctx.fillStyle = '#4a4e58'
    ctx.fillRect(MAP / 2 - 17, MAP / 2 - 17, 34, 34)
    ctx.fillStyle = '#545a66'
    ctx.fillRect(MAP / 2 - 14, MAP / 2 - 14, 28, 28)
    ctx.strokeStyle = '#62697a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(MAP / 2, MAP / 2, 6.8, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#1c4a5e'
    ctx.beginPath()
    ctx.arc(MAP / 2, MAP / 2, 5.8, 0, Math.PI * 2)
    ctx.fill()
    const parks = [[-10, -50], [10, 50], [50, 10], [-50, 10], [-30, -10]]
    for (const [bx, bz] of parks) {
      const x = MAP / 2 + bx
      const z = MAP / 2 + bz
      ctx.fillStyle = '#1f2d22'
      ctx.fillRect(x - 8.5, z - 8.5, 17, 17)
      ctx.fillStyle = '#27402a'
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.arc(x - 5 + (i % 2) * 10, z - 5 + Math.floor(i / 2) * 10, 1.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  return c
}

// ---------- building window textures ----------

function makeWindowTexture(base, winA, winB, lit, bands) {
  return makeCanvas(64, (ctx, canvas) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, 64, 128)
    if (bands) {
      ctx.fillStyle = winA
      for (let r = 2; r < 128 - 2; r += 9) {
        ctx.fillRect(1, r, 62, 3.5)
      }
      ctx.fillStyle = winB
      for (let r = 2; r < 128 - 2; r += 9) {
        ctx.fillRect(1, r + 4, 62, 1.2)
      }
      return
    }
    for (let r = 1; r < 7; r++) {
      for (let c = 1; c < 4; c++) {
        if (Math.random() > lit) continue
        ctx.fillStyle = Math.random() > 0.5 ? winA : winB
        ctx.fillRect(c * 15 + 2, r * 16 + 2, 10, 9)
      }
    }
  })
}

// ---------- detailed building textures ----------

function toTex(canvas) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
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

const BUILDING_STYLES = [
  { base: '#3d4a60', win: ['#3a6ea8', '#7ab8e8'], lit: 0.55, shop: ['#ffd28a', '#ffb86a'], glass: true },
  { base: '#4d4a56', win: ['#ffc26a', '#ffe0a0'], lit: 0.5, shop: ['#ffd9a0', '#ffc88a'] },
  { base: '#42525a', win: ['#2f9e9e', '#7adcdc'], lit: 0.5, shop: ['#9ae8e8', '#7adcdc'], glass: true },
  { base: '#484b58', win: ['#ff9a5a', '#ffc88a'], lit: 0.5, bands: true, shop: ['#ffd0a0', '#ffb080'] },
  { base: '#5e4a3c', win: ['#ff6a4a', '#8a4a2a'], lit: 0.35, shop: ['#ffc8a0', '#ff9a6a'], brick: true }
]

function drawWallTexture(ctx, W, H, style, cols, rows, isFactory) {
  if (isFactory) {
    // corrugated ribs + rust streaks + grain
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    for (let y = 0; y < H; y += 13) ctx.fillRect(0, y, W, 1)
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * W
      const y0 = Math.random() * H * 0.5
      const len = 30 + Math.random() * 60
      const sg = ctx.createLinearGradient(0, y0, 0, y0 + len)
      sg.addColorStop(0, 'rgba(150,90,50,0.28)')
      sg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = sg
      ctx.fillRect(x, y0, 1.5, len)
    }
    for (let i = 0; i < 2000; i++) {
      ctx.fillStyle = Math.random() < 0.5
        ? `rgba(255,255,255,${0.03 + Math.random() * 0.06})`
        : `rgba(0,0,0,${0.04 + Math.random() * 0.08})`
      ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1)
    }
    return
  }
  if (style.brick) {
    const bh = 9, bl = 18
    for (let y = 0; y < H; y += bh) {
      const off = (Math.floor(y / bh) % 2) * 9
      for (let x = -bl; x < W + bl; x += bl) {
        const v = 0.04 + Math.random() * 0.08
        ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${v})` : `rgba(255,190,140,${v * 0.7})`
        ctx.fillRect(x + off, y + 1, bl - 2, bh - 2)
      }
    }
    ctx.fillStyle = 'rgba(52,42,34,0.5)'
    for (let y = 0; y < H; y += bh) ctx.fillRect(0, y, W, 1)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    for (let x = 0; x < W; x += 9) ctx.fillRect(x, 0, 1, H)
  } else {
    // panel structure: spandrel bands + vertical seams
    const winTop = 8
    const floorH = (H - 58 - winTop - 8) / rows
    for (let r = 1; r < rows; r++) {
      ctx.fillStyle = 'rgba(255,255,255,0.09)'
      ctx.fillRect(0, winTop + r * floorH - 2, W, 1.5)
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.fillRect(0, winTop + r * floorH + 0.5, W, 2)
    }
    const colW = W / cols
    ctx.fillStyle = 'rgba(0,0,0,0.26)'
    for (let c = 1; c < cols; c++) ctx.fillRect(c * colW - 1, 0, 2, H)
    // plaster mottling
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * W, y = Math.random() * H
      const r = 12 + Math.random() * 28
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, Math.random() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    if (style.glass) {
      // diagonal reflection wash
      const rg = ctx.createLinearGradient(0, 0, W, H * 0.7)
      rg.addColorStop(0, 'rgba(255,255,255,0.12)')
      rg.addColorStop(0.35, 'rgba(255,255,255,0.03)')
      rg.addColorStop(0.55, 'rgba(0,0,0,0.09)')
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, W, H)
    }
  }
  // grime: bottom build-up + top soot + water streaks
  const gB = ctx.createLinearGradient(0, H, 0, H - 70)
  gB.addColorStop(0, 'rgba(0,0,0,0.34)')
  gB.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gB
  ctx.fillRect(0, H - 70, W, 70)
  const gT = ctx.createLinearGradient(0, 0, 0, 24)
  gT.addColorStop(0, 'rgba(0,0,0,0.42)')
  gT.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gT
  ctx.fillRect(0, 0, W, 24)
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * W
    const y0 = Math.random() * H * 0.55
    const len = 24 + Math.random() * 66
    const sg = ctx.createLinearGradient(0, y0, 0, y0 + len)
    sg.addColorStop(0, 'rgba(0,0,0,0.22)')
    sg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = sg
    ctx.fillRect(x, y0, 1.5 + Math.random() * 1.5, len)
  }
  // fine grain
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = Math.random() < 0.5
      ? `rgba(255,255,255,${0.03 + Math.random() * 0.05})`
      : `rgba(0,0,0,${0.04 + Math.random() * 0.07})`
    ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1)
  }
}

function makeFacadeCanvases(style, cols, rows, isFactory) {
  const W = 128, H = 256
  const make = () => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    return [c, c.getContext('2d')]
  }
  const [colorC, ctx] = make()
  const [glowC, gctx] = make()
  ctx.fillStyle = style.base
  ctx.fillRect(0, 0, W, H)
  gctx.fillStyle = '#1a1f2e'
  gctx.fillRect(0, 0, W, H)
  const groundY = H - 58
  // wall texture: full detail on the color map, faint on the glow map (night illumination)
  {
    const tmp = document.createElement('canvas')
    tmp.width = W
    tmp.height = H
    const tctx = tmp.getContext('2d')
    drawWallTexture(tctx, W, H, style, cols, rows, isFactory)
    ctx.drawImage(tmp, 0, 0)
    gctx.globalAlpha = 0.4
    gctx.drawImage(tmp, 0, 0)
    gctx.globalAlpha = 1
  }
  if (isFactory) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    for (let i = 0; i < 8; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 3, 9)
    const gh = 52
    const gw = W * 0.4
    const gx = (W - gw) / 2
    ctx.fillStyle = '#4a525e'
    ctx.fillRect(gx, groundY - gh, gw, gh)
    ctx.strokeStyle = 'rgba(15,17,22,0.9)'
    ctx.lineWidth = 2
    for (let x = gx + 7; x < gx + gw; x += 9) {
      ctx.beginPath()
      ctx.moveTo(x, groundY - gh + 2)
      ctx.lineTo(x, groundY - 4)
      ctx.stroke()
    }
    ctx.fillStyle = '#20242c'
    ctx.fillRect(0, groundY - gh - 8, W, 8)
    for (let i = 0; i < 4; i++) {
      const x = 8 + Math.random() * (W - 20)
      const y = Math.random() * (groundY - gh - 30)
      ctx.fillStyle = 'rgba(150,160,175,0.6)'
      ctx.fillRect(x, y, 8, 6)
      gctx.fillStyle = '#9aa4b0'
      gctx.fillRect(x, y, 8, 6)
    }
    gctx.fillStyle = '#ffe8b0'
    gctx.fillRect(0, groundY - gh - 16, W, 4)
    ctx.fillStyle = '#0a0a10'
    ctx.fillRect(0, groundY - gh - 18, W, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, H - 6, W, 6)
    return [colorC, glowC]
  }
  const winTop = 8
  const winH = groundY - winTop - 8
  const floorH = winH / rows
  const colW = W / cols
  const winState = (roll) => {
    if (roll < 0.34) return 'off'
    if (roll < 0.34 + style.lit * 0.75) return 'lit'
    if (roll < 0.86) return 'glass'
    return 'cool'
  }
  const winColor = (state) => {
    if (state === 'off') return 'rgba(0,0,0,0.6)'
    if (state === 'lit') return style.win[Math.random() > 0.5 ? 0 : 1]
    if (state === 'glass') return '#0a2434'
    return '#7ae8ff'
  }
  if (style.bands) {
    for (let r = 0; r < rows; r++) {
      const y = winTop + r * floorH + floorH * 0.18
      const bh = floorH * 0.6
      const state = Math.random() < style.lit ? 'lit' : 'off'
      const col = winColor(state)
      ctx.fillStyle = col
      ctx.fillRect(2, y, W - 4, bh)
      if (state === 'lit') {
        gctx.fillStyle = col
        gctx.fillRect(2, y, W - 4, bh)
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(2, y + bh, W - 4, 2)
    }
  } else {
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * colW + colW * 0.14
        const y = winTop + r * floorH + floorH * 0.16
        const ww = colW * 0.72
        const wh = Math.min(floorH * 0.6, 13)
        const state = winState(Math.random())
        const wcol = winColor(state)
        ctx.fillStyle = wcol
        ctx.fillRect(x, y, ww, wh)
        if (state === 'lit' || state === 'cool') {
          gctx.fillStyle = wcol
          gctx.fillRect(x, y, ww, wh)
        }
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(x, y, ww, 1)
        if (Math.random() < 0.16) {
          ctx.fillStyle = '#555a62'
          ctx.fillRect(x + ww * 0.2, y + wh + 1, ww * 0.6, 4)
        }
        if (Math.random() < 0.1) {
          const len = 14 + Math.random() * 22
          const grad = ctx.createLinearGradient(0, y + wh, 0, y + wh + len)
          grad.addColorStop(0, 'rgba(0,0,0,0.2)')
          grad.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = grad
          ctx.fillRect(x + ww * 0.75, y + wh, 2, len)
        }
      }
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.fillRect(0, 0, W, 4)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, 4, W, 2)
  // shopfront panes (entrance is a separate 3D mesh on one face)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, groundY - 2, W, 4)
  const panes = 3
  const pw = W / panes
  for (let p = 0; p < panes; p++) {
    const x = p * pw + 4
    if (Math.random() < 0.22) {
      ctx.fillStyle = '#3a3e46'
      ctx.fillRect(x, groundY, pw - 8, 52)
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      for (let yy = groundY + 5; yy < groundY + 52; yy += 6) ctx.fillRect(x + 3, yy, pw - 14, 2)
    } else {
      const lit = Math.random() < 0.7
      const col = lit ? style.shop[0] : style.shop[1]
      ctx.fillStyle = col
      ctx.fillRect(x, groundY, pw - 8, 52)
      if (lit) {
        gctx.fillStyle = col
        gctx.fillRect(x, groundY, pw - 8, 52)
      }
      ctx.fillStyle = 'rgba(15,15,20,0.85)'
      ctx.fillRect(x + 2, groundY, 2, 52)
      ctx.fillRect(x + pw - 10, groundY, 2, 52)
      ctx.fillRect(x + 2, groundY + 24, pw - 12, 3)
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.fillRect(x + 5, groundY + 4, pw - 16, 16)
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, H - 6, W, 6)
  return [colorC, glowC]
}

function makeSignCanvas() {
  const W = 128, H = 48
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const palettes = [
    ['#ff2d95', '#ffffff'], ['#2dffd5', '#111111'], ['#ffe14a', '#222222'],
    ['#ff6a3a', '#ffffff'], ['#3aff6a', '#111111'], ['#3a6aff', '#ffffff'],
    ['#ff3a6a', '#ffffff'], ['#8aff3a', '#111111']
  ]
  const [bg, fg] = palettes[Math.floor(Math.random() * palettes.length)]
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(0, H - 7, W, 7)
  const nGlyphs = 4 + Math.floor(Math.random() * 3)
  const gw = W / (nGlyphs + 1)
  ctx.fillStyle = fg
  for (let i = 0; i < nGlyphs; i++) {
    const gx = gw * 0.45 + i * gw + (Math.random() - 0.5) * 4
    const bars = 2 + Math.floor(Math.random() * 2)
    for (let b = 0; b < bars; b++) {
      ctx.fillRect(gx + b * 4, 8, 3, H - 16)
    }
    if (Math.random() > 0.4) {
      const hy = 12 + Math.floor(Math.random() * (H - 30))
      ctx.fillRect(gx - 2, hy, bars * 4 + 4, 3)
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  for (let i = 0; i < 18; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1)
  return c
}

function makeRoofCanvas() {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
  // bright asphalt base so the roof clearly reads as the building top
  const g = ctx.createLinearGradient(0, 0, S, S)
  g.addColorStop(0, '#5d6176')
  g.addColorStop(0.5, '#4e5264')
  g.addColorStop(1, '#3e4252')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  // bold tarmac patches (large soft contrast shapes)
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * S, y = Math.random() * S
    const r = 18 + Math.random() * 40
    const pg = ctx.createRadialGradient(x, y, 0, x, y, r)
    pg.addColorStop(0, Math.random() < 0.5 ? 'rgba(35,38,50,0.22)' : 'rgba(110,116,140,0.18)')
    pg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = pg
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // wide tar membrane seams
  for (let y = 14; y < S; y += 30) {
    ctx.beginPath()
    for (let x = 0; x <= S; x += 10) {
      const yy = y + Math.sin(x * 0.25 + y) * 2
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.strokeStyle = 'rgba(15,16,24,0.65)'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.beginPath()
    for (let x = 0; x <= S; x += 10) {
      const yy = y + 7 + Math.sin(x * 0.25 + y + 1) * 2
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.strokeStyle = 'rgba(150,158,182,0.16)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  // coarse gravel (2px dots)
  for (let i = 0; i < 4200; i++) {
    const s = 1 + Math.random() * 1.6
    ctx.fillStyle = Math.random() < 0.6
      ? `rgba(205,210,225,${0.09 + Math.random() * 0.14})`
      : `rgba(25,28,40,${0.1 + Math.random() * 0.15})`
    ctx.fillRect(Math.random() * S, Math.random() * S, s, s)
  }
  // bold puddles
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * S, y = Math.random() * S
    const r = 8 + Math.random() * 18
    const pg = ctx.createRadialGradient(x, y, 0, x, y, r)
    pg.addColorStop(0, 'rgba(10,12,22,0.5)')
    pg.addColorStop(0.75, 'rgba(10,12,22,0.22)')
    pg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = pg
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // AC pad stains
  for (let i = 0; i < 4; i++) {
    const x = 10 + Math.random() * (S - 44), y = 10 + Math.random() * (S - 34)
    ctx.fillStyle = 'rgba(15,17,26,0.45)'
    ctx.fillRect(x, y, 24, 16)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fillRect(x + 2, y + 2, 18, 12)
  }
  // oxidation streaks
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S
    const y0 = Math.random() * S
    const len = 14 + Math.random() * 34
    const og = ctx.createLinearGradient(0, y0, 0, y0 + len)
    og.addColorStop(0, 'rgba(130,115,85,0.3)')
    og.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = og
    ctx.fillRect(x, y0, 2.5, len)
  }
  // roof edge catchlight (bright rim reads the building top against the sky)
  const edge = 12
  const eg = ctx.createLinearGradient(0, 0, 0, edge)
  eg.addColorStop(0, 'rgba(215,225,250,0.34)')
  eg.addColorStop(1, 'rgba(215,225,250,0)')
  ctx.fillStyle = eg
  ctx.fillRect(0, 0, S, edge)
  ctx.fillRect(0, S - edge, S, edge)
  const eh = ctx.createLinearGradient(0, 0, edge, 0)
  eh.addColorStop(0, 'rgba(215,225,250,0.34)')
  eh.addColorStop(1, 'rgba(215,225,250,0)')
  ctx.fillStyle = eh
  ctx.fillRect(0, 0, edge, S)
  ctx.fillRect(S - edge, 0, edge, S)
  // bold vents
  for (let i = 0; i < 9; i++) {
    const x = 6 + Math.random() * (S - 12), y = 6 + Math.random() * (S - 12)
    const s = 6 + Math.random() * 5
    if (Math.random() < 0.5) {
      ctx.fillStyle = 'rgba(20,22,32,0.9)'
      ctx.fillRect(x, y, s, s)
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(x + 1.5, y + 1.5, s * 0.4, s * 0.4)
    } else {
      ctx.fillStyle = 'rgba(20,22,32,0.9)'
      ctx.beginPath()
      ctx.arc(x, y, s / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.beginPath()
      ctx.arc(x - s * 0.12, y - s * 0.12, s * 0.22, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  return c
}

function makeSteelCanvas() {
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
  // galvanized steel base
  ctx.fillStyle = '#79828e'
  ctx.fillRect(0, 0, S, S)
  // weld / pipe-section rings (horizontal bands wrap around each member)
  for (let y = 0; y < S; y += 10) {
    ctx.fillStyle = 'rgba(40,46,58,0.25)'
    ctx.fillRect(0, y, S, 1.5)
    ctx.fillStyle = 'rgba(200,210,225,0.12)'
    ctx.fillRect(0, y + 2, S, 1)
  }
  // mottled steel patches
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S, y = Math.random() * S
    const r = 5 + Math.random() * 12
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, Math.random() < 0.5 ? 'rgba(50,58,72,0.2)' : 'rgba(180,192,210,0.16)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // rust streaks (vertical = along the member)
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * S
    const y0 = Math.random() * S * 0.6
    const len = 14 + Math.random() * 40
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len)
    g.addColorStop(0, 'rgba(140,90,50,0.3)')
    g.addColorStop(1, 'rgba(140,90,50,0)')
    ctx.fillStyle = g
    ctx.fillRect(x, y0, 1.2, len)
  }
  // grain
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = Math.random() < 0.5
      ? `rgba(220,228,240,${0.03 + Math.random() * 0.06})`
      : `rgba(30,36,48,${0.04 + Math.random() * 0.07})`
    ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1)
  }
  return c
}

// ---------- car models (forward = +z) ----------

function makeSedan(color, wheelGeo, wheelMat) {
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fd8ff, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55
  })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 2.0), bodyMat)
  body.position.y = 0.42
  g.add(body)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 1.1), glassMat)
  cabin.position.set(0, 0.85, -0.15)
  g.add(cabin)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.9), bodyMat)
  hood.position.set(0, 0.62, 0.55)
  g.add(hood)
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 1.0), bodyMat)
  front.position.set(0, 0.45, 1.0)
  g.add(front)
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffe88a, emissiveIntensity: 0.9 })
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a1a12, emissive: 0xff2211, emissiveIntensity: 0.6 })
  for (const sx of [0.36, -0.36]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.06), lightMat)
    hl.position.set(sx, 0.42, 1.0)
    g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.06), tailMat)
    tl.position.set(sx, 0.42, -1.0)
    g.add(tl)
  }
  const wheels = []
  for (const [wx, wz] of [[0.55, 0.62], [0.55, -0.62], [-0.55, 0.62], [-0.55, -0.62]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat)
    w.rotation.x = Math.PI / 2
    w.position.set(wx, 0.22, wz)
    g.add(w)
    wheels.push(w)
  }
  return { group: g, wheels }
}

function makeTaxi(wheelGeo, wheelMat) {
  const t = makeSedan(0xf5b400, wheelGeo, wheelMat)
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d8, emissive: 0xffe08a, emissiveIntensity: 1.1
  })
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), signMat)
  sign.position.set(0, 1.12, -0.1)
  t.group.add(sign)
  return t
}

function makeBus(color, wheelGeo, wheelMat) {
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xa8d8f8, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55
  })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.95, 2.6), bodyMat)
  body.position.y = 0.75
  g.add(body)
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.5, 2.45), glassMat)
  band.position.y = 1.25
  g.add(band)
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffe88a, emissiveIntensity: 0.9 })
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a1a12, emissive: 0xff2211, emissiveIntensity: 0.6 })
  for (const sx of [0.42, -0.42]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.06), lightMat)
    hl.position.set(sx, 0.8, 1.3)
    g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.06), tailMat)
    tl.position.set(sx, 0.8, -1.3)
    g.add(tl)
  }
  const wheels = []
  for (const [wx, wz] of [[0.72, 0.75], [0.72, -0.75], [-0.72, 0.75], [-0.72, -0.75]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat)
    w.rotation.x = Math.PI / 2
    w.position.set(wx, 0.24, wz)
    g.add(w)
    wheels.push(w)
  }
  return { group: g, wheels }
}

function makeTruck(wheelGeo, wheelMat) {
  const g = new THREE.Group()
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x3a8a4a, roughness: 0.45, metalness: 0.3 })
  const cargoMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.6, metalness: 0.35 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xa8d8f8, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55
  })
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.1), cabMat)
  cab.position.set(0, 0.85, 0.85)
  g.add(cab)
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.5, 1.05), glassMat)
  windshield.position.set(0, 0.95, 0.42)
  g.add(windshield)
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.65), cargoMat)
  cargo.position.set(0, 0.95, -0.35)
  g.add(cargo)
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffe88a, emissiveIntensity: 0.9 })
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a1a12, emissive: 0xff2211, emissiveIntensity: 0.6 })
  for (const sx of [0.35, -0.35]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), lightMat)
    hl.position.set(sx, 0.85, 1.3)
    g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), tailMat)
    tl.position.set(sx, 0.85, -1.3)
    g.add(tl)
  }
  const wheels = []
  for (const [wx, wz] of [[0.72, 0.7], [0.72, -0.7], [-0.72, 0.7], [-0.72, -0.7]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat)
    w.rotation.x = Math.PI / 2
    w.position.set(wx, 0.24, wz)
    g.add(w)
    wheels.push(w)
  }
  return { group: g, wheels }
}

// ---------- scene ----------

export function useCityScene(containerRef) {
  let renderer, scene, camera, orbit, frame
  let disposed = false
  const autoRotate = ref(true)
  const texAssets = []

  const cars = []
  let beaconGroup = null
  let blinkMat = null
  let fountain = null
  let lampPoles = null
  let lampHeads = null
  let treeTrunks = null
  let treeCrowns = null

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
    renderer.toneMappingExposure = 1.25
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0c0f24)
    scene.fog = new THREE.Fog(0x16162e, 80, 340)
    camera = new THREE.PerspectiveCamera(52, width / height, 0.5, 700)
    camera.position.set(48, 42, 88)

    orbit = new OrbitControls(camera, renderer.domElement)
    orbit.target.set(0, 2, 0)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.05
    orbit.minDistance = 15
    orbit.maxDistance = 280
    orbit.maxPolarAngle = Math.PI / 2.06
    orbit.autoRotateSpeed = 0.12

    // ---- lights ----
    scene.add(new THREE.AmbientLight(0x334466, 0.85))
    scene.add(new THREE.HemisphereLight(0x3a4a6a, 0x181828, 1.05))
    const moon = new THREE.DirectionalLight(0xa8bcd8, 1.55)
    moon.position.set(-120, 160, 60)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    moon.shadow.camera.left = -70
    moon.shadow.camera.right = 70
    moon.shadow.camera.top = 70
    moon.shadow.camera.bottom = -70
    moon.shadow.camera.near = 10
    moon.shadow.camera.far = 400
    scene.add(moon)

    // ---- sky + moon + stars ----
    const moonTex = makeRadialTexture(128, [
      [0, 'rgba(255,255,255,1)'],
      [0.5, 'rgba(220,228,255,0.9)'],
      [0.7, 'rgba(170,190,240,0.25)'],
      [1, 'rgba(150,170,220,0)']
    ])
    texAssets.push(moonTex)
    const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTex, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false
    }))
    moonSprite.position.set(-150, 130, -110)
    moonSprite.scale.setScalar(46)
    scene.add(moonSprite)
    const starTex = makeCanvas(128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.25, 'rgba(255,250,235,0.85)')
      g.addColorStop(0.6, 'rgba(255,240,210,0.12)')
      g.addColorStop(1, 'rgba(255,230,200,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 128, 128)
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(64, 4)
      ctx.lineTo(64, 124)
      ctx.moveTo(4, 64)
      ctx.lineTo(124, 64)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(64 - 26, 64 - 26)
      ctx.lineTo(64 + 26, 64 + 26)
      ctx.moveTo(64 + 26, 64 - 26)
      ctx.lineTo(64 - 26, 64 + 26)
      ctx.stroke()
    })
    texAssets.push(starTex)
    const polaris = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starTex, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false
    }))
    polaris.position.set(0, 200, -40)
    polaris.scale.setScalar(15)
    scene.add(polaris)
    {
      const count = 500
      const pos = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3().randomDirection()
        v.y = Math.abs(v.y) * 0.8 + 0.2
        v.multiplyScalar(380 + Math.random() * 120)
        pos[i * 3] = v.x
        pos[i * 3 + 1] = v.y
        pos[i * 3 + 2] = v.z
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffffff, size: 0.7, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false
      })))
    }

    // ---- ground ----
    {
      const groundTex = toTex(makeGroundTexture())
      texAssets.push(groundTex)
      const geo = new THREE.PlaneGeometry(MAP, MAP)
      geo.rotateX(-Math.PI / 2)
      const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: groundTex, emissiveMap: groundTex, emissive: 0xffffff, emissiveIntensity: 0.3,
        roughness: 0.85, metalness: 0.1
      }))
      ground.position.y = -0.05
      ground.receiveShadow = true
      scene.add(ground)
    }

    // ---- street lamps (instanced) ----
    {
      const count = 40
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.11, 4.2, 6)
      poleGeo.translate(0, 2.1, 0)
      const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.35)
      headGeo.translate(0, 4.4, 0.35)
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.6, metalness: 0.5, emissive: 0x1e2532, emissiveIntensity: 0.35 })
      const headMat = new THREE.MeshStandardMaterial({
        color: 0xffe8b8, emissive: 0xffd98a, emissiveIntensity: 1.2
      })
      lampPoles = new THREE.InstancedMesh(poleGeo, poleMat, count)
      lampHeads = new THREE.InstancedMesh(headGeo, headMat, count)
      const dummy = new THREE.Object3D()
      let placed = 0
      for (const g of ROADS) {
        for (const o of [-12, 12]) {
          for (const [px, pz] of [[g, o], [o, g]]) {
            dummy.position.set(px, 0, pz)
            dummy.rotation.set(0, Math.random() * Math.PI, 0)
            dummy.scale.setScalar(1)
            dummy.updateMatrix()
            lampPoles.setMatrixAt(placed, dummy.matrix)
            lampHeads.setMatrixAt(placed, dummy.matrix)
            placed++
          }
        }
      }
      lampPoles.count = placed
      lampHeads.count = placed
      lampPoles.instanceMatrix.needsUpdate = true
      lampHeads.instanceMatrix.needsUpdate = true
      scene.add(lampPoles, lampHeads)
    }

    // ---- trees (parks + plaza) ----
    {
      const count = 34
      const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6)
      trunkGeo.translate(0, 0.8, 0)
      const crownGeo = new THREE.ConeGeometry(1.5, 3.2, 7)
      crownGeo.translate(0, 3.2, 0)
      treeTrunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2e, roughness: 0.9 }), count)
      treeCrowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x2a5236, roughness: 0.85, flatShading: true }), count)
      const dummy = new THREE.Object3D()
      let placed = 0
      const parks = [[-10, -50], [10, 50], [50, 10], [-50, 10], [-30, -10]]
      for (const [bx, bz] of parks) {
        for (let i = 0; i < 6; i++) {
          const x = bx + (Math.random() - 0.5) * 12
          const z = bz + (Math.random() - 0.5) * 12
          const s = 0.7 + Math.random() * 0.7
          dummy.position.set(x, 0, z)
          dummy.rotation.set(0, Math.random() * Math.PI, 0)
          dummy.scale.set(s, s, s)
          dummy.updateMatrix()
          treeTrunks.setMatrixAt(placed, dummy.matrix)
          treeCrowns.setMatrixAt(placed, dummy.matrix)
          placed++
        }
      }
      for (const [x, z] of [[7, 7], [-7, 7], [7, -7], [-7, -7]]) {
        dummy.position.set(x, 0, z)
        dummy.rotation.set(0, Math.random() * Math.PI, 0)
        dummy.scale.set(1.1, 1.1, 1.1)
        dummy.updateMatrix()
        treeTrunks.setMatrixAt(placed, dummy.matrix)
        treeCrowns.setMatrixAt(placed, dummy.matrix)
        placed++
      }
      treeTrunks.count = placed
      treeCrowns.count = placed
      treeTrunks.instanceMatrix.needsUpdate = true
      treeCrowns.instanceMatrix.needsUpdate = true
      treeTrunks.castShadow = true
      treeCrowns.castShadow = true
      scene.add(treeTrunks, treeCrowns)
    }

    // ---- buildings ----
    createBuildings()

    // ---- landmarks ----
    createSpire()
    createDome()
    createTwins()
    createPyramid()
    createRadioTower()
    createFountain()

    // ---- cars ----
    createCars()

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
    function animate() {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const now = performance.now()
      CLOCK_DELTA = Math.min((now - clock.last) / 1000, 0.05)
      clock.last = now
      const elapsed = clock.last / 1000

      orbit.autoRotate = autoRotate.value
      updateCars(CLOCK_DELTA)
      if (beaconGroup) beaconGroup.rotation.y = elapsed * 0.9
      if (blinkMat) blinkMat.emissiveIntensity = 0.4 + 1.8 * Math.pow(Math.max(0, Math.sin(elapsed * 2.2)), 3)
      if (fountain) {
        for (const jet of fountain.jets) {
          const s = 0.7 + 0.5 * Math.abs(Math.sin(elapsed * 1.8 + jet.phase))
          jet.mesh.scale.y = s
          jet.mesh.position.y = jet.baseY + (jet.height * s) / 2
        }
        fountain.disc.scale.set(1 + Math.sin(elapsed * 1.2) * 0.05, 1, 1 + Math.sin(elapsed * 1.2) * 0.05)
      }
      orbit.update()
      renderer.render(scene, camera)
    }
    animate()
  }

  // ---------- buildings ----------

  function createBuildings() {
    const roofTex = toTex(makeRoofCanvas())
    texAssets.push(roofTex)
    const roofMatBase = new THREE.MeshStandardMaterial({
      map: roofTex, bumpMap: roofTex, bumpScale: 0.2, roughness: 0.9,
      emissiveMap: roofTex, emissive: 0xffffff, emissiveIntensity: 0.4
    })
    const roofDark = new THREE.MeshStandardMaterial({ color: 0x23252e, roughness: 0.9 })
    const propMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0.2 })
    const basicPropMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true })

    const makeBuilding = (w, h, d, styleIdx, isFactory, rand, glow) => {
      const g = new THREE.Group()
      const roofMat = roofMatBase.clone()
      roofMat.color.multiplyScalar(0.88 + rand() * 0.2)
      const rows = THREE.MathUtils.clamp(Math.round(h / 3.4), 2, 9)
      const colsX = THREE.MathUtils.clamp(Math.round(w / 2.3), 3, 6)
      const colsZ = THREE.MathUtils.clamp(Math.round(d / 2.3), 3, 6)
      const style = BUILDING_STYLES[styleIdx]
      const [facCx, glowCx] = makeFacadeCanvases(style, colsX, rows, isFactory)
      const [facCz, glowCz] = makeFacadeCanvases(style, colsZ, rows, isFactory)
      const texX = toTex(facCx)
      const glowX = toTex(glowCx)
      const texZ = toTex(facCz)
      const glowZ = toTex(glowCz)
      texAssets.push(texX, glowX, texZ, glowZ)
      const facX = new THREE.MeshStandardMaterial({
        map: texX, bumpMap: texX, bumpScale: 0.05,
        emissiveMap: glowX, emissive: 0xffffff, emissiveIntensity: glow,
        color: 0xffffff, roughness: 0.6, metalness: 0.15
      })
      const facZ = facX.clone()
      facZ.map = texZ
      facZ.bumpMap = texZ
      facZ.emissiveMap = glowZ
      // box with 5 faces (bottom skipped) + per-face materials
      const bodyGeo = new THREE.BoxGeometry(w, h, d)
      bodyGeo.groups = bodyGeo.groups
        .filter((grp) => grp.materialIndex !== 3)
        .map((grp) => ({
          start: grp.start, count: grp.count, materialIndex: grp.materialIndex > 3 ? grp.materialIndex - 1 : grp.materialIndex
        }))
      const body = new THREE.Mesh(bodyGeo, [facX, facX, roofDark, facZ, facZ])
      body.position.y = h / 2
      body.castShadow = true
      body.receiveShadow = true
      g.add(body)
      // explicit roof slab: guaranteed visible textured top
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), roofMat)
      slab.position.y = h + 0.15
      slab.castShadow = true
      g.add(slab)

      // roof props: hollow parapet frame + AC + water tank + vents (+ stack for factories)
      const propParts = []
      {
        const paraColor = (geo, bright) => {
          const n = geo.attributes.position.count
          const col = new Float32Array(n * 3)
          const faceC = [
            [0.17, 0.17, 0.21], [0.12, 0.12, 0.15], [bright, bright, bright + 0.04],
            [0.1, 0.1, 0.13], [0.16, 0.16, 0.2], [0.13, 0.13, 0.16]
          ]
          for (let f = 0; f < 6; f++) {
            for (let v = 0; v < 4; v++) {
              const i = (f * 4 + v) * 3
              col[i] = faceC[f][0]
              col[i + 1] = faceC[f][1]
              col[i + 2] = faceC[f][2]
            }
          }
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
          return geo
        }
        // hollow parapet frame (4 walls) so the roof slab stays visible
        const pt = 0.17
        const wx = paraColor(new THREE.BoxGeometry(w + 0.34, 0.45, pt), 0.24)
        wx.translate(0, h + 0.525, d / 2 + pt / 2)
        propParts.push(wx)
        const wx2 = paraColor(new THREE.BoxGeometry(w + 0.34, 0.45, pt), 0.24)
        wx2.translate(0, h + 0.525, -(d / 2 + pt / 2))
        propParts.push(wx2)
        const wz = paraColor(new THREE.BoxGeometry(pt, 0.45, d), 0.24)
        wz.translate(w / 2 + pt / 2, h + 0.525, 0)
        propParts.push(wz)
        const wz2 = paraColor(new THREE.BoxGeometry(pt, 0.45, d), 0.24)
        wz2.translate(-(w / 2 + pt / 2), h + 0.525, 0)
        propParts.push(wz2)
        const acW = 0.7 + rand() * 0.5, acH = 0.5 + rand() * 0.2, acD = 0.7 + rand() * 0.5
        const ac = new THREE.BoxGeometry(acW, acH, acD)
        ac.translate(-w * 0.24 + rand() * 0.2, h + 0.3 + acH / 2, -d * 0.2 + rand() * 0.2)
        propParts.push(tintGeo(ac, 0.4, 0.42, 0.46))
        const fan = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8)
        fan.rotateX(Math.PI / 2)
        fan.translate(-w * 0.24 + rand() * 0.2, h + 0.3 + acH + 0.015, -d * 0.2 + rand() * 0.2)
        propParts.push(tintGeo(fan, 0.09, 0.09, 0.11))
        const tr = 0.4 + rand() * 0.3, th = 0.6 + rand() * 0.5
        const tank = new THREE.CylinderGeometry(tr, tr, th, 10)
        tank.translate(w * 0.24, h + 0.3 + th / 2, d * 0.16)
        propParts.push(tintGeo(tank, 0.5, 0.52, 0.55))
        const vent = new THREE.BoxGeometry(0.45, 0.6, 0.45)
        vent.translate(w * 0.14, h + 1.05, -d * 0.3)
        propParts.push(tintGeo(vent, 0.28, 0.29, 0.33))
        if (isFactory) {
          const sh = 3.5 + rand() * 2.5
          const stack = new THREE.CylinderGeometry(0.25 + rand() * 0.2, 0.4 + rand() * 0.25, sh, 8)
          stack.translate(-w * 0.3, h + 0.3 + sh / 2, -d * 0.28)
          propParts.push(tintGeo(stack, 0.32, 0.33, 0.37))
          const rim = new THREE.CylinderGeometry(0.28 + rand() * 0.2, 0.28 + rand() * 0.2, 0.18, 8)
          rim.translate(-w * 0.3, h + 0.3 + sh + 0.09, -d * 0.28)
          propParts.push(tintGeo(rim, 0.12, 0.12, 0.14))
        }
        if (h > 16 && rand() < 0.35) {
          const ant = new THREE.CylinderGeometry(0.04, 0.06, 3, 5)
          ant.translate(w * 0.3, h + 2.25, d * 0.1)
          propParts.push(tintGeo(ant, 0.2, 0.2, 0.24))
          const blk = new THREE.SphereGeometry(0.07, 6, 6)
          blk.translate(w * 0.3, h + 3.7, d * 0.1)
          propParts.push(tintGeo(blk, 0.55, 0.08, 0.06))
        }
      }
      g.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(propParts, false), propMat))

      // entrance: door + frame + lit glass + glow strip (merged, unlit)
      const doorParts = []
      {
        const dh = 2.3, dw = 1.0
        const door = new THREE.BoxGeometry(dw, dh, 0.07)
        door.translate(0, dh / 2, 0)
        doorParts.push(tintGeo(door, 0.045, 0.05, 0.06))
        const frame = new THREE.BoxGeometry(dw + 0.18, dh + 0.14, 0.05)
        frame.translate(0, dh / 2, -0.02)
        doorParts.push(tintGeo(frame, 0.26, 0.27, 0.31))
        const glass = new THREE.BoxGeometry(dw * 0.55, dh * 0.42, 0.035)
        glass.translate(0, dh * 0.42, 0.052)
        doorParts.push(tintGeo(glass, 1.0, 0.82, 0.5))
        const strip = new THREE.BoxGeometry(dw + 0.45, 0.13, 0.07)
        strip.translate(0, dh + 0.12, 0)
        doorParts.push(tintGeo(strip, 1.0, 0.72, 0.28))
      }
      const door = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(doorParts, false), basicPropMat)
      const faceIdx = Math.floor(rand() * 4)
      const side = faceIdx < 2
      const faceRot = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][faceIdx]
      const facePos = side
        ? [(faceIdx === 0 ? 1 : -1) * (w / 2 + 0.04), 0]
        : [0, (faceIdx === 2 ? 1 : -1) * (d / 2 + 0.04)]
      door.rotation.y = faceRot
      door.position.set(facePos[0], 1.15, facePos[1])
      g.add(door)

      // neon signboard above the shopfront + vertical tower sign
      const signTex = toTex(makeSignCanvas())
      texAssets.push(signTex)
      const signMat = new THREE.MeshStandardMaterial({
        map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.5
      })
      const sign = new THREE.Mesh(new THREE.BoxGeometry(side ? d * 0.7 : w * 0.7, 1.0, 0.14), signMat)
      sign.position.set(facePos[0], 3.15, facePos[1])
      sign.rotation.y = faceRot
      g.add(sign)
      const cSide = rand() < 0.5 ? 1 : -1
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.72), signMat)
      if (side) {
        tower.position.set(facePos[0] + Math.sign(facePos[0]) * 0.09, 1.4, cSide * (d / 2 - 0.05))
      } else {
        tower.position.set(cSide * (w / 2 - 0.05), 1.4, facePos[1] + Math.sign(facePos[1]) * 0.09)
        tower.rotation.y = Math.PI / 2
      }
      g.add(tower)

      return g
    }

    const blocks = []
    for (const bx of [10, 30, 50, 70]) {
      for (const bz of [10, 30, 50, 70]) {
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          blocks.push([bx * sx, bz * sz])
        }
      }
    }
    const parks = [[-10, -50], [10, 50], [50, 10], [-50, 10], [-30, -10]]
    const isPark = (x, z) => parks.some(([px, pz]) => px === x && pz === z)
    const isPlaza = (x, z) => Math.max(Math.abs(x), Math.abs(z)) <= 10
    const isLandmark = (x, z) =>
      (x === 30 && z === 30) || (x === 50 && z === 30) ||
      (x === 30 && z === 50) || (x === 50 && z === 50) ||
      (x === 30 && z === -30) || (x === 50 && z === -30) ||
      (x === -30 && z === -30) || (x === -50 && z === -30) ||
      (x === -30 && z === -50) || (x === -50 && z === -50) ||
      (x === -30 && z === 50)

    for (const [bx, bz] of blocks) {
      if (isPark(bx, bz) || isPlaza(bx, bz) || isLandmark(bx, bz)) continue
      const ring = Math.max(Math.abs(bx), Math.abs(bz)) / 20
      const n = Math.random() < 0.35 ? 2 : 1
      const spots = n === 1 ? [[0, 0]] : [
        [-3.6 + Math.random() * 1.6, (Math.random() - 0.5) * 3],
        [3.6 - Math.random() * 1.6, (Math.random() - 0.5) * 3]
      ]
      for (const [ox, oz] of spots) {
        const isFactory = ring >= 2.5 && Math.random() < 0.25
        const w = isFactory ? 9 + Math.random() * 4 : n === 2 ? 4 + Math.random() * 2.5 : 5 + Math.random() * 5
        const d = isFactory ? 8 + Math.random() * 4 : n === 2 ? 4 + Math.random() * 2.5 : 5 + Math.random() * 5
        let h
        if (isFactory) h = 4 + Math.random() * 3
        else if (ring <= 1.5) h = 14 + Math.random() * 14
        else if (ring <= 2.5) h = 10 + Math.random() * 8
        else h = 6 + Math.random() * 6
        if ((Math.abs(bx) === 10 && Math.abs(bz) === 30) || (Math.abs(bx) === 30 && Math.abs(bz) === 10)) {
          if (Math.random() < 0.6) h = 24 + Math.random() * 12
        }

        const styleIdx = ring <= 1.5 ? Math.floor(Math.random() * 3)
          : ring <= 2.5 ? 1 + Math.floor(Math.random() * 2)
            : 2 + Math.floor(Math.random() * 3)
        const glow = 0.7 + Math.random() * 0.55 + (ring <= 1 ? 0.2 : 0)
        const b = makeBuilding(w, h, d, styleIdx, isFactory, Math.random, glow)
        b.position.set(bx + ox + (Math.random() - 0.5) * 2, 0, bz + oz + (Math.random() - 0.5) * 2)
        scene.add(b)
      }
    }
  }

  // ---------- landmarks ----------

  function createSpire() {
    const g = new THREE.Group()
    const metal = new THREE.MeshStandardMaterial({ color: 0x6a7688, roughness: 0.4, metalness: 0.6, emissive: 0x2a3344, emissiveIntensity: 0.35 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a5262, roughness: 0.5, metalness: 0.5, emissive: 0x222a38, emissiveIntensity: 0.35 })
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 2.2, 12), dark)
    base.position.y = 1.1
    g.add(base)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.8, 26, 12), metal)
    shaft.position.y = 15
    g.add(shaft)
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.4, 1.4, 12), dark)
    deck.position.y = 28.6
    g.add(deck)
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(3.9, 3.9, 0.9, 16),
      new THREE.MeshStandardMaterial({ color: 0x0e2434, emissive: 0x55ddff, emissiveIntensity: 1.6, roughness: 0.3 })
    )
    glass.position.y = 29.4
    g.add(glass)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 10), dark)
    roof.position.y = 31.3
    g.add(roof)
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), metal)
    antenna.position.y = 36.2
    g.add(antenna)
    blinkMat = new THREE.MeshStandardMaterial({ color: 0x3a0a0a, emissive: 0xff2211, emissiveIntensity: 1 })
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), blinkMat)
    blink.position.y = 39.8
    g.add(blink)
    beaconGroup = new THREE.Group()
    beaconGroup.position.y = 30.5
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    })
    const beamGeo = new THREE.CylinderGeometry(1.3, 0.04, 16, 10, 1, true)
    for (const side of [1, -1]) {
      const beam = new THREE.Mesh(beamGeo, beamMat)
      beam.rotation.x = side * Math.PI / 2
      beam.position.z = side * 8
      beaconGroup.add(beam)
    }
    g.add(beaconGroup)
    for (const m of [base, shaft, deck, roof]) m.castShadow = true
    g.position.set(0, 0, 13)
    scene.add(g)
  }

  function createDome() {
    const tex = makeCanvas(128, (ctx) => {
      ctx.fillStyle = '#0e1c2e'
      ctx.fillRect(0, 0, 128, 128)
      ctx.strokeStyle = '#3a6ea8'
      ctx.lineWidth = 3
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath()
        ctx.moveTo(64 + Math.cos(i / 8 * Math.PI * 2) * 60, 64 + Math.sin(i / 8 * Math.PI * 2) * 60)
        ctx.lineTo(64, 64)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(64, 64, 60, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#7ab8e8'
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    texAssets.push(tex)
    const g = new THREE.Group()
    const domeMat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9,
      color: 0xffffff, roughness: 0.5, metalness: 0.2
    })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(15, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeMat)
    dome.scale.y = 0.42
    dome.position.y = 6.3
    dome.castShadow = true
    g.add(dome)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(15, 0.5, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.5, metalness: 0.5, emissive: 0x28303e, emissiveIntensity: 0.3 })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.4
    g.add(ring)
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5a6474, roughness: 0.4, metalness: 0.5, emissive: 0x2a3344, emissiveIntensity: 0.35 })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5, 6), pillarMat)
      p.position.set(Math.cos(a) * 14.5, 2.5, Math.sin(a) * 14.5)
      g.add(p)
    }
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(15.3, 15.3, 0.3, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb06a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending })
    )
    glow.position.y = 0.5
    g.add(glow)
    g.position.set(40, 0, 40)
    scene.add(g)
  }

  function createTwins() {
    const tex = makeWindowTexture('#181822', '#ff9a5a', '#ffc88a', 0.5, true)
    texAssets.push(tex)
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.2,
      color: 0xffffff, roughness: 0.55, metalness: 0.25
    })
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(10, 24, 10), mat)
    t1.position.set(30, 12, -30)
    t1.castShadow = true
    scene.add(t1)
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 10), mat)
    t2.position.set(50, 10, -30)
    t2.castShadow = true
    scene.add(t2)
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0x2e3440, roughness: 0.4, metalness: 0.4,
      emissive: 0x55ddff, emissiveIntensity: 0.85
    })
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(21, 2.6, 5), bridgeMat)
    bridge.position.set(40, 19, -30)
    scene.add(bridge)
    const billTex = makeCanvas(64, (ctx) => {
      ctx.fillStyle = '#120a20'
      ctx.fillRect(0, 0, 64, 48)
      ctx.fillStyle = '#ff2d95'
      ctx.fillRect(0, 8, 64, 10)
      ctx.fillStyle = '#2dffd5'
      ctx.fillRect(0, 26, 40, 10)
      ctx.fillStyle = '#ffe14a'
      ctx.fillRect(50, 26, 14, 10)
    })
    texAssets.push(billTex)
    const bill = new THREE.Mesh(new THREE.PlaneGeometry(10, 7.5), new THREE.MeshBasicMaterial({
      map: billTex
    }))
    bill.position.set(35, 26, -24.6)
    scene.add(bill)
    const bill2 = new THREE.Mesh(new THREE.PlaneGeometry(10, 7.5), new THREE.MeshBasicMaterial({
      map: billTex
    }))
    bill2.position.set(55, 22, -24.6)
    scene.add(bill2)
    const signMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, emissive: 0x2dffd5, emissiveIntensity: 1.7 })
    const sign = new THREE.Mesh(new THREE.BoxGeometry(21.5, 0.4, 0.4), signMat)
    sign.position.set(40, 19.9, -30)
    scene.add(sign)
  }

  function createPyramid() {
    const tex = makeCanvas(64, (ctx) => {
      ctx.fillStyle = '#0c1c26'
      ctx.fillRect(0, 0, 64, 64)
      // full-surface checkerboard: teal glass + glowing yellow cells
      ctx.fillStyle = '#2f9e9e'
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if ((r + c) % 2 === 0) ctx.fillRect(c * 8 + 1, r * 8 + 1, 6, 6)
        }
      }
      ctx.fillStyle = '#ffe14a'
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if ((r + c) % 2 === 1) ctx.fillRect(c * 8 + 1, r * 8 + 1, 6, 6)
        }
      }
    })
    texAssets.push(tex)
    const g = new THREE.Group()
    const py = new THREE.Mesh(
      new THREE.ConeGeometry(15, 13, 4),
      new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.0,
        color: 0xffffff, roughness: 0.4, metalness: 0.3
      })
    )
    py.rotation.y = Math.PI / 4
    py.position.y = 6.5
    py.castShadow = true
    g.add(py)
    const cap = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.8),
      new THREE.MeshBasicMaterial({ color: 0xffe8a8 })
    )
    cap.position.y = 13.4
    g.add(cap)
    const base = new THREE.Mesh(new THREE.BoxGeometry(21, 0.8, 21), new THREE.MeshStandardMaterial({
      color: 0x4a5262, roughness: 0.5, metalness: 0.5, emissive: 0x222a38, emissiveIntensity: 0.35
    }))
    base.position.y = 0.4
    g.add(base)
    g.position.set(-40, 0, -40)
    scene.add(g)
  }

  function createRadioTower() {
    const g = new THREE.Group()
    const steelTex = toTex(makeSteelCanvas())
    texAssets.push(steelTex)
    const metal = new THREE.MeshStandardMaterial({
      map: steelTex, bumpMap: steelTex, bumpScale: 0.05,
      emissiveMap: steelTex, emissive: 0xffffff, emissiveIntensity: 0.35,
      color: 0xffffff, roughness: 0.45, metalness: 0.5, vertexColors: true
    })
    const shackMat = new THREE.MeshStandardMaterial({ color: 0x4a5262, roughness: 0.5, metalness: 0.5, emissive: 0x222a38, emissiveIntensity: 0.3 })
    const parts = []
    const tintSteel = (geo, v) => {
      const n = geo.attributes.position.count
      const col = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        col[i * 3] = v
        col[i * 3 + 1] = v
        col[i * 3 + 2] = v
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      return geo
    }
    const strut = (a, b, r, v = 0.85 + Math.random() * 0.2) => {
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const len = a.distanceTo(b)
      const cyl = new THREE.CylinderGeometry(r, r, len, 4)
      cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
      cyl.translate(mid.x, mid.y, mid.z)
      return tintSteel(cyl, v)
    }
    const H = 20
    const baseHalf = 1.8
    const topHalf = 0.3
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
    // tapered lattice legs
    for (const [sx, sz] of corners) {
      const a = new THREE.Vector3(sx * baseHalf, 0, sz * baseHalf)
      const b = new THREE.Vector3(sx * topHalf, H, sz * topHalf)
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const len = a.distanceTo(b)
      const leg = new THREE.CylinderGeometry(0.045, 0.095, len, 5)
      leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
      leg.translate(mid.x, mid.y, mid.z)
      parts.push(tintSteel(leg, 1.0))
    }
    // lattice levels: horizontal rings + X diagonals
    const LEVELS = 8
    const halfAt = (t) => baseHalf + (topHalf - baseHalf) * t
    for (let l = 1; l <= LEVELS; l++) {
      const t = l / LEVELS
      const tp = (l - 1) / LEVELS
      const h = t * H
      const hp = tp * H
      const hh = halfAt(t)
      const hhp = halfAt(tp)
      const pts = corners.map(([sx, sz]) => new THREE.Vector3(sx * hh, h, sz * hh))
      const ptsP = corners.map(([sx, sz]) => new THREE.Vector3(sx * hhp, hp, sz * hhp))
      for (let i = 0; i < 4; i++) parts.push(strut(pts[i], pts[(i + 1) % 4], 0.045))
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4
        parts.push(strut(ptsP[i], pts[j], 0.035))
        parts.push(strut(ptsP[j], pts[i], 0.035))
      }
    }
    // cross platforms
    for (const y of [6, 12, 17]) {
      const hh = halfAt(y / H)
      const c1 = new THREE.BoxGeometry(hh * 2.4, 0.14, 0.14)
      c1.translate(0, y, 0)
      const c2 = new THREE.BoxGeometry(0.14, 0.14, hh * 2.4)
      c2.translate(0, y, 0)
      parts.push(tintSteel(c1, 0.95), tintSteel(c2, 0.95))
    }
    // antenna mast
    const ant = new THREE.CylinderGeometry(0.05, 0.06, 6, 5)
    ant.translate(0, H + 3, 0)
    parts.push(tintSteel(ant, 1.0))
    // guy wires from 2/3 height to ground anchors
    for (const [sx, sz] of corners) {
      parts.push(strut(
        new THREE.Vector3(sx * topHalf, H * 0.72, sz * topHalf),
        new THREE.Vector3(sx * 6.5, 0, sz * 6.5),
        0.02,
        0.6
      ))
    }
    const lattice = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(parts, false), metal)
    lattice.castShadow = true
    g.add(lattice)
    // concrete pad + equipment shack
    const pad = new THREE.Mesh(new THREE.BoxGeometry(5, 0.7, 5), shackMat)
    pad.position.y = 0.35
    g.add(pad)
    const shack = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 1.3), shackMat)
    shack.position.set(2.6, 0.75, 1.2)
    g.add(shack)
    // red beacons (top + mid)
    const blinkMat = new THREE.MeshStandardMaterial({ color: 0x3a0a0a, emissive: 0xff2211, emissiveIntensity: 1 })
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), blinkMat)
    blink.position.y = H + 6
    g.add(blink)
    const blink2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), blinkMat)
    blink2.position.y = H * 0.55
    g.add(blink2)
    g.position.set(-30, 0, 50)
    scene.add(g)
  }

  function createFountain() {
    const g = new THREE.Group()
    const stone = new THREE.MeshStandardMaterial({ color: 0x565a68, roughness: 0.7, metalness: 0.2, emissive: 0x222a38, emissiveIntensity: 0.3 })
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 0.5, 24), stone)
    pool.position.y = 0.25
    g.add(pool)
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(6.6, 6.6, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0x0e3a4e, emissive: 0x33ddff, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 })
    )
    disc.position.y = 0.52
    g.add(disc)
    const jetMat = new THREE.MeshStandardMaterial({
      color: 0x9fe8ff, emissive: 0x66ccff, emissiveIntensity: 1.5,
      transparent: true, opacity: 0.85
    })
    const jets = []
    const center = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 3, 8), jetMat)
    center.position.y = 2
    g.add(center)
    jets.push({ mesh: center, phase: 0.3, baseY: 0.5, height: 3 })
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.3, 6), jetMat)
      jet.position.set(Math.cos(a) * 4.8, 1.1, Math.sin(a) * 4.8)
      g.add(jet)
      jets.push({ mesh: jet, phase: i * 0.8, baseY: 0.45, height: 1.3 })
    }
    fountain = { group: g, jets, disc }
    g.position.set(0, 0, 0)
    scene.add(g)
  }

  // ---------- cars ----------

  function createCars() {
    const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 })
    const sedanColors = [0xff4444, 0x4488ff, 0xeeeeee, 0x44dd88, 0xff88aa, 0x22cccc, 0xffb03a, 0x6a5acd, 0xffffff, 0xff6a4a]
    const busColors = [0x2a7fdd, 0xd97b29, 0x8a3ab0, 0x2a9d8f]
    const models = []
    for (let i = 0; i < 24; i++) {
      const k = i % 6
      if (k === 0) models.push(makeSedan(sedanColors[i % sedanColors.length], wheelGeo, wheelMat))
      else if (k === 1) models.push(makeTaxi(wheelGeo, wheelMat))
      else if (k === 2) models.push(makeBus(busColors[i % 4], wheelGeo, wheelMat))
      else if (k === 3) models.push(makeTruck(wheelGeo, wheelMat))
      else if (k === 4) models.push(makeSedan(sedanColors[(i + 3) % sedanColors.length], wheelGeo, wheelMat))
      else models.push(makeBus(busColors[(i + 1) % 4], wheelGeo, wheelMat))
    }
    const vertical = [20, -20, 60, -60]
    const horizontal = [20, -20]
    const lane = 1.6
    let idx = 0
    for (const rx of vertical) {
      for (const [ln, dir] of [[lane, 1], [-lane, -1]]) {
        for (let c2 = 0; c2 < 2 && idx < models.length; c2++) {
          const car = models[idx++]
          const sp = 6 + Math.random() * 5
          const z1 = Math.random() * 140 - 70
          const z2 = z1 + 20 > 80 ? z1 - 140 : z1 + 20
          car.group.position.set(rx + ln, 0, c2 === 0 ? z1 : z2)
          car.group.rotation.y = dir > 0 ? 0 : Math.PI
          scene.add(car.group)
          cars.push({ ...car, roadAxis: 'z', pos: rx + ln, dir, speed: sp, curSpeed: sp, waiting: false })
        }
      }
    }
    for (const rz of horizontal) {
      for (const [ln, dir] of [[lane, 1], [-lane, -1]]) {
        for (let c2 = 0; c2 < 2 && idx < models.length; c2++) {
          const car = models[idx++]
          const sp = 6 + Math.random() * 5
          const x1 = Math.random() * 140 - 70
          const x2 = x1 + 20 > 80 ? x1 - 140 : x1 + 20
          car.group.position.set(c2 === 0 ? x1 : x2, 0, rz + ln)
          car.group.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
          scene.add(car.group)
          cars.push({ ...car, roadAxis: 'x', pos: rz + ln, dir, speed: sp, curSpeed: sp, waiting: false })
        }
      }
    }
    cars.forEach((c, i) => { c.id = i })
  }

  function carState(car) {
    const myVar = car.group.position[car.roadAxis === 'z' ? 'z' : 'x']
    for (const other of cars) {
      if (other === car) continue
      const otherVar = other.group.position[other.roadAxis === 'z' ? 'z' : 'x']
      if (other.roadAxis === car.roadAxis) {
        // same lane, same direction: car following
        if (other.pos !== car.pos || other.dir !== car.dir) continue
        if ((otherVar - myVar) * car.dir <= 0) continue
        const gap = Math.abs(otherVar - myVar)
        if (gap < 4.5) return { waiting: true, follow: 0 }
        if (gap < 7) return { waiting: false, follow: other.curSpeed }
        continue
      }
      // perpendicular: crossing point P = (fixed of other, fixed of car)
      const otherDist = Math.abs(otherVar - car.pos)
      if (otherDist > 2.6) continue
      if ((otherVar - car.pos) * other.dir > 0) continue // other already past P
      const myDist = Math.abs(myVar - other.pos)
      if (myDist > 3.2) continue
      if ((myVar - other.pos) * car.dir > 0) continue // car already past P
      if (otherDist < myDist - 0.3 || (Math.abs(otherDist - myDist) < 0.3 && other.id > car.id)) {
        return { waiting: true, follow: 0 }
      }
    }
    return { waiting: false, follow: null }
  }

  function updateCars(delta) {
    for (const car of cars) {
      const st = carState(car)
      car.waiting = st.waiting
      car.follow = st.follow
    }
    for (const car of cars) {
      let target
      if (car.waiting) target = 0
      else if (car.follow !== null) target = car.follow
      else target = car.speed
      car.curSpeed += (target - car.curSpeed) * 0.15
      const move = car.dir * car.curSpeed * delta
      if (car.roadAxis === 'z') {
        car.group.position.z += move
        if (car.group.position.z > 80) car.group.position.z = -80
        if (car.group.position.z < -80) car.group.position.z = 80
      } else {
        car.group.position.x += move
        if (car.group.position.x > 80) car.group.position.x = -80
        if (car.group.position.x < -80) car.group.position.x = 80
      }
      car.group.position.y = Math.sin(performance.now() * 0.012 + car.pos) * 0.02
      const spin = (car.curSpeed / 0.22) * delta * car.dir
      for (const w of car.wheels) w.rotation.z += spin
    }
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
