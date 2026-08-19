import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

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

function makeBear() {
  const g = new THREE.Group()
  const fur = new THREE.MeshStandardMaterial({ color: 0xf5f3ee, roughness: 0.9 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.7 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.9), fur)
  body.position.y = 0.85
  g.add(body)
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), fur)
  chest.scale.set(1.2, 1.1, 1.1)
  chest.position.set(0.55, 0.7, 0)
  g.add(chest)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), fur)
  head.scale.set(1.05, 0.95, 0.9)
  head.position.set(0.95, 1.25, 0)
  g.add(head)
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), fur)
  snout.position.set(1.3, 1.15, 0)
  g.add(snout)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), dark)
  nose.position.set(1.45, 1.18, 0)
  g.add(nose)
  const eyeGeo = new THREE.SphereGeometry(0.05, 6, 4)
  const eyeL = new THREE.Mesh(eyeGeo, dark)
  eyeL.position.set(1.15, 1.38, 0.24)
  const eyeR = eyeL.clone()
  eyeR.position.z = -0.24
  g.add(eyeL, eyeR)
  const earGeo = new THREE.SphereGeometry(0.11, 6, 4)
  const earL = new THREE.Mesh(earGeo, fur)
  earL.position.set(0.75, 1.62, 0.26)
  const earR = earL.clone()
  earR.position.z = -0.26
  g.add(earL, earR)
  const legs = []
  const legGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.6, 6)
  for (const [sx, sz] of [[0.55, 0.32], [0.55, -0.32], [-0.55, 0.32], [-0.55, -0.32]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx, 0.6, sz)
    const leg = new THREE.Mesh(legGeo, fur)
    leg.position.y = -0.3
    pivot.add(leg)
    g.add(pivot)
    legs.push(pivot)
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), fur)
  tail.position.set(-0.8, 0.85, 0)
  g.add(tail)
  g.traverse((c) => { if (c.isMesh) c.castShadow = true })
  return { group: g, legs }
}

function makeFox() {
  const g = new THREE.Group()
  const fur = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.85 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a5248, roughness: 0.8 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), fur)
  body.scale.set(1.2, 0.85, 0.95)
  body.position.y = 0.45
  g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), fur)
  head.scale.set(1.1, 0.9, 0.95)
  head.position.set(0.42, 0.6, 0)
  g.add(head)
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), fur)
  snout.rotation.z = -Math.PI / 2
  snout.position.set(0.66, 0.56, 0)
  g.add(snout)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), dark)
  nose.position.set(0.75, 0.56, 0)
  g.add(nose)
  const eyeGeo = new THREE.SphereGeometry(0.03, 6, 4)
  const eyeL = new THREE.Mesh(eyeGeo, dark)
  eyeL.position.set(0.5, 0.66, 0.13)
  const eyeR = eyeL.clone()
  eyeR.position.z = -0.13
  g.add(eyeL, eyeR)
  const earGeo = new THREE.ConeGeometry(0.07, 0.16, 5)
  const earL = new THREE.Mesh(earGeo, dark)
  earL.position.set(0.38, 0.78, 0.12)
  const earR = earL.clone()
  earR.position.z = -0.12
  g.add(earL, earR)
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.5, 6), fur)
  tail.rotation.z = Math.PI / 2 + 0.5
  tail.position.set(-0.5, 0.5, 0)
  g.add(tail)
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), dark)
  tailTip.position.set(-0.72, 0.42, 0)
  g.add(tailTip)
  const legs = []
  const legGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.3, 5)
  for (const [sx, sz] of [[0.2, 0.14], [0.2, -0.14], [-0.2, 0.14], [-0.2, -0.14]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx, 0.32, sz)
    const leg = new THREE.Mesh(legGeo, fur)
    leg.position.y = -0.15
    pivot.add(leg)
    g.add(pivot)
    legs.push(pivot)
  }
  g.traverse((c) => { if (c.isMesh) c.castShadow = true })
  return { group: g, legs, tail }
}

function makeReindeer(withAntlers) {
  const g = new THREE.Group()
  const fur = new THREE.MeshStandardMaterial({ color: 0x6a5140, roughness: 0.9 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e1f14, roughness: 0.8 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.55), fur)
  body.position.y = 1.05
  g.add(body)
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, 0.3), fur)
  neck.position.set(0.55, 1.45, 0)
  neck.rotation.z = -0.25
  g.add(neck)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.28), fur)
  head.position.set(0.75, 1.75, 0)
  g.add(head)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), dark)
  nose.position.set(0.98, 1.72, 0)
  g.add(nose)
  const earGeo = new THREE.ConeGeometry(0.07, 0.15, 5)
  const earL = new THREE.Mesh(earGeo, fur)
  earL.position.set(0.62, 1.95, 0.16)
  earL.rotation.z = -0.6
  const earR = earL.clone()
  earR.position.z = -0.16
  earR.rotation.z = 0.6
  g.add(earL, earR)
  if (withAntlers) {
    const antlerMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.8 })
    const antlerGeo = new THREE.CylinderGeometry(0.02, 0.035, 0.7, 5)
    for (const side of [1, -1]) {
      const branch = new THREE.Group()
      branch.position.set(0.68, 1.92, side * 0.1)
      branch.rotation.z = -0.2
      branch.rotation.x = side * 0.25
      const main = new THREE.Mesh(antlerGeo, antlerMat)
      main.position.y = 0.35
      branch.add(main)
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.35, 5), antlerMat)
      tine.position.set(0.12, 0.42, 0)
      tine.rotation.z = -0.9
      branch.add(tine)
      g.add(branch)
    }
  }
  const legs = []
  const legGeo = new THREE.CylinderGeometry(0.06, 0.075, 0.85, 5)
  for (const [sx, sz] of [[0.42, 0.19], [0.42, -0.19], [-0.42, 0.19], [-0.42, -0.19]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx, 0.85, sz)
    const leg = new THREE.Mesh(legGeo, fur)
    leg.position.y = -0.42
    pivot.add(leg)
    g.add(pivot)
    legs.push(pivot)
  }
  g.traverse((c) => { if (c.isMesh) c.castShadow = true })
  return { group: g, legs }
}

// ---------- scene ----------

export function useArcticScene(containerRef) {
  let renderer, scene, camera, orbit, frame
  let disposed = false
  const autoRotate = ref(true)
  const texAssets = []

  let icebergs = []
  let packIce = []
  let auroraGroup = null
  let snowPts = null
  let waterMat = null

  // animals (all built facing +X)
  const bear = { pos: new THREE.Vector3(), state: 'idle', idle: 3, target: new THREE.Vector3() }
  const foxes = []
  const reindeer = []

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

    // ---- moon + stars ----
    const moonTex = makeRadialTexture(128, [
      [0, 'rgba(255,255,255,1)'],
      [0.55, 'rgba(220,232,255,0.9)'],
      [0.7, 'rgba(180,200,240,0.25)'],
      [1, 'rgba(160,180,230,0)']
    ])
    texAssets.push(moonTex)
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTex, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }))
    moon.position.copy(moonDir).multiplyScalar(480)
    moon.scale.setScalar(34)
    scene.add(moon)
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

    // ---- terrain ----
    {
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
        vertexColors: true, roughness: 0.9, metalness: 0.02
      }))
      terrain.receiveShadow = true
      scene.add(terrain)
    }

    // ---- glacial water ----
    waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x0a2233) },
        uMoonDir: { value: moonDir }
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

    // ---- icebergs ----
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
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xbfe4f5, roughness: 0.18, metalness: 0,
        transparent: true, opacity: 0.85,
        clearcoat: 0.6, clearcoatRoughness: 0.3,
        emissive: 0x1a4a6a, emissiveIntensity: 0.25,
        flatShading: true
      })
      const ice = new THREE.Mesh(geo, mat)
      ice.position.set(x, WATER_Y + size * 0.28, z)
      ice.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4)
      ice.castShadow = true
      scene.add(ice)
      icebergs.push({
        mesh: ice,
        baseY: ice.position.y,
        phase: Math.random() * Math.PI * 2,
        bobAmp: 0.15 + Math.random() * 0.25,
        rotSp: (Math.random() - 0.5) * 0.06
      })
    }

    // ---- pack ice near shore ----
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(0.62 + Math.random() * 0.3)
      const x = Math.cos(a) * LG_RX * r
      const z = Math.sin(a) * LG_RZ * r
      const size = 2.5 + Math.random() * 4
      const geo = new THREE.CylinderGeometry(size * 0.9, size, 0.4, 7)
      const ice = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0xeef6fc, roughness: 0.5, flatShading: true
      }))
      ice.position.set(x, WATER_Y + 0.05, z)
      ice.rotation.y = Math.random() * Math.PI
      scene.add(ice)
      packIce.push({ mesh: ice, phase: Math.random() * Math.PI * 2 })
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
            const k = (ui * (segV + 1) + vi)
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

    // ---- snowy pines ----
    {
      const count = 240
      const dummy = new THREE.Object3D()
      const trunkGeo = new THREE.CylinderGeometry(0.1, 0.18, 1.2, 5)
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.9 })
      const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, count)
      const treeGeo = new THREE.ConeGeometry(1.2, 2.6, 6)
      const treeMat = new THREE.MeshStandardMaterial({ color: 0x1e3a30, roughness: 0.85, flatShading: true })
      const tree = new THREE.InstancedMesh(treeGeo, treeMat, count)
      const capGeo = new THREE.ConeGeometry(1.05, 1.1, 6)
      const capMat = new THREE.MeshStandardMaterial({ color: 0xeef4fa, roughness: 0.9, flatShading: true })
      const cap = new THREE.InstancedMesh(capGeo, capMat, count)
      trunk.castShadow = tree.castShadow = cap.castShadow = true
      let placed = 0
      let attempts = 0
      while (placed < count && attempts < count * 10) {
        attempts++
        const x = (Math.random() - 0.5) * 170
        const z = (Math.random() - 0.5) * 170
        const h = getHeight(x, z)
        if (inLagoon(x, z, 4)) continue
        if (h < 1.0 || h > 10) continue
        const s = 0.5 + Math.random() * 0.8
        dummy.position.set(x, h + s * 0.6, z)
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
        dummy.scale.set(s * 0.5, s, s * 0.5)
        dummy.updateMatrix()
        trunk.setMatrixAt(placed, dummy.matrix)
        dummy.position.set(x, h + s * 2.5, z)
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()
        tree.setMatrixAt(placed, dummy.matrix)
        dummy.position.set(x, h + s * 3.6, z)
        dummy.scale.set(s * 0.9, s * 0.5, s * 0.9)
        dummy.updateMatrix()
        cap.setMatrixAt(placed, dummy.matrix)
        placed++
      }
      trunk.count = placed
      tree.count = placed
      cap.count = placed
      trunk.instanceMatrix.needsUpdate = true
      tree.instanceMatrix.needsUpdate = true
      cap.instanceMatrix.needsUpdate = true
      scene.add(trunk, tree, cap)
    }

    // ---- rocks ----
    {
      const dummy = new THREE.Object3D()
      const rocks = new THREE.InstancedMesh(
        new THREE.DodecahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ color: 0x55606c, roughness: 0.95, flatShading: true }),
        45
      )
      let placed = 0
      let attempts = 0
      while (placed < 45 && attempts < 400) {
        attempts++
        const x = (Math.random() - 0.5) * 140
        const z = (Math.random() - 0.5) * 140
        const h = getHeight(x, z)
        if (inLagoon(x, z, 3) || h < 0.4) continue
        dummy.position.set(x, h + 0.1, z)
        dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random())
        dummy.scale.set(0.5 + Math.random() * 1.3, 0.4 + Math.random() * 0.9, 0.5 + Math.random() * 1.3)
        dummy.updateMatrix()
        rocks.setMatrixAt(placed, dummy.matrix)
        placed++
      }
      rocks.count = placed
      rocks.instanceMatrix.needsUpdate = true
      rocks.castShadow = true
      scene.add(rocks)
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
      const placed = []
      const spawn = (xMax, minDist) => {
        const p = findDrySpot(placed, xMax, minDist)
        placed.push(p)
        return p
      }
      const nearDry = (bx, bz, dMin, dMax) => {
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

      // polar bear (1)
      const p1 = spawn(60, 0)
      const b = makeBear()
      b.group.scale.setScalar(1.5)
      b.group.position.set(p1.x, p1.h, p1.z)
      scene.add(b.group)
      bear.group = b.group
      bear.legs = b.legs
      bear.pos.set(p1.x, p1.h, p1.z)

      // arctic foxes (3)
      const foxSpots = [spawn(50, 12), spawn(52, 14), spawn(54, 16)]
      for (const p of foxSpots) {
        const f = makeFox()
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

      // reindeer herd (4: 2 antlered adults, 2 calves)
      const p5 = spawn(62, 16)
      const herdSpots = [p5, nearDry(p5.x, p5.z, 3, 6), nearDry(p5.x, p5.z, 4, 7), nearDry(p5.x, p5.z, 2, 6)].filter(Boolean)
      for (const p of herdSpots) {
        const adult = herdSpots.indexOf(p) < 2
        const r = makeReindeer(adult)
        r.group.scale.setScalar(adult ? (herdSpots.indexOf(p) === 0 ? 1.1 : 1.0) : 0.6)
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
        ib.mesh.position.y = ib.baseY + Math.sin(elapsed * 0.35 + ib.phase) * ib.bobAmp
        ib.mesh.rotation.y += delta * ib.rotSp
      }
      for (const p of packIce) {
        p.mesh.position.y = WATER_Y + 0.05 + Math.sin(elapsed * 0.3 + p.phase) * 0.06
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
      // polar bear
      if (bear.state === 'idle') {
        bear.idle -= delta
        bear.legs.forEach((leg) => { leg.rotation.x *= 0.9 })
        bear.group.position.y = bear.pos.y + Math.sin(elapsed * 1.1) * 0.015
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
          walkLegs(bear.legs, elapsed * 2.2)
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
