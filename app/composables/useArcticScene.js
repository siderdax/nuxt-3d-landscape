import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export function useArcticScene(containerRef) {
  let scene, camera, renderer, controls, animationId
  let auroraMesh
  let snowParticles
  let starField
  let terrainHeights = {}

  // Rabbit
  let rabbitGroup, rabbitEars = [], rabbitLegs = []
  let rabbitTarget = new THREE.Vector3()
  let rabbitPos = new THREE.Vector3()
  let rabbitState = 'idle'
  let rabbitIdleTime = 3
  let rabbitHopPhase = 0

  // Bear
  let bearGroup, bearLegs = []
  let bearTarget = new THREE.Vector3()
  let bearPos = new THREE.Vector3()
  let bearState = 'idle'
  let bearIdleTime = 5

  const autoRotate = ref(true)

  function toggleAutoRotate() {
    autoRotate.value = !autoRotate.value
    if (controls) controls.autoRotate = autoRotate.value
  }

  function getHeight(x, z) {
    const key = `${x.toFixed(1)},${z.toFixed(1)}`
    if (terrainHeights[key] !== undefined) return terrainHeights[key]

    let h = 0
    h += Math.sin(x * 0.015) * Math.cos(z * 0.02) * 5
    h += Math.sin(x * 0.04 + z * 0.03) * 2.5
    h += Math.sin(x * 0.08) * Math.cos(z * 0.07) * 1.0
    h += Math.cos(x * 0.12 + z * 0.1) * 0.5

    const dist = Math.sqrt(x * x + z * z)
    if (dist < 15) {
      h = h * (dist / 15) + 0.5 * (1 - dist / 15)
    }

    h = Math.max(0, h)
    terrainHeights[key] = h
    return h
  }

  function getTerrainColor(height) {
    const color = new THREE.Color()
    if (height < 0.8) {
      color.setHex(0xc8d4e8)
    } else if (height < 3) {
      color.setHex(0xe0e8f2)
    } else if (height < 7) {
      color.setHex(0xd0dce8)
    } else {
      color.setHex(0xf0f4fa)
    }
    const n = (Math.random() - 0.5) * 0.04
    color.r = Math.max(0, Math.min(1, color.r + n))
    color.g = Math.max(0, Math.min(1, color.g + n))
    color.b = Math.max(0, Math.min(1, color.b + n))
    return color
  }

  function init() {
    const container = containerRef.value
    if (!container) return

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x080818)
    scene.fog = new THREE.FogExp2(0x080818, 0.003)

    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 500)
    camera.position.set(0, 12, 30)

    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    container.appendChild(renderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.2
    controls.maxPolarAngle = Math.PI / 2.1
    controls.minDistance = 10
    controls.maxDistance = 100
    controls.target.set(0, 2, 0)

    setupLights()
    createTerrain()
    createPineTrees()
    createIceFormations()
    createAurora()
    createStars()
    createSnowParticles()
    createRabbit()
    createBear()

    window.addEventListener('resize', onResize)
    animate()
  }

  function setupLights() {
    const moon = new THREE.DirectionalLight(0x8888cc, 0.6)
    moon.position.set(-20, 40, 10)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    moon.shadow.camera.left = -60
    moon.shadow.camera.right = 60
    moon.shadow.camera.top = 60
    moon.shadow.camera.bottom = -60
    moon.shadow.camera.near = 1
    moon.shadow.camera.far = 100
    scene.add(moon)

    const ambient = new THREE.AmbientLight(0x1a1a3a, 0.4)
    scene.add(ambient)

    const hemi = new THREE.HemisphereLight(0x222244, 0x111122, 0.3)
    scene.add(hemi)
  }

  function createTerrain() {
    const size = 120
    const segments = 128
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
      colors.push(color.r, color.g, color.b)
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
    })

    const terrain = new THREE.Mesh(geo, mat)
    terrain.receiveShadow = true
    terrain.castShadow = true
    scene.add(terrain)
  }

  function createPineTrees() {
    const count = 200
    const dummy = new THREE.Object3D()

    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.18, 1.2, 5)
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3a2a,
      roughness: 0.9,
    })
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count)
    trunkMesh.castShadow = true

    const treeGeo = new THREE.ConeGeometry(1.2, 2.5, 6)
    const treeMat = new THREE.MeshStandardMaterial({
      color: 0x2a4a3a,
      roughness: 0.8,
      flatShading: true,
    })
    const treeMesh = new THREE.InstancedMesh(treeGeo, treeMat, count)
    treeMesh.castShadow = true

    const snowGeo = new THREE.ConeGeometry(1.1, 1.0, 6)
    const snowMat = new THREE.MeshStandardMaterial({
      color: 0xe8eef5,
      roughness: 0.9,
      flatShading: true,
    })
    const snowMesh = new THREE.InstancedMesh(snowGeo, snowMat, count)
    snowMesh.castShadow = true

    let placed = 0
    let attempts = 0

    while (placed < count && attempts < count * 8) {
      attempts++
      const x = (Math.random() - 0.5) * 90
      const z = (Math.random() - 0.5) * 90
      const dist = Math.sqrt(x * x + z * z)
      if (dist < 12) continue

      const h = getHeight(x, z)
      if (h < 0.2 || h > 8) continue

      const scale = 0.5 + Math.random() * 0.7
      const rot = Math.random() * Math.PI * 2

      dummy.position.set(x, h + scale * 0.6, z)
      dummy.rotation.set(0, rot, 0)
      dummy.scale.set(scale * 0.5, scale, scale * 0.5)
      dummy.updateMatrix()
      trunkMesh.setMatrixAt(placed, dummy.matrix)

      dummy.position.set(x, h + scale * 2.4, z)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      treeMesh.setMatrixAt(placed, dummy.matrix)

      dummy.position.set(x, h + scale * 3.5, z)
      dummy.scale.set(scale * 0.9, scale * 0.5, scale * 0.9)
      dummy.updateMatrix()
      snowMesh.setMatrixAt(placed, dummy.matrix)

      placed++
    }

    trunkMesh.count = placed
    trunkMesh.instanceMatrix.needsUpdate = true
    treeMesh.count = placed
    treeMesh.instanceMatrix.needsUpdate = true
    snowMesh.count = placed
    snowMesh.instanceMatrix.needsUpdate = true

    scene.add(trunkMesh)
    scene.add(treeMesh)
    scene.add(snowMesh)
  }

  function createIceFormations() {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      roughness: 0.1,
      metalness: 0.0,
      transparent: true,
      opacity: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.5,
    })

    for (let i = 0; i < 15; i++) {
      const x = (Math.random() - 0.5) * 70
      const z = (Math.random() - 0.5) * 70
      const dist = Math.sqrt(x * x + z * z)
      if (dist < 10 || dist > 40) continue

      const h = getHeight(x, z)
      if (h < 0.5) continue

      const size = 0.5 + Math.random() * 1.5
      const geo = new THREE.IcosahedronGeometry(size, 1)
      const pos = geo.attributes.position
      for (let j = 0; j < pos.count; j++) {
        pos.setX(j, pos.getX(j) + (Math.random() - 0.5) * 0.3)
        pos.setY(j, pos.getY(j) + (Math.random() - 0.5) * 0.3)
        pos.setZ(j, pos.getZ(j) + (Math.random() - 0.5) * 0.3)
      }
      geo.computeVertexNormals()

      const ice = new THREE.Mesh(geo, mat.clone())
      ice.material.color.setHSL(0.55 + Math.random() * 0.1, 0.3, 0.6 + Math.random() * 0.3)
      ice.position.set(x, h + size * 0.3, z)
      ice.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      ice.castShadow = true
      scene.add(ice)
    }
  }

  function createAurora() {
    const segX = 50
    const segY = 16
    const width = 50
    const height = 18

    const geo = new THREE.PlaneGeometry(width, height, segX, segY)

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(0x00ff88) },
        uColor2: { value: new THREE.Color(0x4488ff) },
        uColor3: { value: new THREE.Color(0x8844ff) },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vElevation;

        void main() {
          vUv = uv;
          vec3 pos = position;

          float wave1 = sin(pos.x * 0.08 + uTime * 0.15) * 0.8;
          float wave2 = sin(pos.y * 0.1 + uTime * 0.1 + pos.x * 0.04) * 0.5;
          float wave3 = sin(pos.x * 0.15 - uTime * 0.2) * 0.4;
          pos.z += wave1 + wave2 + wave3;
          vElevation = wave1 + wave2 + wave3;

          float arcAngle = (pos.x / ${width}) * 3.14159 * 0.6;
          float radius = 35.0;
          float cx = sin(arcAngle) * radius;
          float cz = cos(arcAngle) * radius - radius + 10.0;
          pos.x = cx;
          pos.z += cz;
          pos.y += 14.0;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        varying vec2 vUv;
        varying float vElevation;

        void main() {
          float t = vUv.y;

          float bands = sin(vUv.x * 12.0 + uTime * 0.08 + vUv.y * 3.0) * 0.5 + 0.5;
          bands = bands * 0.4 + 0.6;

          float stripe = sin(vUv.y * 25.0 + uTime * 0.15) * 0.5 + 0.5;
          stripe = smoothstep(0.2, 0.8, stripe);

          vec3 color = mix(uColor1, uColor2, smoothstep(0.0, 0.5, t));
          color = mix(color, uColor3, smoothstep(0.4, 1.0, t));
          color *= bands;
          color += vec3(0.0, 0.1, 0.05) * stripe;

          float edgeX = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          float edgeY = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          float alpha = edgeX * edgeY * 0.55;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    auroraMesh = new THREE.Mesh(geo, mat)
    scene.add(auroraMesh)
  }

  function createStars() {
    const count = 2000
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 80 + Math.random() * 200
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi))
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      sizes[i] = 0.2 + Math.random() * 0.8
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    starField = new THREE.Points(geo, mat)
    scene.add(starField)
  }

  function createSnowParticles() {
    const count = 1500
    const positions = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100
      positions[i * 3 + 1] = Math.random() * 30
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    snowParticles = new THREE.Points(geo, mat)
    scene.add(snowParticles)
  }

  function createRabbit() {
    rabbitGroup = new THREE.Group()

    const furMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f5, roughness: 0.8 })
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xffaaaa, roughness: 0.7 })
    const earMat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.8 })
    const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xffbbbb, roughness: 0.7 })

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), furMat)
    body.scale.set(1, 0.8, 1.1)
    body.position.y = 0.5
    body.castShadow = true
    rabbitGroup.add(body)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), furMat)
    head.position.set(0.35, 0.7, 0)
    head.castShadow = true
    rabbitGroup.add(head)

    const earData = [
      { x: 0.3, z: 0.1 },
      { x: 0.3, z: -0.1 },
    ]
    earData.forEach(ep => {
      const ear = new THREE.Group()
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.35, 6), earMat)
      outer.position.y = 0.18
      ear.add(outer)
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), innerEarMat)
      inner.position.y = 0.18
      inner.position.x = 0.02
      ear.add(inner)
      ear.position.set(ep.x, 0.85, ep.z)
      ear.rotation.z = -0.15
      ear.rotation.x = 0.1
      rabbitGroup.add(ear)
      rabbitEars.push(ear)
    })

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat)
    eyeL.position.set(0.42, 0.75, 0.15)
    rabbitGroup.add(eyeL)
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat)
    eyeR.position.set(0.42, 0.75, -0.15)
    rabbitGroup.add(eyeR)

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), pinkMat)
    nose.position.set(0.5, 0.68, 0)
    rabbitGroup.add(nose)

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), furMat)
    tail.position.set(-0.3, 0.55, 0)
    rabbitGroup.add(tail)

    const legGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.25, 6)
    const legMat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.8 })
    const legData = [
      { x: 0.15, z: 0.2 },
      { x: 0.15, z: -0.2 },
      { x: -0.2, z: 0.2 },
      { x: -0.2, z: -0.2 },
    ]
    legData.forEach(ld => {
      const leg = new THREE.Group()
      const upper = new THREE.Mesh(legGeo, legMat)
      upper.position.y = -0.12
      leg.add(upper)
      leg.position.set(ld.x, 0.4, ld.z)
      rabbitGroup.add(leg)
      rabbitLegs.push(leg)
    })

    rabbitPos.set(-15, 0, 10)
    const rh = getHeight(rabbitPos.x, rabbitPos.z)
    rabbitGroup.position.set(rabbitPos.x, rh, rabbitPos.z)
    rabbitGroup.scale.set(0.8, 0.8, 0.8)

    rabbitState = 'idle'
    rabbitIdleTime = 3

    rabbitGroup.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    scene.add(rabbitGroup)
  }

  function createBear() {
    bearGroup = new THREE.Group()

    const furMat = new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 0.9 })
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 })

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.7), furMat)
    body.position.y = 0.7
    body.castShadow = true
    bearGroup.add(body)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), furMat)
    head.position.set(0.7, 1.0, 0)
    head.scale.set(1, 0.9, 0.9)
    head.castShadow = true
    bearGroup.add(head)

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.25), furMat)
    snout.position.set(0.95, 0.95, 0)
    snout.castShadow = true
    bearGroup.add(snout)

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), noseMat)
    nose.position.set(1.05, 0.95, 0)
    bearGroup.add(nose)

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat)
    eyeL.position.set(0.8, 1.08, 0.2)
    bearGroup.add(eyeL)
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat)
    eyeR.position.set(0.8, 1.08, -0.2)
    bearGroup.add(eyeR)

    const earGeo = new THREE.SphereGeometry(0.1, 6, 4)
    const earL = new THREE.Mesh(earGeo, furMat)
    earL.position.set(0.6, 1.2, 0.25)
    earL.scale.set(1, 0.6, 0.8)
    bearGroup.add(earL)
    const earR = new THREE.Mesh(earGeo, furMat)
    earR.position.set(0.6, 1.2, -0.25)
    earR.scale.set(1, 0.6, 0.8)
    bearGroup.add(earR)

    const legGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.5, 6)
    const legData = [
      { x: 0.5, z: 0.3 },
      { x: 0.5, z: -0.3 },
      { x: -0.5, z: 0.3 },
      { x: -0.5, z: -0.3 },
    ]
    legData.forEach(ld => {
      const leg = new THREE.Group()
      const upper = new THREE.Mesh(legGeo, furMat)
      upper.position.y = -0.25
      leg.add(upper)
      leg.position.set(ld.x, 0.4, ld.z)
      leg.userData = { baseX: ld.x, baseZ: ld.z }
      bearGroup.add(leg)
      bearLegs.push(leg)
    })

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), furMat)
    tail.position.set(-0.65, 0.8, 0)
    bearGroup.add(tail)

    bearPos.set(20, 0, -15)
    const bh = getHeight(bearPos.x, bearPos.z)
    bearGroup.position.set(bearPos.x, bh, bearPos.z)
    bearGroup.scale.set(0.7, 0.7, 0.7)

    bearState = 'idle'
    bearIdleTime = 5

    bearGroup.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    scene.add(bearGroup)
  }

  function pickNewRabbitTarget() {
    let x, z, dist, h
    let attempts = 0
    do {
      x = (Math.random() - 0.5) * 60
      z = (Math.random() - 0.5) * 60
      dist = Math.sqrt(x * x + z * z)
      h = getHeight(x, z)
      attempts++
    } while ((dist < 10 || h < 0.2 || h > 6) && attempts < 50)
    rabbitTarget.set(x, h, z)
  }

  function updateRabbitAnimation(delta, elapsed) {
    if (!rabbitGroup) return

    if (rabbitState === 'idle') {
      rabbitIdleTime -= delta
      rabbitEars.forEach((ear, i) => {
        ear.rotation.x = 0.1 + Math.sin(elapsed * 3 + i * 2) * 0.05
      })
      if (rabbitIdleTime <= 0) {
        rabbitState = 'walking'
        pickNewRabbitTarget()
        rabbitHopPhase = 0
      }
      return
    }

    if (rabbitState === 'walking') {
      const speed = 2.5
      const dx = rabbitTarget.x - rabbitPos.x
      const dz = rabbitTarget.z - rabbitPos.z
      const distToTarget = Math.sqrt(dx * dx + dz * dz)

      if (distToTarget < 1.5) {
        rabbitState = 'idle'
        rabbitIdleTime = 2 + Math.random() * 3
        return
      }

      rabbitHopPhase += delta * speed * 3

      const moveX = (dx / distToTarget) * speed * delta
      const moveZ = (dz / distToTarget) * speed * delta
      rabbitPos.x += moveX
      rabbitPos.z += moveZ

      const terrainH = getHeight(rabbitPos.x, rabbitPos.z)
      rabbitPos.y = terrainH

      const hopCycle = Math.sin(rabbitHopPhase)
      const hopHeight = Math.max(0, hopCycle) * 0.3
      rabbitGroup.position.set(rabbitPos.x, terrainH + hopHeight, rabbitPos.z)

      const squash = 1 - Math.abs(hopCycle) * 0.2
      rabbitGroup.scale.set(0.8 * squash, 0.8 / squash, 0.8 * squash)

      const targetRotation = -Math.atan2(dz, dx)
      let rotDiff = targetRotation - rabbitGroup.rotation.y
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2
      rabbitGroup.rotation.y += rotDiff * 5 * delta

      rabbitEars.forEach((ear, i) => {
        ear.rotation.x = 0.1 + Math.sin(rabbitHopPhase + i) * 0.15
      })

      rabbitLegs.forEach((leg, i) => {
        const phase = i < 2 ? rabbitHopPhase : rabbitHopPhase + Math.PI
        leg.rotation.x = Math.sin(phase) * 0.3
      })
    }
  }

  function pickNewBearTarget() {
    let x, z, dist, h
    let attempts = 0
    do {
      x = (Math.random() - 0.5) * 80
      z = (Math.random() - 0.5) * 80
      dist = Math.sqrt(x * x + z * z)
      h = getHeight(x, z)
      attempts++
    } while ((dist < 15 || h < 0.2 || h > 7) && attempts < 50)
    bearTarget.set(x, h, z)
  }

  function updateBearAnimation(delta, elapsed) {
    if (!bearGroup) return

    if (bearState === 'idle') {
      bearIdleTime -= delta
      if (bearIdleTime <= 0) {
        bearState = 'walking'
        pickNewBearTarget()
      }
      return
    }

    if (bearState === 'walking') {
      const speed = 1.5
      const dx = bearTarget.x - bearPos.x
      const dz = bearTarget.z - bearPos.z
      const distToTarget = Math.sqrt(dx * dx + dz * dz)

      if (distToTarget < 2) {
        bearState = 'idle'
        bearIdleTime = 4 + Math.random() * 6
        return
      }

      const moveX = (dx / distToTarget) * speed * delta
      const moveZ = (dz / distToTarget) * speed * delta
      bearPos.x += moveX
      bearPos.z += moveZ

      const terrainH = getHeight(bearPos.x, bearPos.z)
      bearPos.y = terrainH
      bearGroup.position.set(bearPos.x, terrainH, bearPos.z)

      const targetRotation = -Math.atan2(dz, dx)
      let rotDiff = targetRotation - bearGroup.rotation.y
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2
      bearGroup.rotation.y += rotDiff * 2 * delta

      const walkPhase = elapsed * 3
      bearLegs.forEach((leg, i) => {
        const phase = i < 2 ? walkPhase : walkPhase + Math.PI
        leg.rotation.x = Math.sin(phase) * 0.2
      })

      bearGroup.children.forEach(child => {
        if (child.geometry?.type === 'BoxGeometry' && child.position.y === 0.7) {
          child.position.y = 0.7 + Math.sin(elapsed * 4) * 0.03
        }
      })
    } else {
      bearLegs.forEach(leg => {
        leg.rotation.x *= 0.9
      })
    }
  }

  function updateAurora(elapsed) {
    if (auroraMesh) {
      auroraMesh.material.uniforms.uTime.value = elapsed
    }
  }

  function updateSnow(elapsed, delta) {
    if (!snowParticles) return
    const pos = snowParticles.geometry.attributes.position
    const array = pos.array

    for (let i = 0; i < array.length; i += 3) {
      array[i + 1] -= delta * 0.8
      array[i] += Math.sin(elapsed + i) * 0.005

      if (array[i + 1] < -2) {
        array[i] = (Math.random() - 0.5) * 100
        array[i + 1] = 25 + Math.random() * 5
        array[i + 2] = (Math.random() - 0.5) * 100
      }
    }
    pos.needsUpdate = true
  }

  function updateStars(elapsed) {
    if (starField) {
      starField.material.opacity = 0.7 + Math.sin(elapsed * 0.3) * 0.2
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

    updateAurora(elapsed)
    updateSnow(elapsed, delta)
    updateStars(elapsed)
    updateRabbitAnimation(delta, elapsed)
    updateBearAnimation(delta, elapsed)

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
