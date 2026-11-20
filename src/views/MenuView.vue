<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter, type RouteLocationRaw } from 'vue-router'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import PageCard from '@/components/PageCard.vue'
import { useAuthStore } from '@/stores/auth'

// RF-15: dependentes, minha conta, sobre a estimativa, política de privacidade, sair e excluir
// conta. Excluir abre Minha conta já com a confirmação na tela (RF-04).
const items: {
  to: RouteLocationRaw
  label: string
  description: string
  icon: IconName
  danger?: boolean
}[] = [
  {
    to: { name: 'dependents' },
    label: 'Dependentes',
    description: 'Cadastros, rendimentos e vínculos com despesas',
    icon: 'user',
  },
  {
    to: { name: 'user' },
    label: 'Minha conta',
    description: 'E-mail, senha e confirmação do e-mail',
    icon: 'user',
  },
  {
    to: { name: 'info' },
    label: 'Sobre a estimativa',
    description: 'Premissas, o que fica de fora e fontes oficiais',
    icon: 'info',
  },
  {
    to: { name: 'privacy' },
    label: 'Política de privacidade',
    description: 'Como seus dados são usados',
    icon: 'privacy',
  },
  {
    to: { name: 'user', query: { acao: 'excluir' } },
    label: 'Excluir conta',
    description: 'Apaga a conta e todos os dados, com confirmação',
    icon: 'trash',
    danger: true,
  },
]

const auth = useAuthStore()
const router = useRouter()
const signingOut = ref(false)
const signOutError = ref('')

async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  signOutError.value = ''
  try {
    await auth.signOut()
    await router.push({ name: 'user' })
  } catch {
    signOutError.value = 'Não foi possível sair. Tente de novo.'
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <PageCard class="menu-page" eyebrow="RendaFacil" title="Menu">
    <nav aria-label="Menu">
      <ul class="menu-list">
        <li v-for="item in items" :key="item.label">
          <RouterLink :to="item.to" class="menu-item" :class="{ danger: item.danger }">
            <AppIcon :name="item.icon" class="menu-icon" />
            <span class="menu-text">
              <span class="menu-label">{{ item.label }}</span>
              <span class="menu-description">{{ item.description }}</span>
            </span>
            <span class="menu-chevron" aria-hidden="true">›</span>
          </RouterLink>
        </li>
        <li>
          <button type="button" class="menu-item" :disabled="signingOut" @click="signOut">
            <AppIcon name="logout" class="menu-icon" />
            <span class="menu-text">
              <span class="menu-label">Sair</span>
              <span class="menu-description">Encerra a sessão neste aparelho</span>
            </span>
          </button>
        </li>
      </ul>
      <p v-if="signOutError" class="menu-error" role="alert">{{ signOutError }}</p>
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

button.menu-item {
  width: 100%;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.menu-error {
  margin-top: 0.5rem;
  color: var(--color-danger);
}

/* A destructive item: the icon and the label in the danger colour, so it reads apart from Sair. */
.menu-item.danger .menu-icon,
.menu-item.danger .menu-label {
  color: var(--color-danger);
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
