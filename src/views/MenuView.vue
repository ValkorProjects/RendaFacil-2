<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import PageCard from '@/components/PageCard.vue'

// The screens that left the bottom bar when it went to four tabs. RF-15 (#16) completes this list
// (dependentes, sobre a estimativa, sair, excluir conta).
const items: { route: string; label: string; description: string; icon: IconName }[] = [
  {
    route: 'dependents',
    label: 'Dependentes',
    description: 'Cadastros, rendimentos e vínculos com despesas',
    icon: 'user',
  },
  {
    route: 'user',
    label: 'Minha conta',
    description: 'Dados pessoais, senha e exclusão da conta',
    icon: 'user',
  },
  {
    route: 'privacy',
    label: 'Política de privacidade',
    description: 'Como seus dados são usados',
    icon: 'privacy',
  },
  {
    route: 'settings',
    label: 'Configurações',
    description: 'Preferências do app',
    icon: 'settings',
  },
  { route: 'info', label: 'Sobre o app', description: 'Versão e instalação', icon: 'info' },
]
</script>

<template>
  <PageCard class="menu-page" eyebrow="RendaFacil" title="Menu">
    <nav aria-label="Menu">
      <ul class="menu-list">
        <li v-for="item in items" :key="item.route">
          <RouterLink :to="{ name: item.route }" class="menu-item">
            <AppIcon :name="item.icon" class="menu-icon" />
            <span class="menu-text">
              <span class="menu-label">{{ item.label }}</span>
              <span class="menu-description">{{ item.description }}</span>
            </span>
            <span class="menu-chevron" aria-hidden="true">›</span>
          </RouterLink>
        </li>
      </ul>
    </nav>
  </PageCard>
</template>

<style scoped>
.menu-page :deep(.body) {
  justify-items: stretch;
}

.menu-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: left;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  min-height: 3.5rem;
  padding: 0.625rem 1rem;
  border-radius: 1rem;
  background: var(--glass-bg-raised);
  color: var(--color-text);
  text-decoration: none;
  transition: transform 150ms ease;
}

.menu-item:active {
  transform: scale(0.98);
}

.menu-icon {
  flex: none;
  width: 1.375rem;
  height: 1.375rem;
  color: var(--color-accent);
}

.menu-text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.menu-label {
  font-weight: 600;
}

.menu-description {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  line-height: 1.4;
}

.menu-chevron {
  color: var(--color-text-muted);
  font-size: 1.5rem;
  line-height: 1;
}
</style>
