<template>
  <div>
    <nav class="nav-bar">
      <NuxtLink to="/landscape" class="nav-link" active-class="active">
        <span class="nav-icon">🏔</span> Landscape
      </NuxtLink>
      <NuxtLink to="/city" class="nav-link" active-class="active">
        <span class="nav-icon">🏙</span> City
      </NuxtLink>
      <NuxtLink to="/space" class="nav-link" active-class="active">
        <span class="nav-icon">🌌</span> Space
      </NuxtLink>
      <NuxtLink to="/ocean" class="nav-link" active-class="active">
        <span class="nav-icon">🌊</span> Ocean
      </NuxtLink>
      <NuxtLink to="/arctic" class="nav-link" active-class="active">
        <span class="nav-icon">❄️</span> Arctic
      </NuxtLink>
    </nav>
    <NuxtPage />
  </div>
</template>

<script setup>
import './assets/styles/main.css'
</script>

<style scoped>
.nav-bar {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  padding: 0.5rem;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.2rem;
  border-radius: 0.7rem;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}

.nav-link:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.nav-link.active {
  color: white;
  background: rgba(255, 255, 255, 0.15);
}

.nav-icon {
  font-size: 1.1rem;
}
</style>
