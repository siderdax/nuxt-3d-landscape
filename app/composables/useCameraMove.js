import * as THREE from 'three'

const MOVE_KEYS = {
  KeyW: 0,
  KeyS: 1,
  KeyA: 2,
  KeyD: 3
}
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
const ROT_SPEED = 1.6 // rad/s for horizontal orbit

// WASD: ground-plane pan. Arrows: up/down lift, left/right orbit (yaw).
// target + camera move together so OrbitControls keeps orbiting the moved target.
export function useCameraMove(camera, orbit, speed = 20) {
  const active = new Set()
  const dir = new THREE.Vector3()
  const right = new THREE.Vector3()
  const step = new THREE.Vector3()
  const offset = new THREE.Vector3()
  const sph = new THREE.Spherical()
  const UP = new THREE.Vector3(0, 1, 0)

  const isEditable = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  const down = (e) => {
    if (isEditable(e.target)) return
    if (e.code in MOVE_KEYS || ARROWS.includes(e.code)) {
      active.add(e.code)
      e.preventDefault()
    }
  }
  const up = (e) => {
    if (active.has(e.code)) active.delete(e.code)
  }
  const clear = () => active.clear()

  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', clear)

  let last = performance.now()
  let raf = requestAnimationFrame(tick)

  function tick(now) {
    raf = requestAnimationFrame(tick)
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    if (active.size === 0) return

    // Left/right arrows: rotate the camera around the target's Y axis (yaw)
    if (active.has('ArrowLeft') || active.has('ArrowRight')) {
      const s = active.has('ArrowLeft') ? 1 : -1
      offset.copy(camera.position).sub(orbit.target)
      sph.setFromVector3(offset)
      sph.theta += s * ROT_SPEED * dt
      offset.setFromSpherical(sph)
      camera.position.copy(orbit.target).add(offset)
    }

    // Up/down arrows: vertical lift
    if (active.has('ArrowUp') || active.has('ArrowDown')) {
      const s = active.has('ArrowUp') ? 1 : -1
      const dy = s * speed * dt
      orbit.target.y += dy
      camera.position.y += dy
    }

    // WASD: ground-plane pan
    camera.getWorldDirection(dir)
    dir.y = 0
    if (dir.lengthSq() >= 1e-6) {
      dir.normalize()
      right.crossVectors(dir, UP).normalize()
      step.set(0, 0, 0)
      if (active.has('KeyW')) step.add(dir)
      if (active.has('KeyS')) step.sub(dir)
      if (active.has('KeyD')) step.add(right)
      if (active.has('KeyA')) step.sub(right)
      if (step.lengthSq() > 0) {
        step.normalize().multiplyScalar(speed * dt)
        orbit.target.add(step)
        camera.position.add(step)
      }
    }
  }

  return function disposeCameraMove() {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', clear)
  }
}
