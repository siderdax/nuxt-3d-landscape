import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

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
  return makeCanvas(MAP, (ctx) => {
    ctx.fillStyle = '#23232c'
    ctx.fillRect(0, 0, MAP, MAP)
    const roadSpans = (r) => {
      if (r === 40) return [[0, 102], [138, 22]]
      if (r === -40) return [[0, 22], [58, 102]]
      return [[0, MAP]]
    }
    for (const r of ROADS) {
      ctx.fillStyle = r === 0 ? '#0a0a12' : '#0e0e16'
      for (const [s, l] of roadSpans(r)) {
        ctx.fillRect(MAP / 2 + r - 2, s, 4, l)
        ctx.fillRect(s, MAP / 2 + r - 2, l, 4)
      }
    }
    ctx.fillStyle = '#28283a'
    ctx.fillRect(MAP / 2 + 22, MAP / 2 + 22, 36, 36)
    ctx.fillRect(MAP / 2 - 58, MAP / 2 - 58, 36, 36)
    ctx.fillRect(MAP / 2 + 22, MAP / 2 - 38, 36, 16)
    ctx.fillStyle = '#d8d8d8'
    for (let k = -4; k < 5; k++) {
      const t = k * 16 + 2
      ctx.fillRect(MAP / 2 + t, MAP / 2 - 1.5, 3, 1)
      ctx.fillRect(MAP / 2 + t, MAP / 2 + 0.5, 3, 1)
      ctx.fillRect(MAP / 2 - 1.5, MAP / 2 + t, 1, 3)
      ctx.fillRect(MAP / 2 + 0.5, MAP / 2 + t, 1, 3)
    }
    ctx.fillStyle = '#2e2e3a'
    ctx.fillRect(MAP / 2 - 17, MAP / 2 - 17, 34, 34)
    ctx.fillStyle = '#343440'
    ctx.fillRect(MAP / 2 - 14, MAP / 2 - 14, 28, 28)
    ctx.strokeStyle = '#3f3f50'
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
      ctx.fillStyle = '#152218'
      ctx.fillRect(x - 8.5, z - 8.5, 17, 17)
      ctx.fillStyle = '#1c301c'
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.arc(x - 5 + (i % 2) * 10, z - 5 + Math.floor(i / 2) * 10, 1.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  })
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
    scene.add(new THREE.AmbientLight(0x334466, 0.55))
    scene.add(new THREE.HemisphereLight(0x3a4a6a, 0x181828, 0.65))
    const moon = new THREE.DirectionalLight(0xa8bcd8, 1.35)
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
      const groundTex = makeGroundTexture()
      texAssets.push(groundTex)
      const geo = new THREE.PlaneGeometry(MAP, MAP)
      geo.rotateX(-Math.PI / 2)
      const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: groundTex, roughness: 0.85, metalness: 0.1
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
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.6, metalness: 0.5 })
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
      treeTrunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 }), count)
      treeCrowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x1c3a24, roughness: 0.85, flatShading: true }), count)
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
    const styles = []
    const mk = (base, a, b, lit, bands) => {
      const tex = makeWindowTexture(base, a, b, lit, bands)
      texAssets.push(tex)
      const mat = new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff,
        emissiveIntensity: 0.55, color: 0xffffff, roughness: 0.65, metalness: 0.15
      })
      styles.push({ tex, mat })
    }
    mk('#0e1626', '#3a6ea8', '#7ab8e8', 0.55, false) // glass blue
    mk('#1a1a24', '#ffc26a', '#ffe0a0', 0.4, false) // warm office
    mk('#0c1c1c', '#2f9e9e', '#7adcdc', 0.5, false) // teal glass
    mk('#181822', '#ff9a5a', '#ffc88a', 0.5, true) // hotel bands
    mk('#241c18', '#ff6a4a', '#8a4a2a', 0.3, false) // brick

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

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1c1c26, roughness: 0.8 })
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.6, metalness: 0.4 })

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

        const style = styles[
          ring <= 1.5 ? Math.floor(Math.random() * 3)
            : ring <= 2.5 ? 1 + Math.floor(Math.random() * 2)
              : isFactory ? 4 : 2 + Math.floor(Math.random() * 3)
        ]
        const mat = style.mat.clone()
        mat.emissiveIntensity = 0.4 + Math.random() * 0.6 + (ring <= 1 ? 0.2 : 0)
        const geo = new THREE.BoxGeometry(w, h, d)
        const b = new THREE.Mesh(geo, mat)
        b.position.set(bx + ox + (Math.random() - 0.5) * 2, h / 2, bz + oz + (Math.random() - 0.5) * 2)
        b.castShadow = true
        b.receiveShadow = true
        scene.add(b)

        if (!isFactory && h > 8 && Math.random() < 0.5) {
          const rw = w * 0.5, rd = d * 0.5, rh = 0.6 + Math.random() * 0.8
          const roof = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), roofMat)
          roof.position.set(b.position.x, h + rh / 2, b.position.z)
          scene.add(roof)
        }
        if (!isFactory && h > 12 && Math.random() < 0.35) {
          const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 5), antennaMat)
          ant.position.set(b.position.x, h + 1.5, b.position.z)
          scene.add(ant)
        }
      }
    }
  }

  // ---------- landmarks ----------

  function createSpire() {
    const g = new THREE.Group()
    const metal = new THREE.MeshStandardMaterial({ color: 0x38404c, roughness: 0.4, metalness: 0.6 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x232834, roughness: 0.5, metalness: 0.5 })
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
      new THREE.MeshStandardMaterial({ color: 0x0e2434, emissive: 0x55ddff, emissiveIntensity: 0.7, roughness: 0.3 })
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
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35,
      color: 0xffffff, roughness: 0.5, metalness: 0.2
    })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(15, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeMat)
    dome.scale.y = 0.42
    dome.position.y = 6.3
    dome.castShadow = true
    g.add(dome)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(15, 0.5, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.5, metalness: 0.5 })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.4
    g.add(ring)
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x38404c, roughness: 0.4, metalness: 0.5 })
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
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.75,
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
      emissive: 0x55ddff, emissiveIntensity: 0.35
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
    const signMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, emissive: 0x2dffd5, emissiveIntensity: 1.4 })
    const sign = new THREE.Mesh(new THREE.BoxGeometry(21.5, 0.4, 0.4), signMat)
    sign.position.set(40, 19.9, -30)
    scene.add(sign)
  }

  function createPyramid() {
    const tex = makeCanvas(64, (ctx) => {
      ctx.fillStyle = '#0c1c26'
      ctx.fillRect(0, 0, 64, 64)
      ctx.fillStyle = '#2f9e9e'
      for (let r = 0; r < 6; r++) {
        for (let c = r; c < 8 - r; c++) {
          if ((r + c) % 2 === 0) ctx.fillRect(c * 8 + 1, r * 8 + 1, 6, 6)
        }
      }
      ctx.fillStyle = '#7adcdc'
      for (let r = 0; r < 6; r++) {
        for (let c = r; c < 8 - r; c++) {
          if ((r + c) % 2 === 1) ctx.fillRect(c * 8 + 1, r * 8 + 1, 6, 6)
        }
      }
    })
    texAssets.push(tex)
    const g = new THREE.Group()
    const py = new THREE.Mesh(
      new THREE.ConeGeometry(15, 13, 4),
      new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5,
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
      color: 0x232834, roughness: 0.5, metalness: 0.5
    }))
    base.position.y = 0.4
    g.add(base)
    g.position.set(-40, 0, -40)
    scene.add(g)
  }

  function createRadioTower() {
    const g = new THREE.Group()
    const metal = new THREE.MeshStandardMaterial({ color: 0x38404c, roughness: 0.4, metalness: 0.6 })
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 20, 6), metal)
    shaft.position.y = 10
    g.add(shaft)
    const crossMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.5, metalness: 0.5 })
    for (const y of [6, 12, 17]) {
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 0.15), crossMat)
      c1.position.y = y
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 5), crossMat)
      c2.position.y = y
      g.add(c1, c2)
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), metal)
    antenna.position.y = 23
    g.add(antenna)
    const blink = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a0a0a, emissive: 0xff2211, emissiveIntensity: 1 })
    )
    blink.position.y = 26
    g.add(blink)
    const base = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), crossMat)
    base.position.y = 0.5
    g.add(base)
    shaft.castShadow = true
    g.position.set(-30, 0, 50)
    scene.add(g)
  }

  function createFountain() {
    const g = new THREE.Group()
    const stone = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.7, metalness: 0.2 })
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 0.5, 24), stone)
    pool.position.y = 0.25
    g.add(pool)
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(6.6, 6.6, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0x0e3a4e, emissive: 0x33ddff, emissiveIntensity: 0.65, transparent: true, opacity: 0.85 })
    )
    disc.position.y = 0.52
    g.add(disc)
    const jetMat = new THREE.MeshStandardMaterial({
      color: 0x9fe8ff, emissive: 0x66ccff, emissiveIntensity: 0.8,
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
