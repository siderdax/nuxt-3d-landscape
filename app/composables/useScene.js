import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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

export function useScene(containerRef) {
  let scene, camera, renderer, controls, animationId
  let cloudGroups = []
  let treeTrunkMesh, treeTopMesh, treeTop2Mesh
  let treeTopOrigMatrices = []
  let treeTop2OrigMatrices = []
  let treePhases = []
  let deciduous = null
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

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
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
    const dummy = new THREE.Object3D()

    // Trunk geometry + material
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 2, 6)
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
    })
    treeTrunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count)
    treeTrunkMesh.castShadow = true
    treeTrunkMesh.receiveShadow = true

    // Canopy (cone layers)
    const topGeo = new THREE.ConeGeometry(1.8, 4, 7)
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a1e,
      roughness: 0.8,
      flatShading: true,
    })
    treeTopMesh = new THREE.InstancedMesh(topGeo, topMat, count)
    treeTopMesh.castShadow = true
    treeTopMesh.receiveShadow = true

    // Second canopy layer
    const top2Geo = new THREE.ConeGeometry(1.3, 3, 7)
    const top2Mat = new THREE.MeshStandardMaterial({
      color: 0x3a7a28,
      roughness: 0.8,
      flatShading: true,
    })
    treeTop2Mesh = new THREE.InstancedMesh(top2Geo, top2Mat, count)
    treeTop2Mesh.castShadow = true

    let placed = 0
    let attempts = 0

    while (placed < count && attempts < count * 10) {
      attempts++
      const x = (Math.random() - 0.5) * 170
      const z = (Math.random() - 0.5) * 170
      const h = getHeight(x, z)

      // Only place above the waterline
      if (h < 0.3 || h > 16) continue

      // Random scale and rotation
      const scale = 0.7 + Math.random() * 0.8
      const rotation = Math.random() * Math.PI * 2

      // Trunk
      dummy.position.set(x, h + scale, z)
      dummy.rotation.set(0, rotation, 0)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      treeTrunkMesh.setMatrixAt(placed, dummy.matrix)

      // Top layer 1
      dummy.position.set(x, h + scale * 3.5, z)
      dummy.updateMatrix()
      treeTopMesh.setMatrixAt(placed, dummy.matrix)

      // Top layer 2
      dummy.position.set(x, h + scale * 4.8, z)
      dummy.scale.set(scale * 0.8, scale * 0.7, scale * 0.8)
      dummy.rotation.y = rotation + Math.PI / 4
      dummy.updateMatrix()
      treeTop2Mesh.setMatrixAt(placed, dummy.matrix)

      // Color variation
      const greenVar = 0.7 + Math.random() * 0.6
      const trunkColor = new THREE.Color(0x5c4033).multiplyScalar(0.8 + Math.random() * 0.4)
      const topColor = new THREE.Color(0x2d5a1e).multiplyScalar(greenVar)
      const top2Color = new THREE.Color(0x3a7a28).multiplyScalar(greenVar)

      treeTrunkMesh.setColorAt(placed, trunkColor)
      treeTopMesh.setColorAt(placed, topColor)
      treeTop2Mesh.setColorAt(placed, top2Color)

      treeSpots.push({ x, z, h })
      treePhases.push(Math.random() * Math.PI * 2)

      placed++
    }

    treeTrunkMesh.count = placed
    treeTrunkMesh.instanceMatrix.needsUpdate = true
    if (treeTrunkMesh.instanceColor) treeTrunkMesh.instanceColor.needsUpdate = true

    treeTopMesh.count = placed
    treeTopMesh.instanceMatrix.needsUpdate = true
    if (treeTopMesh.instanceColor) treeTopMesh.instanceColor.needsUpdate = true

    treeTop2Mesh.count = placed
    treeTop2Mesh.instanceMatrix.needsUpdate = true
    if (treeTop2Mesh.instanceColor) treeTop2Mesh.instanceColor.needsUpdate = true

    // Save original matrices for wind animation
    const tmpMatrix = new THREE.Matrix4()
    treeTopOrigMatrices = []
    treeTop2OrigMatrices = []
    for (let i = 0; i < placed; i++) {
      treeTopMesh.getMatrixAt(i, tmpMatrix)
      treeTopOrigMatrices.push(tmpMatrix.clone())
      treeTop2Mesh.getMatrixAt(i, tmpMatrix)
      treeTop2OrigMatrices.push(tmpMatrix.clone())
    }

    scene.add(treeTrunkMesh)
    scene.add(treeTopMesh)
    scene.add(treeTop2Mesh)
  }

  function createDeciduousTrees() {
    const count = 120

    const makeBlobGeo = (radius, detail, seed) => {
      const geo = new THREE.SphereGeometry(radius, detail, detail - 1)
      const pos = geo.attributes.position
      for (let j = 0; j < pos.count; j++) {
        const px = pos.getX(j)
        const py = pos.getY(j)
        const pz = pos.getZ(j)
        const n = noise.noise2D(px * 1.8 + seed, pz * 1.8 + seed * 2) * radius * 0.35
        pos.setX(j, px + n * 0.8)
        pos.setY(j, py * 0.82)
        pos.setZ(j, pz - n * 0.5)
      }
      geo.computeVertexNormals()
      return geo
    }

    const blobLayers = [
      { geo: makeBlobGeo(2.4, 8, 3), color: 0x4a8c2a, yOff: 4.1, scale: 1.0 },
      { geo: makeBlobGeo(1.7, 7, 11), color: 0x57a036, yOff: 5.5, scale: 0.9 },
      { geo: makeBlobGeo(1.2, 6, 23), color: 0x6ab04a, yOff: 6.4, scale: 0.8 },
    ]

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.4, 3.4, 7)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c44, roughness: 0.9 })
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count)
    trunkMesh.castShadow = true
    trunkMesh.receiveShadow = true

    const blobMeshes = blobLayers.map(layer => {
      const mat = new THREE.MeshStandardMaterial({ color: layer.color, roughness: 0.85, flatShading: true })
      const mesh = new THREE.InstancedMesh(layer.geo, mat, count)
      mesh.castShadow = true
      return mesh
    })

    const dummy = new THREE.Object3D()
    const phases = []
    let placed = 0
    let attempts = 0

    while (placed < count && attempts < count * 10) {
      attempts++
      const x = (Math.random() - 0.5) * 165
      const z = (Math.random() - 0.5) * 165
      const h = getHeight(x, z)
      if (h < 0.3 || h > 11) continue

      const scale = 0.7 + Math.random() * 0.9
      const rotation = Math.random() * Math.PI * 2

      dummy.rotation.set(0, rotation, 0)
      dummy.scale.set(scale, scale, scale)

      dummy.position.set(x, h + scale * 1.7, z)
      dummy.updateMatrix()
      trunkMesh.setMatrixAt(placed, dummy.matrix)

      const trunkColor = new THREE.Color(0x7a5c44).multiplyScalar(0.8 + Math.random() * 0.4)
      trunkMesh.setColorAt(placed, trunkColor)

      for (let b = 0; b < blobMeshes.length; b++) {
        const layer = blobLayers[b]
        const bs = scale * layer.scale * (0.9 + Math.random() * 0.2)
        dummy.position.set(x, h + scale * layer.yOff, z)
        dummy.scale.set(bs, bs, bs)
        dummy.rotation.y = rotation + b * 0.7
        dummy.updateMatrix()
        blobMeshes[b].setMatrixAt(placed, dummy.matrix)

        const gVar = 0.75 + Math.random() * 0.45
        blobMeshes[b].setColorAt(placed, new THREE.Color(layer.color).multiplyScalar(gVar))
      }

      phases.push(Math.random() * Math.PI * 2)
      deciduousSpots.push({ x, z, h })
      placed++
    }

    trunkMesh.count = placed
    trunkMesh.instanceMatrix.needsUpdate = true
    if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true

    const blobOrig = blobMeshes.map(mesh => {
      mesh.count = placed
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      const origMatrices = []
      const tmp = new THREE.Matrix4()
      for (let i = 0; i < placed; i++) {
        mesh.getMatrixAt(i, tmp)
        origMatrices.push(tmp.clone())
      }
      return origMatrices
    })

    scene.add(trunkMesh)
    blobMeshes.forEach(m => scene.add(m))

    deciduous = { trunk: trunkMesh, blobs: blobMeshes, blobOrig, phases }
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
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
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
    const headGeo = new THREE.IcosahedronGeometry(0.1, 0)
    headGeo.translate(0, 0.55, 0)
    const headMat = new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true })

    const stems = new THREE.InstancedMesh(stemGeo, stemMat, count)
    const heads = new THREE.InstancedMesh(headGeo, headMat, count)
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
      dummy.position.set(x, h, z)
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      stems.setMatrixAt(placed, dummy.matrix)
      heads.setMatrixAt(placed, dummy.matrix)
      heads.setColorAt(placed, new THREE.Color(palette[Math.floor(Math.random() * palette.length)]))
      placed++
    }

    stems.count = placed
    heads.count = placed
    stems.instanceMatrix.needsUpdate = true
    heads.instanceMatrix.needsUpdate = true
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true
    scene.add(stems)
    scene.add(heads)
  }

  function createMushrooms() {
    if (!treeSpots.length) return
    const count = 25
    const stemGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.28, 6)
    stemGeo.translate(0, 0.14, 0)
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.85 })
    const capGeo = new THREE.SphereGeometry(0.24, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
    capGeo.translate(0, 0.24, 0)
    const capMat = new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true })

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
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.95 })
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xc9a875, roughness: 0.85 })

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

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.9 })
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x6e5637, roughness: 0.95 })
    const pier = new THREE.Group()

    // Planks along local +Z (shore end -> lake center after group rotation)
    for (let i = 0; i < 7; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.85), woodMat)
      plank.position.set(0, 0, 0.4 + i * 1.0)
      plank.castShadow = true
      plank.receiveShadow = true
      pier.add(plank)
    }

    // Long piles down to the lake bottom
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
    })

    // Small bench at the shore end
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.4), darkWoodMat)
    bench.position.set(0, 0.35, 0.3)
    bench.castShadow = true
    pier.add(bench)
    const benchLegL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.3), darkWoodMat)
    benchLegL.position.set(-0.4, 0.17, 0.3)
    const benchLegR = benchLegL.clone()
    benchLegR.position.x = 0.4
    pier.add(benchLegL, benchLegR)

    pier.position.set(ca * (shoreD + 0.6), deckY, sa * (shoreD + 0.6))
    pier.rotation.y = Math.atan2(-ca, -sa)
    scene.add(pier)

    pierTip = { x: ca * (shoreD + 0.6 - 6.4), z: sa * (shoreD + 0.6 - 6.4) }
  }

  function createBoat() {
    if (!pierTip) return
    const g = new THREE.Group()
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5d4326, roughness: 0.85 })
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.9 })

    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.5, 2.8, 10, 1), hullMat)
    hull.scale.set(0.6, 1, 0.8)
    hull.rotation.z = -Math.PI / 2
    hull.castShadow = true
    g.add(hull)

    const seat1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.7), seatMat)
    seat1.position.set(0.5, 0.35, 0)
    const seat2 = seat1.clone()
    seat2.position.x = -0.5
    g.add(seat1, seat2)

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

    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8b5e3c).multiplyScalar(colorMul), roughness: 0.8 })
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x5c4033).multiplyScalar(colorMul), roughness: 0.9 })
    const lightMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc4a48c).multiplyScalar(colorMul), roughness: 0.8 })
    const noseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x3d2b1f).multiplyScalar(colorMul), roughness: 0.7 })
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 })

    // Body (main torso)
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.9), bodyMat)
    body.position.y = 2.2
    deerGroup.add(body)

    // Belly (lighter)
    const belly = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.8), lightMat)
    belly.position.set(0, 1.9, 0.1)
    deerGroup.add(belly)

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.0, 8), bodyMat)
    neck.position.set(0.8, 2.8, 0)
    neck.rotation.z = -0.4
    deerGroup.add(neck)

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.4), bodyMat)
    head.position.set(1.1, 3.3, 0)
    deerGroup.add(head)

    // Snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.35), lightMat)
    snout.position.set(1.45, 3.15, 0)
    deerGroup.add(snout)

    // Nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.38), noseMat)
    nose.position.set(1.6, 3.15, 0)
    deerGroup.add(nose)

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 6)
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
    eyeL.position.set(1.25, 3.4, 0.22)
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
    eyeR.position.set(1.25, 3.4, -0.22)
    deerGroup.add(eyeL, eyeR)

    // Ears
    const earGeo = new THREE.SphereGeometry(0.15, 6, 4)
    earGeo.scale(1, 0.5, 0.6)
    const earL = new THREE.Mesh(earGeo, bodyMat)
    earL.position.set(1.0, 3.55, 0.28)
    earL.rotation.z = -0.3
    const earR = new THREE.Mesh(earGeo, bodyMat)
    earR.position.set(1.0, 3.55, -0.28)
    earR.rotation.z = -0.3
    deerGroup.add(earL, earR)

    // Antlers (adults only)
    if (antlers) {
      const antlerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x6b5b4f).multiplyScalar(colorMul), roughness: 0.85 })
      const antlerPositions = [
        { pos: [0.95, 3.65, 0.15], rot: [0, 0, -0.2], scale: [0.06, 0.7, 0.06] },
        { pos: [0.95, 3.65, -0.15], rot: [0, 0, 0.2], scale: [0.06, 0.7, 0.06] },
        // Branches
        { pos: [1.05, 3.85, 0.2], rot: [0.3, 0, -0.5], scale: [0.05, 0.3, 0.05] },
        { pos: [1.05, 3.85, -0.2], rot: [0.3, 0, 0.5], scale: [0.05, 0.3, 0.05] },
        { pos: [0.9, 3.95, 0.18], rot: [-0.2, 0, -0.3], scale: [0.04, 0.2, 0.04] },
        { pos: [0.9, 3.95, -0.18], rot: [-0.2, 0, 0.3], scale: [0.04, 0.2, 0.04] },
      ]
      antlerPositions.forEach(a => {
        const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1, 6), antlerMat)
        antler.position.set(...a.pos)
        antler.rotation.set(...a.rot)
        antler.scale.set(...a.scale)
        deerGroup.add(antler)
      })
    }

    // Legs (4 legs - front2, back2)
    const legGeo = new THREE.CylinderGeometry(0.1, 0.08, 1.65, 6)
    const hoofGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12)
    const legData = [
      { name: 'frontLeft', x: 0.6, z: 0.3 },
      { name: 'frontRight', x: 0.6, z: -0.3 },
      { name: 'backLeft', x: -0.6, z: 0.3 },
      { name: 'backRight', x: -0.6, z: -0.3 },
    ]

    legData.forEach(ld => {
      const leg = new THREE.Group()
      const upper = new THREE.Mesh(legGeo, darkMat)
      upper.position.y = -0.5
      leg.add(upper)

      const hoof = new THREE.Mesh(hoofGeo, noseMat)
      hoof.position.y = -1.25
      leg.add(hoof)

      leg.position.set(ld.x, 1.31, ld.z)
      leg.userData = { name: ld.name }
      deerGroup.add(leg)
      deerLegs.push(leg)
    })

    // Tail
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), lightMat)
    tail.position.set(-0.9, 2.5, 0)
    tail.scale.set(0.8, 1, 0.6)
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
      legs: deerLegs,
      tail,
      pos: new THREE.Vector3(),
      target: new THREE.Vector3(),
      state: 'idle',
      idleTime: 1 + Math.random() * 4,
      isFawn: fawn,
      speed: fawn ? 3.8 : 3.0,
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

      if (deer.state === 'idle') {
        deer.idleTime -= delta
        deer.body.position.y += (2.2 - deer.body.position.y) * 0.2
        deer.legs.forEach(leg => { leg.rotation.x *= 0.9 })
        deer.tail.rotation.x *= 0.9
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

            // Legs (walking gait, offset per deer)
            const walkSpeed = 8
            const gaitPhase = elapsed * walkSpeed + i * 1.3
            const legSwing = Math.sin(gaitPhase) * 0.4
            const legSwing2 = Math.sin(gaitPhase + Math.PI) * 0.4
            deer.legs.forEach(leg => {
              const name = leg.userData.name
              if (name.startsWith('front')) {
                leg.rotation.x = name.endsWith('Left') ? legSwing : legSwing2
              } else {
                leg.rotation.x = name.endsWith('Left') ? legSwing2 : legSwing
              }
            })

            // Body bob
            deer.body.position.y = 2.2 + Math.sin(gaitPhase * 2) * 0.05

            // Tail wag
            deer.tail.rotation.x = Math.sin(elapsed * walkSpeed) * 0.3
          }
        }
      }
    }
  }

  function createSquirrels() {
    for (let i = 0; i < 2; i++) {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xb5651d).multiplyScalar(0.9 + Math.random() * 0.2),
        roughness: 0.85,
      })
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 })
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 })

      const sq = new THREE.Group()

      const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), bodyMat)
      body.scale.set(1.4, 1, 1)
      body.position.y = 0.45
      sq.add(body)

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), bodyMat)
      head.position.set(0.4, 0.62, 0)
      sq.add(head)

      const snout = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), bodyMat)
      snout.scale.set(0.8, 0.6, 0.7)
      snout.position.set(0.55, 0.57, 0)
      sq.add(snout)

      const earGeo = new THREE.SphereGeometry(0.07, 6, 4)
      const earL = new THREE.Mesh(earGeo, darkMat)
      earL.position.set(0.38, 0.8, 0.1)
      const earR = earL.clone()
      earR.position.z = -0.1
      sq.add(earL, earR)

      const eyeGeo = new THREE.SphereGeometry(0.03, 6, 4)
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
      eyeL.position.set(0.5, 0.68, 0.12)
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
      eyeR.position.set(0.5, 0.68, -0.12)
      sq.add(eyeL, eyeR)

      // Fluffy tail (3-segment arc)
      const tail = new THREE.Group()
      const tailSpecs = [
        { r: 0.16, pos: [-0.35, 0.55, 0.05] },
        { r: 0.13, pos: [-0.5, 0.75, 0.1] },
        { r: 0.1, pos: [-0.5, 0.95, 0.12] },
      ]
      tailSpecs.forEach(s => {
        const t = new THREE.Mesh(new THREE.SphereGeometry(s.r, 7, 5), darkMat)
        t.position.set(...s.pos)
        tail.add(t)
      })
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

      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), bodyMat)
      body.scale.set(1.8, 0.8, 0.9)
      bird.add(body)

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), bodyMat)
      head.position.set(0.3, 0.05, 0)
      bird.add(head)

      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 5), beakMat)
      beak.position.set(0.46, 0.05, 0)
      beak.rotation.z = -Math.PI / 2
      bird.add(beak)

      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 4), wingMat)
      tail.position.set(-0.38, 0.02, 0)
      tail.rotation.z = Math.PI / 2
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
    const wingGeo = new THREE.BufferGeometry()
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0.05, 0, 0,
      -0.3, 0, 0.5,
      0.35, 0, 0.45,
    ], 3))
    wingGeo.computeVertexNormals()

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
      const wingMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, emissive: new THREE.Color(color).multiplyScalar(0.15) })
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 })

      const bf = new THREE.Group()

      const wingL = new THREE.Mesh(wingGeo, wingMat)
      const wingR = new THREE.Mesh(wingGeo, wingMat)
      wingR.scale.z = -1
      bf.add(wingL, wingR)

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.32, 5), bodyMat)
      body.rotation.z = Math.PI / 2
      bf.add(body)

      const headDot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), bodyMat)
      headDot.position.set(0.18, 0, 0)
      bf.add(headDot)

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

    // Grass wind (GPU)
    if (grassWindShader) {
      grassWindShader.uniforms.uTime.value = elapsed
      grassWindShader.uniforms.uWind.value.set(wind.x, wind.z)
    }

    // Gentle tree sway - tilt canopies around their base orientation
    if (treeTopMesh && treeTop2Mesh && treeTopOrigMatrices.length) {
      const count = treeTopOrigMatrices.length
      const dummy = new THREE.Object3D()
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      const windQuat = new THREE.Quaternion()
      const euler = new THREE.Euler()

      for (let i = 0; i < count; i++) {
        const phase = treePhases[i] || i * 0.5

        treeTopOrigMatrices[i].decompose(pos, quat, scale)
        euler.set(
          Math.sin(elapsed * 1.2 + phase) * 0.03 + wind.x * 0.035,
          0,
          Math.cos(elapsed * 1.0 + phase) * 0.03 + wind.z * 0.035
        )
        windQuat.setFromEuler(euler)
        dummy.position.copy(pos)
        dummy.quaternion.copy(quat).premultiply(windQuat)
        dummy.scale.copy(scale)
        dummy.updateMatrix()
        treeTopMesh.setMatrixAt(i, dummy.matrix)

        treeTop2OrigMatrices[i].decompose(pos, quat, scale)
        euler.set(
          Math.sin(elapsed * 1.3 + phase + 1) * 0.04 + wind.x * 0.05,
          0,
          Math.cos(elapsed * 1.1 + phase + 1) * 0.04 + wind.z * 0.05
        )
        windQuat.setFromEuler(euler)
        dummy.position.copy(pos)
        dummy.quaternion.copy(quat).premultiply(windQuat)
        dummy.scale.copy(scale)
        dummy.updateMatrix()
        treeTop2Mesh.setMatrixAt(i, dummy.matrix)
      }

      treeTopMesh.instanceMatrix.needsUpdate = true
      treeTop2Mesh.instanceMatrix.needsUpdate = true
    }

    // Deciduous foliage sway
    if (deciduous) {
      const count = deciduous.phases.length
      const dummy = new THREE.Object3D()
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      const windQuat = new THREE.Quaternion()
      const euler = new THREE.Euler()

      for (let i = 0; i < count; i++) {
        const phase = deciduous.phases[i]
        const amp = 0.045 + wind.x * 0.05
        const ampZ = 0.045 + wind.z * 0.05

        for (let b = 0; b < deciduous.blobs.length; b++) {
          const mesh = deciduous.blobs[b]
          const orig = deciduous.blobOrig[b][i]
          const bScale = 1 + b * 0.25
          orig.decompose(pos, quat, scale)
          euler.set(
            Math.sin(elapsed * 1.1 + phase + b * 0.9) * amp * bScale,
            0,
            Math.cos(elapsed * 0.9 + phase + b * 0.7) * ampZ * bScale
          )
          windQuat.setFromEuler(euler)
          dummy.position.copy(pos)
          dummy.quaternion.copy(quat).premultiply(windQuat)
          dummy.scale.copy(scale)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
        }
      }

      deciduous.blobs.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true })
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
  }

  return { init, dispose, autoRotate, toggleAutoRotate }
}