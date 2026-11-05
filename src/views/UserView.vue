<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import PageCard from '@/components/PageCard.vue'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const { user } = storeToRefs(authStore)
const email = ref('')
const password = ref('')
const isSignUp = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const submit = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  isLoading.value = true

  const { error } = isSignUp.value
    ? await authStore.signUp(email.value, password.value)
    : await authStore.signIn(email.value, password.value)

  isLoading.value = false
  if (error) {
    errorMessage.value = error.message
    return
  }

  successMessage.value = isSignUp.value
    ? 'Cadastro realizado. Verifique seu e-mail para confirmar a conta.'
    : 'Login realizado com sucesso.'
}
</script>

<template>
  <PageCard eyebrow="Account" title="User">
    <p>Sample user page. Profile details and sign-in will live here.</p>
    <p v-if="!isSupabaseConfigured">
      Supabase isn't configured yet. Add your project URL and publishable key to
      <code>.env</code> to enable authentication.
    </p>
    <template v-else-if="user">
      <p>Você está logado como {{ user.email }}.</p>
      <button class="account-button" type="button" @click="authStore.signOut">Sair</button>
    </template>
    <form v-else class="auth-form" @submit.prevent="submit">
      <label for="email">E-mail</label>
      <input id="email" v-model="email" type="email" autocomplete="email" required />
      <label for="password">Senha</label>
      <input
        id="password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        minlength="6"
        required
      />
      <p v-if="errorMessage" class="auth-error" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage" class="auth-success" role="status">{{ successMessage }}</p>
      <button class="account-button" type="submit" :disabled="isLoading">
        {{ isLoading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar' }}
      </button>
      <button class="account-link" type="button" @click="isSignUp = !isSignUp">
        {{ isSignUp ? 'Já tenho uma conta' : 'Criar uma conta' }}
      </button>
    </form>
  </PageCard>
</template>

<style scoped>
.auth-form {
  display: grid;
  gap: 0.6rem;
  width: min(100%, 22rem);
  text-align: left;
}

.auth-form label {
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 600;
}

.auth-form input {
  min-height: 2.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.5rem;
  background: var(--glass-bg-raised);
  color: var(--color-text);
  font: inherit;
}

.account-button {
  min-height: 2.75rem;
  margin-top: 0.5rem;
  padding: 0 1.25rem;
  border: 0;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.account-button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.account-link {
  border: 0;
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  cursor: pointer;
}

.auth-error {
  color: #dc2626;
  font-size: 0.9rem;
}

.auth-success {
  color: #15803d;
  font-size: 0.9rem;
}
</style>
