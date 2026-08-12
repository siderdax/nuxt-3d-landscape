import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export function useOceanScene(containerRef) {
  let scene, camera, renderer, controls, animationId
  let fishes = [], kelpGroup, bubbleParticles
  let waterSurface

  const autoRotate = ref(true)

  function toggleAutoRotate() {
    autoRotate.value = !autoRotate.value
    if (controls) controls.autoRotate = autoRotate.value
  }

  function init() {
    const container = containerRef.value
    if (!container) return

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0e3a4e)
    scene.fog = new THREE.Fog(0x0e3a4e, 15, 45)

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100)
    camera.position.set(16, 2.5, 20)

    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.5
    container.appendChild(renderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.2
    controls.minDistance = 5
    controls.maxDistance = 60
    controls.maxPolarAngle = Math.PI / 2.1
    controls.target.set(0, 0, 0)

    setupLights()
    createSeaFloor()
    createKelp()
    createCoral()
    createFishes()
    createBubbles()
    createWaterSurface()

    window.addEventListener('resize', onResize)
    animate()
  }

  function setupLights() {
    const ambient = new THREE.AmbientLight(0x2a5a7a, 0.7)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xcceeff, 2.0)
    sun.position.set(10, 30, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -30
    sun.shadow.camera.right = 30
    sun.shadow.camera.top = 30
    sun.shadow.camera.bottom = -30
    sun.shadow.camera.near = 0.1
    sun.shadow.camera.far = 60
    scene.add(sun)

    const back = new THREE.DirectionalLight(0x4488aa, 0.4)
    back.position.set(-10, 5, -15)
    scene.add(back)
  }

  function createSeaFloor() {
    const size = 30
    const geo = new THREE.PlaneGeometry(size, size, 40, 40)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const dist = Math.sqrt(x * x + z * z)
      const h = Math.sin(x * 0.5) * Math.cos(z * 0.7) * 0.3
        + Math.sin(x * 1.2 + z * 0.8) * 0.15
      pos.setY(i, -3 + h - dist * 0.02)
    }
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a4a3a,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: true,
    })

    const floor = new THREE.Mesh(geo, mat)
    floor.receiveShadow = true
    scene.add(floor)
  }

  function createKelp() {
    kelpGroup = new THREE.Group()

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x2d7a3a,
      roughness: 0.8,
    })
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x3a9a4a,
      roughness: 0.7,
      side: THREE.DoubleSide,
    })

    for (let i = 0; i < 30; i++) {
      const x = (Math.random() - 0.5) * 20
      const z = (Math.random() - 0.5) * 20
      const dist = Math.sqrt(x * x + z * z)
      if (dist > 12) continue

      const height = 2 + Math.random() * 3.5
      const stemCount = 5 + Math.floor(height * 2)
      const cluster = new THREE.Group()

      for (let s = 0; s < stemCount; s++) {
        const stemHeight = 1 + Math.random() * (height - 0.5)
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.06, stemHeight, 4),
          stemMat,
        )
        const sx = (Math.random() - 0.5) * 1.2
        const sz = (Math.random() - 0.5) * 1.2
        stem.position.set(sx, -3 + stemHeight / 2, sz)
        stem.rotation.x = (Math.random() - 0.5) * 0.2
        stem.rotation.z = (Math.random() - 0.5) * 0.2
        stem.castShadow = true
        stem.userData = {
          swaySpeed: 0.5 + Math.random() * 1,
          swayAmp: 0.05 + Math.random() * 0.08,
          swayPhase: Math.random() * Math.PI * 2,
          baseX: sx,
        }
        cluster.add(stem)

        const leafCount = 2 + Math.floor(Math.random() * 3)
        for (let l = 0; l < leafCount; l++) {
          const leaf = new THREE.Mesh(
            new THREE.PlaneGeometry(0.15 + Math.random() * 0.2, 0.3 + Math.random() * 0.4),
            leafMat,
          )
          leaf.position.set(
            sx + (Math.random() - 0.5) * 0.2,
            -3 + stemHeight * (0.3 + Math.random() * 0.5),
            sz + (Math.random() - 0.5) * 0.2,
          )
          leaf.rotation.y = Math.random() * Math.PI * 2
          leaf.rotation.x = (Math.random() - 0.5) * 0.4
          cluster.add(leaf)
        }
      }

      cluster.position.set(x, 0, z)
      kelpGroup.add(cluster)
    }

    scene.add(kelpGroup)
  }

  function createCoral() {
    const coralMat = new THREE.MeshStandardMaterial({
      color: 0xff6644,
      roughness: 0.7,
      flatShading: true,
    })
    const coralMat2 = new THREE.MeshStandardMaterial({
      color: 0xff4488,
      roughness: 0.7,
      flatShading: true,
    })
    const coralMat3 = new THREE.MeshStandardMaterial({
      color: 0xffaa44,
      roughness: 0.7,
      flatShading: true,
    })
    const mats = [coralMat, coralMat2, coralMat3]

    for (let i = 0; i < 20; i++) {
      const x = (Math.random() - 0.5) * 18
      const z = (Math.random() - 0.5) * 18
      const dist = Math.sqrt(x * x + z * z)
      if (dist > 10 || dist < 3) continue

      const branches = 3 + Math.floor(Math.random() * 5)
      const group = new THREE.Group()
      const mat = mats[i % 3]

      for (let b = 0; b < branches; b++) {
        const h = 0.3 + Math.random() * 1.0
        const w = 0.06 + Math.random() * 0.12
        const branch = new THREE.Mesh(
          new THREE.CylinderGeometry(w * 0.5, w, h, 5),
          mat,
        )
        const angle = (b / branches) * Math.PI * 2 + Math.random() * 0.3
        const rad = 0.2 + Math.random() * 0.3
        branch.position.set(
          Math.cos(angle) * rad,
          -3 + h / 2,
          Math.sin(angle) * rad,
        )
        branch.rotation.x = (Math.random() - 0.5) * 0.4
        branch.rotation.z = (Math.random() - 0.5) * 0.4
        group.add(branch)

        if (Math.random() > 0.5) {
          const tip = new THREE.Mesh(
            new THREE.SphereGeometry(0.05 + Math.random() * 0.06, 5, 4),
            mat,
          )
          tip.position.set(
            Math.cos(angle) * rad,
            -3 + h,
            Math.sin(angle) * rad,
          )
          group.add(tip)
        }
      }

      group.position.set(x, 0, z)
      scene.add(group)
    }
  }

  function createFish(color) {
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.3,
    })
    const tailMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.2,
    })

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), bodyMat)
    body.scale.set(0.5, 0.45, 1.0)
    body.castShadow = true
    group.add(body)

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4), tailMat)
    tail.rotation.x = Math.PI / 2
    tail.position.z = -0.4
    group.add(tail)

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat)
    eye.position.set(0.12, 0.06, 0.25)
    group.add(eye)

    const x = (Math.random() - 0.5) * 15
    const y = -2.5 + Math.random() * 2
    const z = (Math.random() - 0.5) * 15
    group.position.set(x, y, z)

    const angle = Math.atan2(-x, -z)
    group.rotation.y = angle

    return group
  }

  function createFishes() {
    const fishColors = [0xff6644, 0x44aaff, 0xffaa22, 0xff4488, 0x44dd88]
    const count = 12

    for (let i = 0; i < count; i++) {
      const fish = createFish(fishColors[i % fishColors.length])
      fish.userData = {
        speed: 0.5 + Math.random() * 1.0,
        radius: 3 + Math.random() * 6,
        angle: Math.random() * Math.PI * 2,
        heightPhase: Math.random() * Math.PI * 2,
        heightAmp: 0.2 + Math.random() * 0.4,
        yBase: fish.position.y,
        tailPhase: Math.random() * Math.PI * 2,
      }
      scene.add(fish)
      fishes.push(fish)
    }
  }

  function createBubbles() {
    const count = 60
    const positions = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20
      positions[i * 3 + 1] = -3 + Math.random() * 6
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const mat = new THREE.PointsMaterial({
      color: 0x88ddff,
      size: 0.08,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    bubbleParticles = new THREE.Points(geo, mat)
    scene.add(bubbleParticles)
  }

  function createWaterSurface() {
    const geo = new THREE.PlaneGeometry(28, 28, 40, 40)
    geo.rotateX(-Math.PI / 2)

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(0x0e3a4e) },
        uColor2: { value: new THREE.Color(0x1e5a7a) },
        uOpacity: { value: 0.6 },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vHeight;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float wave = sin(pos.x * 0.3 + uTime * 0.8) * cos(pos.y * 0.4 + uTime * 0.6) * 0.2;
          wave += sin(pos.x * 0.8 + pos.y * 0.5 + uTime * 1.2) * 0.1;
          pos.z += wave;
          vHeight = wave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uOpacity;
        uniform float uTime;
        varying vec2 vUv;
        varying float vHeight;
        void main() {
          float mixFactor = sin(vUv.x * 20.0 + uTime) * cos(vUv.y * 15.0 + uTime * 0.7) * 0.3 + 0.5;
          vec3 color = mix(uColor1, uColor2, mixFactor);
          float edgeX = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
          float edgeY = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
          gl_FragColor = vec4(color, uOpacity * edgeX * edgeY);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    })

    waterSurface = new THREE.Mesh(geo, mat)
    waterSurface.position.y = 0.5
    scene.add(waterSurface)
  }

  function updateFishes(elapsed, delta) {
    fishes.forEach(fish => {
      const { speed, radius, heightAmp, heightPhase, yBase, tailPhase } = fish.userData
      fish.userData.angle += delta * speed * 0.3

      const angle = fish.userData.angle
      fish.position.x = Math.cos(angle) * radius
      fish.position.z = Math.sin(angle) * radius
      fish.position.y = yBase + Math.sin(elapsed * speed * 0.5 + heightPhase) * heightAmp

      const dir = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize()
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
      fish.quaternion.copy(quat)
    })
  }

  function updateKelp(elapsed) {
    if (!kelpGroup) return

    kelpGroup.children.forEach(cluster => {
      cluster.children.forEach(child => {
        if (child.userData.swaySpeed) {
          const { swaySpeed, swayAmp, swayPhase, baseX } = child.userData
          child.position.x = baseX + Math.sin(elapsed * swaySpeed + swayPhase) * swayAmp
        }
      })
    })
  }

  function updateBubbles(elapsed, delta) {
    if (!bubbleParticles) return
    const pos = bubbleParticles.geometry.attributes.position
    const array = pos.array

    for (let i = 0; i < array.length; i += 3) {
      array[i + 1] += delta * 0.3 + Math.random() * 0.1 * delta
      array[i] += Math.sin(elapsed + i) * 0.003

      if (array[i + 1] > 2) {
        array[i] = (Math.random() - 0.5) * 20
        array[i + 1] = -3
        array[i + 2] = (Math.random() - 0.5) * 20
      }
    }
    pos.needsUpdate = true
  }

  function updateWaterSurface(elapsed) {
    if (waterSurface) {
      waterSurface.material.uniforms.uTime.value = elapsed
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

    updateFishes(elapsed, delta)
    updateKelp(elapsed)
    updateBubbles(elapsed, delta)
    updateWaterSurface(elapsed)

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
