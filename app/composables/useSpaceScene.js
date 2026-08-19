import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const PLANET_POS = new THREE.Vector3(-8, 0, -6)
const PLANET_R = 26
const BELT_TILT = 0.31
const STAR_POS = new THREE.Vector3(144, 30, -241)
const SUN_DIR = new THREE.Vector3(0.75, 0.35, 0.555).normalize()

// ---------- texture helpers ----------

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

function makeDropship() {
  const g = new THREE.Group()
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5, metalness: 0.4 })
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.55, metalness: 0.3 })
  const redMat = new THREE.MeshStandardMaterial({ color: 0xa52a2a, roughness: 0.5, metalness: 0.35 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x39424c, roughness: 0.6, metalness: 0.4 })

  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 3.0), hullMat)
  g.add(hull)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.7), whiteMat)
  nose.position.set(0, 0, 1.8)
  g.add(nose)
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.28, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x88ccee, roughness: 0.25, metalness: 0.4, emissive: 0x2a5a6a, emissiveIntensity: 0.7 })
  )
  canopy.position.set(0, 0.44, 1.5)
  g.add(canopy)
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.09, 1.15), hullMat)
  wing.position.set(0, 0.02, 0.15)
  g.add(wing)
  const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.11, 1.15), redMat)
  tipL.position.set(-1.75, 0.02, 0.15)
  const tipR = tipL.clone()
  tipR.position.x = 1.75
  g.add(tipL, tipR)

  const engineMat = new THREE.MeshStandardMaterial({
    color: 0x223038,
    emissive: 0x66eaff,
    emissiveIntensity: 1.2,
    roughness: 0.4
  })
  for (const sx of [-1.05, 1.05]) {
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 1.4), whiteMat)
    nacelle.position.set(sx, 0, -0.9)
    g.add(nacelle)
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.25, 10), darkMat)
    nozzle.rotation.x = Math.PI / 2
    nozzle.position.set(sx, 0, -1.6)
    g.add(nozzle)
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), engineMat)
    glow.rotation.x = Math.PI / 2
    glow.position.set(sx, 0, -1.73)
    g.add(glow)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.7), hullMat)
    fin.position.set(sx * 1.05, 0.4, -1.3)
    g.add(fin)
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.12, 0.45), redMat)
  stripe.position.set(0, 0.28, -0.6)
  g.add(stripe)

  g.scale.setScalar(2.2)
  return { group: g, engineMat }
}

// ---------- teran outpost ----------

function buildOutpost() {
  const g = new THREE.Group()
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x8b95a3, roughness: 0.45, metalness: 0.5 })
  const steelLight = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.5, metalness: 0.4 })
  const redMat = new THREE.MeshStandardMaterial({ color: 0xa52a2a, roughness: 0.5, metalness: 0.4 })

  const core = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.0, 0.6, 6), steelMat)
  g.add(core)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 2.6), steelLight)
  deck.position.set(-0.8, 0.75, 0)
  g.add(deck)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.44, 0.25, 2.64), redMat)
  stripe.position.set(-0.8, 0.45, 0)
  g.add(stripe)
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.4), steelMat)
  tower.position.set(1.4, 1.9, 0.6)
  g.add(tower)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6), steelLight)
  mast.position.set(1.4, 3.5, 0.6)
  g.add(mast)
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.35, 8), steelLight)
  dish.position.set(1.4, 4.3, 0.6)
  dish.rotation.x = 0.55
  g.add(dish)
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), steelLight)
  antenna.position.set(-2.4, 1.5, -0.8)
  g.add(antenna)

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
    { pos: [4.6, 0.4, 0], color: 0xff5544 },
    { pos: [-4.6, 0.4, 0], color: 0xffffff },
    { pos: [0, 0.4, 4.6], color: 0xffffff },
    { pos: [1.4, 5.0, 0.6], color: 0xff5544 }
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
  return { group: g, ringPivot, blinkers }
}

// ---------- scene ----------

export function useSpaceScene(containerRef) {
  let renderer, scene, camera, orbit, frame
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

    // lights (sun is a faint distant star)
    scene.add(new THREE.AmbientLight(0x1c2a3a, 0.8))
    const sunLight = new THREE.DirectionalLight(0xffeedd, 1.25)
    sunLight.position.copy(SUN_DIR).multiplyScalar(100)
    scene.add(sunLight)

    // textures
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

    // ---- asteroid belt (450 instanced, tilted ring) ----
    const beltGeos = [makeRockGeometry(1.7), makeRockGeometry(5.3), makeRockGeometry(9.1)]
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.15 })
    const beltGroup = new THREE.Group()
    beltGroup.position.copy(PLANET_POS)
    beltGroup.rotation.x = BELT_TILT
    scene.add(beltGroup)
    const beltMeshes = []
    const beltData = []
    const beltTiltQuat = beltGroup.quaternion.clone()
    for (let g = 0; g < 3; g++) {
      const im = new THREE.InstancedMesh(beltGeos[g], rockMat, 150)
      for (let j = 0; j < 150; j++) {
        const radius = 34 + Math.pow(Math.random(), 1.4) * 16
        const d = {
          angle: Math.random() * Math.PI * 2,
          radius,
          yOff: -4 + Math.random() * 8,
          speed: 0.05 * Math.pow(40 / radius, 1.5),
          rotX: Math.random() * Math.PI,
          rotY: Math.random() * Math.PI,
          rotSp: { x: 0.1 + Math.random() * 0.5, y: 0.1 + Math.random() * 0.5 },
          scale: {
            x: 0.4 + Math.random() * 1.8,
            y: 0.4 + Math.random() * 1.8,
            z: 0.4 + Math.random() * 1.8
          }
        }
        beltData.push(d)
        const sh = 0.55 + Math.random() * 0.45
        im.setColorAt(j, new THREE.Color(0x6b5a4a).lerp(new THREE.Color(0x93826f), Math.random()).multiplyScalar(sh))
      }
      im.instanceColor.needsUpdate = true
      beltMeshes.push(im)
      beltGroup.add(im)
    }
    const beltDummy = new THREE.Object3D()
    function beltRockWorld(elapsed, idx, out) {
      const d = beltData[idx]
      const a = d.angle + elapsed * d.speed
      out.set(Math.cos(a) * d.radius, d.yOff, Math.sin(a) * d.radius)
      out.applyQuaternion(beltTiltQuat)
      out.add(PLANET_POS)
      return out
    }
    function updateBelt(elapsed) {
      let j = 0
      for (const im of beltMeshes) {
        for (let k = 0; k < 150; k++) {
          const d = beltData[j++]
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
    const outpost = buildOutpost()
    scene.add(outpost.group)
    function updateOutpost(elapsed) {
      outpost.group.position.set(
        55 + Math.sin(elapsed * 0.017) * 4,
        10 + Math.sin(elapsed * 0.023) * 2,
        -50 + Math.cos(elapsed * 0.017) * 4
      )
      outpost.group.rotation.y = Math.sin(elapsed * 0.01) * 0.4
      outpost.ringPivot.rotation.y += 0.05 * CLOCK_DELTA
      for (let i = 0; i < outpost.blinkers.length; i++) {
        outpost.blinkers[i].emissiveIntensity = 0.4 + 1.8 * Math.pow(Math.max(0, Math.sin(elapsed * 2 + i * 1.7)), 3)
      }
    }

    // ---- dropship squadron ----
    const ships = []
    for (let i = 0; i < 5; i++) {
      const { group, engineMat } = makeDropship()
      scene.add(group)
      ships.push({ group, engineMat, fwd: new THREE.Vector3(0, 0, 1) })
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
