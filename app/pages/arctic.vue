<template>
  <div ref="containerRef" class="scene-container">
    <div class="overlay">
      <h1 class="title">Arctic Night</h1>
      <p class="subtitle">
        <span class="icon">🖱</span> Drag to rotate &nbsp;·&nbsp;
        <span class="icon">🔍</span> Scroll to zoom &nbsp;·&nbsp;
        <span class="icon">⌨️</span> WASD move · ←→ rotate · ↑↓ lift
      </p>
      <button class="rotate-btn" @click="toggleAutoRotate">
        <span class="icon">{{ autoRotate ? '⏸' : '▶' }}</span>
        Auto-rotate {{ autoRotate ? 'OFF' : 'ON' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { useArcticScene } from '../composables/useArcticScene'

const containerRef = ref(null)
const { init, dispose, autoRotate, toggleAutoRotate } = useArcticScene(containerRef)

onMounted(() => {
  init()
})

onBeforeUnmount(() => {
  dispose()
})
</script>

<style scoped>
.scene-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 2rem;
  pointer-events: none;
  z-index: 10;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.4), transparent);
}

.title {
  font-size: 2.5rem;
  font-weight: 300;
  color: white;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.05em;
}

.subtitle {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.5);
}

.icon {
  font-size: 1rem;
}

.rotate-btn {
  margin-top: 0.8rem;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.rotate-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.4);
}
</style>
