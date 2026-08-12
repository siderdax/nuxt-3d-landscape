import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export function useCityScene(containerRef) {
  let scene, camera, renderer, controls, animationId
  const cars = []
  const buildings = []
  let roadMaterial

  const autoRotate = ref(true)

  function toggleAutoRotate() {
    autoRotate.value = !autoRotate.value
    if (controls) controls.autoRotate = autoRotate.value
  }

  function init() {
    const container = containerRef.value
    if (!container) return

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x2a2a4e)
    scene.fog = new THREE.Fog(0x2a2a4e, 80, 200)

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 500)
    camera.position.set(40, 35, 60)
    camera.lookAt(0, 0, 0)

    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.4
    container.appendChild(renderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxPolarAngle = Math.PI / 2.1
    controls.minDistance = 10
    controls.maxDistance = 150
    controls.target.set(0, 0, 0)
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.2

    setupLights()
    createGround()
    createBuildings()
    createCars()

    window.addEventListener('resize', onResize)
    animate()
  }

  function setupLights() {
    const hemi = new THREE.HemisphereLight(0x4466aa, 0x334455, 0.7)
    scene.add(hemi)

    const ambient = new THREE.AmbientLight(0x334466, 0.5)
    scene.add(ambient)

    const moon = new THREE.DirectionalLight(0xaabbdd, 1.2)
    moon.position.set(-30, 60, 20)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    moon.shadow.camera.left = -60
    moon.shadow.camera.right = 60
    moon.shadow.camera.top = 60
    moon.shadow.camera.bottom = -60
    moon.shadow.camera.near = 1
    moon.shadow.camera.far = 150
    scene.add(moon)
  }

  function createGround() {
    const size = 60
    const geo = new THREE.PlaneGeometry(size, size)
    geo.rotateX(-Math.PI / 2)

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3a,
      roughness: 0.9,
      metalness: 0.1,
    })
    const ground = new THREE.Mesh(geo, mat)
    ground.position.y = -0.05
    ground.receiveShadow = true
    scene.add(ground)

    const gridHelper = new THREE.GridHelper(size, 12, 0x444466, 0x333355)
    gridHelper.position.y = 0
    scene.add(gridHelper)

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.8,
      metalness: 0.2,
    })
    roadMaterial = roadMat

    const roads = [
      { x: 0, z: 0, w: size, d: 3 },
      { x: 0, z: 0, w: 3, d: size },
      { x: -15, z: 0, w: 2.5, d: size },
      { x: 15, z: 0, w: 2.5, d: size },
      { x: 0, z: -15, w: size, d: 2.5 },
      { x: 0, z: 15, w: size, d: 2.5 },
    ]

    roads.forEach(r => {
      const g = new THREE.PlaneGeometry(r.w, r.d)
      g.rotateX(-Math.PI / 2)
      const m = new THREE.Mesh(g, roadMat.clone())
      m.position.set(r.x, 0.01, r.z)
      m.receiveShadow = true
      scene.add(m)
    })

    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.8,
    })

    for (let x = -25; x <= 25; x += 5) {
      for (let z = -25; z <= 25; z += 5) {
        const h = 0.05
        const gw = 0.6
        const gz = 0.6
        const gGeo = new THREE.PlaneGeometry(gw, gz)
        gGeo.rotateX(-Math.PI / 2)
        const gMesh = new THREE.Mesh(gGeo, sideMat)
        gMesh.position.set(x, 0.005, z)
        scene.add(gMesh)
      }
    }
  }

  function createBuildings() {
    const count = 50
    const usedSpots = []

    for (let i = 0; i < count; i++) {
      let x, z, valid
      let attempts = 0

      do {
        const blockSize = 3
        const blockX = Math.floor((Math.random() - 0.5) * 10) * blockSize
        const blockZ = Math.floor((Math.random() - 0.5) * 10) * blockSize

        const onRoad =
          blockX === 0 || blockZ === 0 ||
          Math.abs(blockX) >= 13 || Math.abs(blockZ) >= 13 ||
          (Math.abs(blockX) < 3 && Math.abs(blockZ) < 3)

        if (onRoad) {
          valid = false
        } else {
          const blocked = usedSpots.some(
            s => Math.abs(s.x - blockX) < blockSize * 0.8 && Math.abs(s.z - blockZ) < blockSize * 0.8
          )
          if (!blocked) {
            valid = true
            x = blockX
            z = blockZ
            usedSpots.push({ x, z })
          } else {
            valid = false
          }
        }
        attempts++
      } while (!valid && attempts < 100)

      if (!valid) continue

      const width = 0.8 + Math.random() * 2.2
      const depth = 0.8 + Math.random() * 2.2
      const height = 1.5 + Math.random() * 8

      const bMinX = x - width / 2, bMaxX = x + width / 2
      const bMinZ = z - depth / 2, bMaxZ = z + depth / 2
      const roads = [
        { minX: -1.5, maxX: 1.5, minZ: -30, maxZ: 30 },
        { minX: -30, maxX: 30, minZ: -1.5, maxZ: 1.5 },
        { minX: -16.25, maxX: -13.75, minZ: -30, maxZ: 30 },
        { minX: 13.75, maxX: 16.25, minZ: -30, maxZ: 30 },
        { minX: -30, maxX: 30, minZ: -16.25, maxZ: -13.75 },
        { minX: -30, maxX: 30, minZ: 13.75, maxZ: 16.25 },
      ]
      const onRoad = roads.some(r =>
        bMinX < r.maxX && bMaxX > r.minX && bMinZ < r.maxZ && bMaxZ > r.minZ
      )
      if (onRoad) continue

      const geo = new THREE.BoxGeometry(width, height, depth)

      const hue = 0.55 + Math.random() * 0.25
      const sat = 0.1 + Math.random() * 0.3
      const light = 0.3 + Math.random() * 0.4
      const color = new THREE.Color().setHSL(hue, sat, light)

      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5 + Math.random() * 0.4,
        metalness: 0.1 + Math.random() * 0.4,
      })

      const building = new THREE.Mesh(geo, mat)
      building.position.set(x, height / 2, z)
      building.castShadow = true
      building.receiveShadow = true
      scene.add(building)
      buildings.push(building)

      if (height > 2.5 && Math.random() > 0.2) {
        const winMat = new THREE.MeshStandardMaterial({
          color: 0xffdd44,
          emissive: 0xffdd44,
          emissiveIntensity: 0.6 + Math.random() * 0.8,
        })

        const winW = 0.25
        const winH = 0.35
        const gap = 0.2
        const margin = 0.25

        const faces = [
          { dir: [0, 0, 1],  offX: 0, offZ: depth / 2 + 0.01, rot: 0 },
          { dir: [0, 0, -1], offX: 0, offZ: -depth / 2 - 0.01, rot: Math.PI },
          { dir: [1, 0, 0],  offX: width / 2 + 0.01, offZ: 0, rot: -Math.PI / 2 },
          { dir: [-1, 0, 0], offX: -width / 2 - 0.01, offZ: 0, rot: Math.PI / 2 },
        ]

        const litFaces = faces.filter(() => Math.random() > 0.3)

        litFaces.forEach(face => {
          const faceW = face.dir[0] !== 0 ? depth : width
          const cols = Math.max(1, Math.floor((faceW - margin * 2 + gap) / (winW + gap)))
          const rows = Math.max(1, Math.floor((height - margin * 2 - 0.5 + gap) / (winH + gap)))

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (Math.random() > 0.6) continue

              const fx = face.dir[0] !== 0 ? 0 : -faceW / 2 + margin + c * (winW + gap) + winW / 2
              const fz = face.dir[2] !== 0 ? 0 : -faceW / 2 + margin + c * (winW + gap) + winW / 2
              const fy = 0.5 + margin + r * (winH + gap) + winH / 2

              const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), winMat)
              win.position.set(
                x + face.offX + (face.dir[0] !== 0 ? 0 : fx),
                fy,
                z + face.offZ + (face.dir[2] !== 0 ? 0 : fz),
              )
              win.rotation.y = face.rot
              scene.add(win)
            }
          }
        })
      }
    }
  }

  function createCar(color, startX, startZ, roadDir, speed, offset) {
    const group = new THREE.Group()

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 })
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.5,
    })
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffee88,
      emissive: 0xffee44,
      emissiveIntensity: 0.5,
    })
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff2200,
      emissive: 0xff0000,
      emissiveIntensity: 0.3,
    })

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.8), bodyMat)
    body.position.y = 0.35
    body.castShadow = true
    group.add(body)

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.75), glassMat)
    cabin.position.set(-0.1, 0.7, 0)
    group.add(cabin)

    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.7), bodyMat)
    hood.position.set(0.55, 0.6, 0)
    group.add(hood)

    const headlightL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), lightMat)
    headlightL.position.set(0.85, 0.35, 0.25)
    group.add(headlightL)
    const headlightR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), lightMat)
    headlightR.position.set(0.85, 0.35, -0.25)
    group.add(headlightR)

    const taillightL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), tailMat)
    taillightL.position.set(-0.85, 0.35, 0.25)
    group.add(taillightL)
    const taillightR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), tailMat)
    taillightR.position.set(-0.85, 0.35, -0.25)
    group.add(taillightR)

    const wheelPositions = [
      { x: 0.45, z: 0.45 },
      { x: 0.45, z: -0.45 },
      { x: -0.45, z: 0.45 },
      { x: -0.45, z: -0.45 },
    ]
    wheelPositions.forEach(wp => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), wheelMat)
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(wp.x, 0.08, wp.z)
      group.add(wheel)
    })

    group.position.set(startX, 0, startZ)
    scene.add(group)

    return { group, roadDir, speed, offset }
  }

  function createCars() {
    const configs = [
      { color: 0xff4444, startX: 0, startZ: 0, roadDir: 'north', speed: 4 },
      { color: 0x4488ff, startX: 0, startZ: 0, roadDir: 'east', speed: 3.5 },
      { color: 0x44dd44, startX: 0, startZ: 0, roadDir: 'south', speed: 3 },
    ]

    configs.forEach(c => {
      const offset = Math.random() * 20
      const car = createCar(c.color, c.startX, c.startZ, c.roadDir, c.speed, offset)
      cars.push(car)
    })
  }

  function updateCars(delta, elapsed) {
    const roadLimit = 28

    cars.forEach(car => {
      const { group, roadDir, speed } = car
      let dx = 0, dz = 0

      switch (roadDir) {
        case 'north':
          dz = -speed * delta
          break
        case 'south':
          dz = speed * delta
          break
        case 'east':
          dx = speed * delta
          break
        case 'west':
          dx = -speed * delta
          break
      }

      group.position.x += dx
      group.position.z += dz

      if (Math.abs(group.position.x) > roadLimit || Math.abs(group.position.z) > roadLimit) {
        group.position.x = -Math.sign(group.position.x) * roadLimit
        group.position.z = -Math.sign(group.position.z) * roadLimit
      }

      let targetRot = 0
      if (roadDir === 'north') targetRot = Math.PI / 2
      else if (roadDir === 'south') targetRot = -Math.PI / 2
      else if (roadDir === 'east') targetRot = 0
      else if (roadDir === 'west') targetRot = Math.PI

      group.rotation.y = targetRot

      const bounce = Math.sin(elapsed * 12) * 0.02
      group.position.y = bounce
    })
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

    updateCars(delta, elapsed)

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
