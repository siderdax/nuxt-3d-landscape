import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

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
  let trunkDummy, topDummy
  let treeTopOrigMatrices = []
  let treeTop2OrigMatrices = []
  let lakeMaterial
  let terrainHeights = {}

  // Deer
  let deerGroup, deerLegs = [], deerAntlers = []
  let deerTarget = new THREE.Vector3()
  let deerPos = new THREE.Vector3()
  let deerTimer = 0
  let deerState = 'idle' // 'walking' | 'idle'
  let deerIdleTime = 0

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
    createClouds()
    createRocks()
    createGrassPatches()
    createDeer()

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

  function getHeight(x, z) {
    const key = `${x.toFixed(1)},${z.toFixed(1)}`
    if (terrainHeights[key] !== undefined) return terrainHeights[key]

    // Lake basin: flatten near center
    const lakeDist = Math.sqrt(x * x + z * z)
    let h = 0

    // Multi-octave terrain
    h += noise.fbm(x * 0.015, z * 0.015, 6) * 30
    h += noise.fbm(x * 0.04, z * 0.04, 4) * 8
    h += noise.fbm(x * 0.1, z * 0.1, 3) * 2

    // Carve lake basin
    if (lakeDist < 25) {
      const lakeFactor = Math.pow(lakeDist / 25, 2)
      h = h * lakeFactor - 3 * (1 - lakeFactor)
    }

    // Raise edges (mountain rim)
    const edgeDist = Math.sqrt(
      Math.pow(Math.max(0, Math.abs(x) - 50), 2) +
      Math.pow(Math.max(0, Math.abs(z) - 50), 2)
    )
    if (edgeDist < 30) {
      h += (1 - edgeDist / 30) * 15 * Math.max(0, noise.fbm(x * 0.02 + 100, z * 0.02 + 100, 4) * 0.5 + 0.5)
    }

    terrainHeights[key] = h
    return h
  }

  function getTerrainColor(height) {
    const color = new THREE.Color()

    if (height < -1) {
      // Sandy shore
      color.setHex(0xc2b280)
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
    const size = 24
    const segments = 128
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
          float wave1 = sin(pos.x * 0.5 + uTime * 1.2) * cos(pos.y * 0.3 + uTime * 0.8) * 0.3;
          float wave2 = sin(pos.x * 1.2 + pos.y * 0.8 + uTime * 2.0) * 0.15;
          float wave3 = sin(pos.x * 2.5 - uTime * 1.5) * sin(pos.y * 2.0 + uTime) * 0.08;
          pos.z += wave1 + wave2 + wave3;
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

          // Edge fade
          float edgeX = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          float edgeY = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          float edge = edgeX * edgeY;

          gl_FragColor = vec4(color, uOpacity * edge);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    })

    const lake = new THREE.Mesh(geo, lakeMaterial)
    lake.position.y = -1.5
    lake.receiveShadow = true
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

    trunkDummy = new THREE.Object3D()
    topDummy = new THREE.Object3D()

    let placed = 0
    let attempts = 0

    while (placed < count && attempts < count * 10) {
      attempts++
      const x = (Math.random() - 0.5) * 170
      const z = (Math.random() - 0.5) * 170
      const dist = Math.sqrt(x * x + z * z)

      // Skip lake area
      if (dist < 22) continue

      const h = getHeight(x, z)

      // Only place on valid terrain
      if (h < -1 || h > 16) continue

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

  function createClouds() {
    const cloudCount = 12
    const group = new THREE.Group()

    for (let i = 0; i < cloudCount; i++) {
      const cloud = createSingleCloud()
      const x = (Math.random() - 0.5) * 200
      const y = 35 + Math.random() * 20
      const z = (Math.random() - 0.5) * 150
      cloud.position.set(x, y, z)
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

  function createSingleCloud() {
    const cloud = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
    })

    const numPuffs = 5 + Math.floor(Math.random() * 5)
    for (let i = 0; i < numPuffs; i++) {
      const size = 1.5 + Math.random() * 3
      const geo = new THREE.SphereGeometry(size, 7, 5)
      const puff = new THREE.Mesh(geo, mat)
      puff.position.set(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 4
      )
      puff.scale.y = 0.6
      puff.castShadow = true
      cloud.add(puff)
    }

    const scale = 0.8 + Math.random() * 0.7
    cloud.scale.set(scale, scale, scale)
    return cloud
  }

  function createRocks() {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x707070,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    })

    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 180
      const z = (Math.random() - 0.5) * 180
      const dist = Math.sqrt(x * x + z * z)
      if (dist < 20) continue

      const h = getHeight(x, z)
      if (h < -2 || h > 20) continue

      const size = 0.3 + Math.random() * 1.5
      const geo = new THREE.DodecahedronGeometry(size, 1)

      // Deform vertices for natural look
      const pos = geo.attributes.position
      for (let j = 0; j < pos.count; j++) {
        const px = pos.getX(j)
        const py = pos.getY(j)
        const pz = pos.getZ(j)
        const noiseVal = noise.noise2D(px * 2, pz * 2) * 0.3
        pos.setX(j, px + noiseVal)
        pos.setY(j, py * (0.5 + Math.random() * 0.5))
        pos.setZ(j, pz + noiseVal)
      }
      geo.computeVertexNormals()

      const color = new THREE.Color(0x606060).lerp(new THREE.Color(0x909090), Math.random())
      const rock = new THREE.Mesh(geo, rockMat.clone())
      rock.material.color.copy(color)
      rock.position.set(x, h + size * 0.3, z)
      rock.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      )
      rock.castShadow = true
      rock.receiveShadow = true
      scene.add(rock)
    }
  }

  function createGrassPatches() {
    // Simple grass blades using instanced small planes
    const count = 2000
    const bladeGeo = new THREE.PlaneGeometry(0.15, 0.8)
    bladeGeo.translate(0, 0.4, 0) // pivot at base

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x5a9e3a,
      roughness: 0.9,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    })

    const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, count)
    const dummy = new THREE.Object3D()
    let placed = 0

    for (let attempt = 0; attempt < count * 5 && placed < count; attempt++) {
      const x = (Math.random() - 0.5) * 160
      const z = (Math.random() - 0.5) * 160
      const dist = Math.sqrt(x * x + z * z)
      if (dist < 22) continue

      const h = getHeight(x, z)
      if (h < 0 || h > 10) continue

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

  function createDeer() {
    deerGroup = new THREE.Group()

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.8 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.9 })
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xC4A48C, roughness: 0.8 })
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x3D2B1F, roughness: 0.7 })
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.3 })

    // Body (main torso)
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.9), bodyMat)
    body.position.y = 2.2
    body.castShadow = true
    deerGroup.add(body)

    // Belly (lighter)
    const belly = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.8), lightMat)
    belly.position.set(0, 1.9, 0.1)
    belly.castShadow = true
    deerGroup.add(belly)

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.0, 8), bodyMat)
    neck.position.set(0.8, 2.8, 0)
    neck.rotation.z = -0.4
    neck.castShadow = true
    deerGroup.add(neck)

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.4), bodyMat)
    head.position.set(1.1, 3.3, 0)
    head.castShadow = true
    deerGroup.add(head)

    // Snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.35), lightMat)
    snout.position.set(1.45, 3.15, 0)
    snout.castShadow = true
    deerGroup.add(snout)

    // Nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.38), noseMat)
    nose.position.set(1.6, 3.15, 0)
    deerGroup.add(nose)

    // Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat)
    eyeL.position.set(1.25, 3.4, 0.22)
    deerGroup.add(eyeL)
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat)
    eyeR.position.set(1.25, 3.4, -0.22)
    deerGroup.add(eyeR)

    // Ears
    const earGeo = new THREE.SphereGeometry(0.15, 6, 4)
    earGeo.scale(1, 0.5, 0.6)
    const earL = new THREE.Mesh(earGeo, bodyMat)
    earL.position.set(1.0, 3.55, 0.28)
    earL.rotation.z = -0.3
    deerGroup.add(earL)
    const earR = new THREE.Mesh(earGeo, bodyMat)
    earR.position.set(1.0, 3.55, -0.28)
    earR.rotation.z = -0.3
    deerGroup.add(earR)

    // Antlers
    const antlerMat = new THREE.MeshStandardMaterial({ color: 0x6B5B4F, roughness: 0.85 })
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
      antler.castShadow = true
      deerGroup.add(antler)
      deerAntlers.push(antler)
    })

    // Legs (4 legs - front2, back2)
    const legGeo = new THREE.CylinderGeometry(0.1, 0.08, 1.4, 6)
    const hoofGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12)
    const legData = [
      { name: 'frontLeft',  x: 0.6,  z: 0.3 },
      { name: 'frontRight', x: 0.6,  z: -0.3 },
      { name: 'backLeft',   x: -0.6, z: 0.3 },
      { name: 'backRight',  x: -0.6, z: -0.3 },
    ]

    legData.forEach(ld => {
      const leg = new THREE.Group()
      const upper = new THREE.Mesh(legGeo, darkMat)
      upper.position.y = -0.4
      upper.castShadow = true
      leg.add(upper)

      const hoof = new THREE.Mesh(hoofGeo, noseMat)
      hoof.position.y = -1.05
      hoof.castShadow = true
      leg.add(hoof)

      leg.position.set(ld.x, 1.6, ld.z)
      leg.userData = { name: ld.name, baseX: ld.x, baseZ: ld.z }
      deerGroup.add(leg)
      deerLegs.push(leg)
    })

    // Tail
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), lightMat)
    tail.position.set(-0.9, 2.5, 0)
    tail.scale.set(0.8, 1, 0.6)
    deerGroup.add(tail)
    deerGroup.userData.tail = tail

    // Set initial position on terrain
    deerPos.set(30, 0, 20)
    const deerH = getHeight(deerPos.x, deerPos.z)
    deerGroup.position.set(deerPos.x, deerH, deerPos.z)

    // Pick initial target
    pickNewDeerTarget()
    deerState = 'idle'
    deerIdleTime = 2 // Start idle for a couple seconds

    deerGroup.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    scene.add(deerGroup)
  }

  function pickNewDeerTarget() {
    // Random target within terrain bounds, avoiding lake
    let x, z, dist, h
    let attempts = 0
    do {
      x = (Math.random() - 0.5) * 140
      z = (Math.random() - 0.5) * 140
      dist = Math.sqrt(x * x + z * z)
      h = getHeight(x, z)
      attempts++
    } while ((dist < 25 || h < -1 || h > 15) && attempts < 50)

    deerTarget.set(x, h, z)
  }

  function updateDeerAnimation(delta, elapsed) {
    if (!deerGroup) return

    // State machine: idle -> walking -> idle
    if (deerState === 'idle') {
      deerIdleTime -= delta
      if (deerIdleTime <= 0) {
        deerState = 'walking'
        pickNewDeerTarget()
      }
      return
    }

    if (deerState === 'walking') {
      const speed = 3.0
      const dx = deerTarget.x - deerPos.x
      const dz = deerTarget.z - deerPos.z
      const distToTarget = Math.sqrt(dx * dx + dz * dz)

      if (distToTarget < 2) {
        deerState = 'idle'
        deerIdleTime = 2 + Math.random() * 4
        return
      }

      // Move toward target
      const moveX = (dx / distToTarget) * speed * delta
      const moveZ = (dz / distToTarget) * speed * delta
      deerPos.x += moveX
      deerPos.z += moveZ

      // Get terrain height at new position
      const terrainH = getHeight(deerPos.x, deerPos.z)
      deerPos.y = terrainH

      // Update position
      deerGroup.position.set(deerPos.x, terrainH, deerPos.z)

      // Rotate to face movement direction (deer model faces +X)
      const targetRotation = -Math.atan2(dz, dx)
      // Smooth rotation
      let rotDiff = targetRotation - deerGroup.rotation.y
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2
      deerGroup.rotation.y += rotDiff * 3 * delta

      // Animate legs (walking gait)
      const walkSpeed = 8
      const legSwing = Math.sin(elapsed * walkSpeed) * 0.4
      const legSwing2 = Math.sin(elapsed * walkSpeed + Math.PI) * 0.4

      deerLegs.forEach(leg => {
        const name = leg.userData.name
        if (name.startsWith('front')) {
          leg.rotation.x = name.endsWith('Left') ? legSwing : legSwing2
        } else {
          leg.rotation.x = name.endsWith('Left') ? legSwing2 : legSwing
        }
      })

      // Body bob
      deerGroup.children.forEach(child => {
        if (child.geometry?.type === 'BoxGeometry' && child.position.y === 2.2) {
          child.position.y = 2.2 + Math.sin(elapsed * walkSpeed * 2) * 0.05
        }
      })

      // Tail wag
      if (deerGroup.userData.tail) {
        deerGroup.userData.tail.rotation.x = Math.sin(elapsed * walkSpeed) * 0.3
      }
    } else {
      // Reset legs when idle
      deerLegs.forEach(leg => {
        leg.rotation.x *= 0.9
      })
    }
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

    // Gentle tree sway - use original matrices as base
    if (treeTopMesh && treeTop2Mesh && treeTopOrigMatrices.length) {
      const count = treeTopOrigMatrices.length
      const dummy = new THREE.Object3D()
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      const scale = new THREE.Vector3()

      for (let i = 0; i < count; i++) {
        treeTopOrigMatrices[i].decompose(pos, quat, scale)
        const breeze = Math.sin(elapsed * 2 + i * 0.5) * 0.03
        dummy.position.copy(pos)
        dummy.quaternion.copy(quat)
        dummy.scale.set(
          scale.x * (1 + breeze),
          scale.y,
          scale.z * (1 + breeze)
        )
        dummy.updateMatrix()
        treeTopMesh.setMatrixAt(i, dummy.matrix)

        treeTop2OrigMatrices[i].decompose(pos, quat, scale)
        const breeze2 = Math.sin(elapsed * 2.3 + i * 0.7) * 0.04
        dummy.position.copy(pos)
        dummy.quaternion.copy(quat)
        dummy.scale.set(
          scale.x * (1 + breeze2),
          scale.y,
          scale.z * (1 + breeze2)
        )
        dummy.updateMatrix()
        treeTop2Mesh.setMatrixAt(i, dummy.matrix)
      }

      treeTopMesh.instanceMatrix.needsUpdate = true
      treeTop2Mesh.instanceMatrix.needsUpdate = true
    }

    // Update deer animation
    updateDeerAnimation(delta, elapsed)

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