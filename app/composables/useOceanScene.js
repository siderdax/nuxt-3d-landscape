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

// ---------- animals ----------

function makeTurtle() {
  const g = new THREE.Group()
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x3f7a55, roughness: 0.8, flatShading: true })
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x6a9a6a, roughness: 0.85 })
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), shellMat)
  shell.scale.set(1.1, 0.55, 1.3)
  g.add(shell)
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.5, 10), skinMat)
  belly.scale.set(1.05, 0.35, 1.25)
  g.add(belly)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), skinMat)
  head.position.set(0, 0.05, 1.25)
  g.add(head)
  const flipperMats = []
  const flipperGeo = new THREE.SphereGeometry(0.5, 8, 6)
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx * 0.75, -0.1, sz * 0.35)
    const flipper = new THREE.Mesh(flipperGeo, skinMat)
    flipper.scale.set(0.16, 0.4, 0.95)
    flipper.position.set(sx * 0.45, 0, 0)
    pivot.add(flipper)
    g.add(pivot)
    flipperMats.push({ pivot, front: sz > 0, sign: sx })
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5), skinMat)
  tail.rotation.x = -Math.PI / 2
  tail.position.set(0, -0.05, -1.35)
  g.add(tail)
  g.scale.setScalar(1.3)
  return { group: g, flippers: flipperMats }
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
        const a = i * 1.9 + 0.5
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

    // ---- lighthouse ----
    {
      const g = new THREE.Group()
      const white = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.6 })
      const red = new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.55 })
      const dark = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, metalness: 0.3 })
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 0.6, 10), dark)
      base.position.y = 0.3
      g.add(base)
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.88, 3.4, 12), white)
      tower.position.y = 2.3
      g.add(tower)
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.55, 12), red)
      band.position.y = 1.7
      g.add(band)
      const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.66, 0.18, 12), dark)
      gallery.position.y = 4.15
      g.add(gallery)
      const lantern = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.46, 10),
        new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc86a, emissiveIntensity: 1.8 })
      )
      lantern.position.y = 4.45
      g.add(lantern)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 10), red)
      roof.position.y = 4.95
      g.add(roof)
      for (const m of [base, tower, band, gallery, roof]) {
        m.castShadow = true
      }
      beamGroup = new THREE.Group()
      beamGroup.position.y = 4.45
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
      lampLight = new THREE.PointLight(0xffd9a0, 120, 70, 2)
      lampLight.position.y = 4.45
      g.add(lampLight)
      g.position.set(2, islandTopY(2.83), -2)
      scene.add(g)
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
      turtle = t
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

      // turtle
      if (turtle) {
        const ta = t * 0.08
        turtle.group.position.set(
          Math.cos(ta) * 24, -2.0 + Math.sin(t * 0.4) * 0.3, Math.sin(ta) * 24
        )
        _n.set(-Math.sin(ta), 0, Math.cos(ta))
        _q.setFromUnitVectors(Z_AXIS, _n)
        turtle.group.quaternion.copy(_q)
        turtle.group.rotateZ(0.12)
        for (const f of turtle.flippers) {
          f.pivot.rotation.x = Math.sin(t * 2.2 + (f.sign > 0 ? 0 : Math.PI)) * 0.4 * (f.front ? 1 : 0.5)
        }
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
