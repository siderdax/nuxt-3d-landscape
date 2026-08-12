import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export function useSpaceScene(containerRef) {
  let scene, camera, renderer, controls, animationId
  let planet, ring, spaceship, asteroids = []
  const starField = { points: null }

  const autoRotate = ref(true)

  function toggleAutoRotate() {
    autoRotate.value = !autoRotate.value
    if (controls) controls.autoRotate = autoRotate.value
  }

  function init() {
    const container = containerRef.value
    if (!container) return

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a1a)
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.0015)

    camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000)
    camera.position.set(20, 15, 30)

    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.8
    container.appendChild(renderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.15
    controls.minDistance = 5
    controls.maxDistance = 100
    controls.target.set(0, 0, 0)

    setupLights()
    createStars()
    createPlanet()
    createAsteroids()
    createSpaceship()

    window.addEventListener('resize', onResize)
    animate()
  }

  function setupLights() {
    const ambient = new THREE.AmbientLight(0x334466, 0.6)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xffeecc, 2.0)
    sun.position.set(30, 20, 40)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    scene.add(sun)

    const fill = new THREE.DirectionalLight(0x4488ff, 0.3)
    fill.position.set(-20, -10, -30)
    scene.add(fill)
  }

  function createStars() {
    const count = 3000
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const colors = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 150 + Math.random() * 350

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)

      sizes[i] = 0.3 + Math.random() * 1.2

      const temp = 0.5 + Math.random() * 0.5
      if (temp > 0.8) {
        colors[i * 3] = 0.7 + Math.random() * 0.3
        colors[i * 3 + 1] = 0.5 + Math.random() * 0.3
        colors[i * 3 + 2] = 1.0
      } else if (temp > 0.5) {
        colors[i * 3] = 1.0
        colors[i * 3 + 1] = 0.9 + Math.random() * 0.1
        colors[i * 3 + 2] = 0.7 + Math.random() * 0.3
      } else {
        colors[i * 3] = 1.0
        colors[i * 3 + 1] = 1.0
        colors[i * 3 + 2] = 1.0
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const mat = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    starField.points = new THREE.Points(geo, mat)
    scene.add(starField.points)
  }

  function createPlanet() {
    const planetMat = new THREE.MeshStandardMaterial({
      color: 0x4488cc,
      roughness: 0.6,
      metalness: 0.1,
    })
    const geo = new THREE.SphereGeometry(3, 32, 32)
    planet = new THREE.Mesh(geo, planetMat)
    planet.position.set(-6, 0, 0)
    planet.castShadow = true
    scene.add(planet)

    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.15,
      roughness: 0.4,
    })
    const cloudGeo = new THREE.SphereGeometry(3.05, 24, 24)
    const clouds = new THREE.Mesh(cloudGeo, cloudMat)
    clouds.position.copy(planet.position)
    clouds.userData.isCloud = true
    scene.add(clouds)

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x88aacc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      roughness: 0.7,
    })
    const ringGeo = new THREE.RingGeometry(4, 6.5, 48)
    ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.copy(planet.position)
    ring.rotation.x = Math.PI / 2.8
    ring.rotation.z = 0.3
    scene.add(ring)

    const ring2Mat = new THREE.MeshStandardMaterial({
      color: 0x667788,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.15,
      roughness: 0.8,
    })
    const ring2Geo = new THREE.RingGeometry(5, 7.5, 48)
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat)
    ring2.position.copy(planet.position)
    ring2.rotation.x = Math.PI / 2.5
    ring2.rotation.z = -0.2
    scene.add(ring2)
  }

  function createAsteroids() {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x665544,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    })

    for (let i = 0; i < 40; i++) {
      const size = 0.2 + Math.random() * 0.6
      const geo = new THREE.DodecahedronGeometry(size, 0)
      const pos = geo.attributes.position
      for (let j = 0; j < pos.count; j++) {
        pos.setX(j, pos.getX(j) + (Math.random() - 0.5) * 0.3)
        pos.setY(j, pos.getY(j) + (Math.random() - 0.5) * 0.3)
        pos.setZ(j, pos.getZ(j) + (Math.random() - 0.5) * 0.3)
      }
      geo.computeVertexNormals()

      const rock = new THREE.Mesh(geo, rockMat.clone())
      const angle = Math.random() * Math.PI * 2
      const radius = 8 + Math.random() * 6
      const heightOff = (Math.random() - 0.5) * 4

      rock.position.set(
        Math.cos(angle) * radius,
        heightOff,
        Math.sin(angle) * radius,
      )
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0)
      rock.userData = {
        angle,
        radius,
        heightOff,
        speed: 0.1 + Math.random() * 0.2,
        rotSpeed: 0.5 + Math.random() * 1.5,
      }
      rock.castShadow = true
      scene.add(rock)
      asteroids.push(rock)
    }
  }

  function createSpaceship() {
    const group = new THREE.Group()

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xccccdd,
      roughness: 0.3,
      metalness: 0.7,
    })
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      roughness: 0.4,
      metalness: 0.5,
    })
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x44aaff,
      emissive: 0x44aaff,
      emissiveIntensity: 1.5,
    })
    const cockpitMat = new THREE.MeshStandardMaterial({
      color: 0x88ddff,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.4,
    })

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 8), bodyMat)
    body.rotation.x = Math.PI / 2
    body.position.z = 0.2
    body.castShadow = true
    group.add(body)

    const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), cockpitMat)
    cabin.position.set(0, 0.15, 0.8)
    cabin.scale.set(1, 0.6, 1.2)
    group.add(cabin)

    const wingGeo = new THREE.BoxGeometry(1.4, 0.06, 0.3)
    const wingL = new THREE.Mesh(wingGeo, accentMat)
    wingL.position.set(0, 0, 0.1)
    group.add(wingL)

    const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.15), accentMat)
    wingTipL.position.set(0.9, 0, 0.1)
    group.add(wingTipL)

    const engineL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 8), glowMat)
    engineL.rotation.x = Math.PI / 2
    engineL.position.set(-0.4, 0, -1.1)
    group.add(engineL)

    const engineR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 8), glowMat)
    engineR.rotation.x = Math.PI / 2
    engineR.position.set(0.4, 0, -1.1)
    group.add(engineR)

    const trailMat = new THREE.MeshStandardMaterial({
      color: 0x44aaff,
      emissive: 0x44aaff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.3,
    })
    for (let side = -1; side <= 1; side += 2) {
      const trail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.8, 6), trailMat)
      trail.rotation.x = -Math.PI / 2
      trail.position.set(side * 0.4, 0, -1.5)
      group.add(trail)
    }

    group.position.set(0, 1.5, 8)
    group.scale.set(0.6, 0.6, 0.6)
    group.userData = {
      angle: 0,
      radius: 8,
      heightAmp: 2,
      heightPhase: 0,
      speed: 0.2,
    }

    spaceship = group
    scene.add(group)
  }

  function updatePlanet(elapsed) {
    if (planet) {
      planet.rotation.y = elapsed * 0.1
      planet.position.x = -6 + Math.sin(elapsed * 0.05) * 1
    }
  }

  function updateAsteroids(elapsed) {
    asteroids.forEach(rock => {
      const { angle, radius, heightOff, speed, rotSpeed } = rock.userData
      const newAngle = angle + elapsed * speed * 0.05
      rock.position.x = Math.cos(newAngle) * radius
      rock.position.z = Math.sin(newAngle) * radius
      rock.rotation.x += rotSpeed * 0.01
      rock.rotation.y += rotSpeed * 0.015
    })
  }

  function updateSpaceship(elapsed) {
    if (!spaceship) return
    const { radius, heightAmp, speed } = spaceship.userData
    const angle = elapsed * speed * 0.1
    spaceship.position.x = Math.cos(angle) * radius
    spaceship.position.z = Math.sin(angle) * radius
    spaceship.position.y = 1.5 + Math.sin(elapsed * 0.08) * heightAmp

    const lookTarget = new THREE.Vector3(0, 0, 0)
    const dir = new THREE.Vector3().subVectors(lookTarget, spaceship.position).normalize()
    spaceship.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
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

    updatePlanet(elapsed)
    updateAsteroids(elapsed)
    updateSpaceship(elapsed)

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
