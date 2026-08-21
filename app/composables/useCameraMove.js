import * as THREE from 'three'

const KEY_DIRS = {
  KeyW: 0, ArrowUp: 0,
  KeyS: 1, ArrowDown: 1,
  KeyA: 2, ArrowLeft: 2,
  KeyD: 3, ArrowRight: 3
}

// WASD / arrow-key panning on the ground plane (target + camera move together,
// OrbitControls keeps orbiting around the moved target)
export function useCameraMove(camera, orbit, speed = 20) {
  const active = new Set()
  const dir = new THREE.Vector3()
  const right = new THREE.Vector3()
  const step = new THREE.Vector3()
  const UP = new THREE.Vector3(0, 1, 0)

  const isEditable = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  const down = (e) => {
    if (isEditable(e.target)) return
    if (e.code in KEY_DIRS) {
      active.add(KEY_DIRS[e.code])
      e.preventDefault()
    }
  }
  const up = (e) => {
    if (e.code in KEY_DIRS) active.delete(KEY_DIRS[e.code])
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
    camera.getWorldDirection(dir)
    dir.y = 0
    if (dir.lengthSq() < 1e-6) return
    dir.normalize()
    right.crossVectors(dir, UP).normalize()
    step.set(0, 0, 0)
    if (active.has(0)) step.add(dir)
    if (active.has(1)) step.sub(dir)
    if (active.has(3)) step.add(right)
    if (active.has(2)) step.sub(right)
    if (step.lengthSq() === 0) return
    step.normalize().multiplyScalar(speed * dt)
    orbit.target.add(step)
    camera.position.add(step)
  }

  return function disposeCameraMove() {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', clear)
  }
}
