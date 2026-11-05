<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PageCard from '@/components/PageCard.vue'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { dependentIncomeLabels, useIncomeStore } from '@/stores/income'
import { cents, formatCurrency } from '@/utils/currency'
import { PRIVACY_CONSENT_REQUIRED, PRIVACY_CONSENT_TEXT } from '@/utils/privacy'
import {
  authErrorMessage,
  formatPhone,
  readProfile,
  validateProfile,
  validatePasswordChange,
} from '@/utils/profile'

const auth = useAuthStore()
const income = useIncomeStore()
const dependents = computed(() =>
  income.registrations.flatMap((registration, registrationIndex) =>
    registration.dependents.map((dependent) => ({
      ...dependent,
      key: `${registration.id}-${dependent.id}`,
      registrationNumber: registrationIndex + 1,
    })),
  ),
)
const { user, ready, isGuest, initializationError, recoveryPending } = storeToRefs(auth)
const profile = computed(() => readProfile(user.value))
const displayName = computed(() => profile.value.name || 'Minha conta')
const initials = computed(() =>
  displayName.value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('pt-BR'),
)
const pendingEmail = computed(() =>
  user.value?.new_email !== user.value?.email ? user.value?.new_email : '',
)
const draft = reactive({ name: '', email: '', phone: '' })
const access = reactive({ name: '', email: '', phone: '', password: '', confirmation: '' })
const accessMode = ref<'signin' | 'signup' | 'forgot'>('signin')
const privacyAccepted = ref(false)
const editing = ref(false)
const busy = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const password = reactive({ current: '', next: '', confirmation: '' })
const changingPassword = ref(false)
const passwordError = ref('')
const passwordDialog = ref<HTMLDialogElement | null>(null)
const resetPasswordDialog = ref<HTMLDialogElement | null>(null)
const resetPassword = reactive({ next: '', confirmation: '' })
const resettingPassword = ref(false)
const deleting = ref(false)
const deleteError = ref('')
const deleteConfirmation = ref('')
const deleteDialog = ref<HTMLDialogElement | null>(null)

function clearPassword() {
  Object.assign(password, { current: '', next: '', confirmation: '' })
  passwordError.value = ''
}

function clearResetPassword() {
  Object.assign(resetPassword, { next: '', confirmation: '' })
}

function openResetPasswordDialog() {
  clearMessages()
  clearResetPassword()
  resetPasswordDialog.value?.showModal()
}

async function submitResetPassword() {
  if (busy.value) return
  clearMessages()
  resettingPassword.value = true
  busy.value = true
  try {
    await auth.resetPassword(resetPassword.next, resetPassword.confirmation)
    resetPasswordDialog.value?.close()
    successMessage.value = 'Sua senha foi redefinida com sucesso.'
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    clearResetPassword()
    resettingPassword.value = false
    busy.value = false
  }
}

function openPasswordDialog() {
  if (busy.value) return
  clearMessages()
  clearPassword()
  passwordDialog.value?.showModal()
}

async function resendConfirmation() {
  if (busy.value) return
  clearMessages()
  const validationError = validateProfile({ name: 'Login', email: access.email, phone: '' })
  if (validationError) {
    errorMessage.value = validationError
    return
  }
  busy.value = true
  try {
    await auth.resendConfirmation(access.email)
    successMessage.value = 'Um novo link de confirmação foi enviado para seu e-mail.'
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    busy.value = false
  }
}

async function changePassword() {
  if (busy.value) return
  clearMessages()
  passwordError.value = ''
  const validationError = validatePasswordChange(
    password.current,
    password.next,
    password.confirmation,
  )
  if (validationError) {
    passwordError.value = validationError
    return
  }
  const accountId = user.value?.id
  busy.value = true
  changingPassword.value = true
  try {
    await auth.changePassword(password.current, password.next, password.confirmation)
    if (user.value?.id === accountId) {
      passwordDialog.value?.close()
      successMessage.value = 'Sua senha foi alterada com sucesso.'
    }
  } catch (error) {
    if (user.value?.id === accountId) passwordError.value = authErrorMessage(error)
  } finally {
    Object.assign(password, { current: '', next: '', confirmation: '' })
    busy.value = false
    changingPassword.value = false
  }
}

function openDeleteDialog() {
  if (busy.value) return
  deleteError.value = ''
  deleteConfirmation.value = ''
  deleteDialog.value?.showModal()
}

async function deleteAccount() {
  if (busy.value) return
  busy.value = true
  deleting.value = true
  deleteError.value = ''
  deleteConfirmation.value = ''
  clearMessages()
  try {
    await auth.deleteAccount()
    deleteDialog.value?.close()
    accessMode.value = 'signin'
    successMessage.value = 'Sua conta foi excluída.'
  } catch {
    deleteError.value =
      'Não foi possível concluir a exclusão. Verifique sua conexão e tente novamente. Se o problema continuar, entre novamente na conta.'
  } finally {
    busy.value = false
    deleting.value = false
  }
}

function clearMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

// Clear private form data when the account changes, including sign-out in another tab.
watch(
  () => user.value?.id,
  () => {
    clearPassword()
    passwordDialog.value?.close()
    deleteDialog.value?.close()
    deleteError.value = ''
    editing.value = false
    Object.assign(draft, { name: '', email: '', phone: '' })
    Object.assign(access, { name: '', email: '', phone: '', password: '' })
    privacyAccepted.value = false
    clearMessages()
  },
)

function changeAccessMode(mode: 'signin' | 'signup') {
  privacyAccepted.value = false
  accessMode.value = mode
  access.password = ''
  access.confirmation = ''
  clearMessages()
}

function startEditing() {
  Object.assign(draft, profile.value, { email: pendingEmail.value || profile.value.email })
  clearMessages()
  editing.value = true
}

function cancelEditing() {
  Object.assign(draft, { name: '', email: '', phone: '' })
  editing.value = false
  clearMessages()
}

async function saveProfile() {
  if (busy.value) return
  clearMessages()
  const validationError = validateProfile(draft, Boolean(profile.value.email))
  if (validationError) {
    errorMessage.value = validationError
    return
  }
  const accountId = user.value?.id
  busy.value = true
  try {
    const result = await auth.updateProfile(draft)
    if (user.value?.id !== accountId) return
    editing.value = false
    successMessage.value = result.emailConfirmationPending
      ? 'Dados salvos. Confira as instruções enviadas por e-mail para confirmar a alteração do endereço.'
      : 'Seus dados foram atualizados com sucesso.'
  } catch (error) {
    if (user.value?.id === accountId) errorMessage.value = authErrorMessage(error)
  } finally {
    busy.value = false
  }
}

async function submitAccess() {
  if (busy.value || !isSupabaseConfigured) return
  clearMessages()
  const signingUp = accessMode.value === 'signup'
  const requestingReset = accessMode.value === 'forgot'
  const validationError = validateProfile(
    signingUp ? access : { name: 'Login', email: access.email, phone: '' },
  )
  if (validationError) {
    errorMessage.value = validationError
    return
  }
  if (requestingReset) {
    busy.value = true
    try {
      await auth.requestPasswordReset(access.email)
      successMessage.value = 'Confira seu e-mail para redefinir sua senha.'
      accessMode.value = 'signin'
    } catch (error) {
      errorMessage.value = authErrorMessage(error)
    } finally {
      busy.value = false
    }
    return
  }
  if (!access.password || (signingUp && access.password.length < 8)) {
    errorMessage.value = signingUp
      ? 'Crie uma senha com pelo menos 8 caracteres.'
      : 'Informe sua senha para entrar.'
    return
  }
  if (signingUp && access.password !== access.confirmation) {
    errorMessage.value = 'A confirmação da senha não corresponde.'
    return
  }
  if (signingUp && !privacyAccepted.value) {
    errorMessage.value = PRIVACY_CONSENT_REQUIRED
    return
  }
  busy.value = true
  try {
    if (signingUp) {
      const result = await auth.signUp(access, access.password, privacyAccepted.value)
      privacyAccepted.value = false
      if (result.needsConfirmation) {
        successMessage.value =
          'Confira seu e-mail para confirmar o cadastro. Se você já tem uma conta, use a opção Entrar.'
        accessMode.value = 'signin'
      }
    } else {
      await auth.signIn(access.email, access.password)
    }
    access.password = ''
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    busy.value = false
  }
}

async function signOut() {
  if (busy.value) return
  clearMessages()
  busy.value = true
  try {
    await auth.signOut()
    cancelEditing()
    accessMode.value = 'signin'
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PageCard eyebrow="Sua conta" title="Meu perfil">
    <p class="intro">Gerencie seus dados, dependentes e a segurança da sua conta.</p>

    <p v-if="!ready" class="notice" role="status">Carregando seu perfil…</p>

    <div v-else class="account-content" :aria-busy="busy">
      <section class="profile-summary" aria-label="Identificação do usuário">
        <div class="avatar" aria-hidden="true">
          <AppIcon v-if="isGuest" name="user" />
          <span v-else>{{ initials }}</span>
        </div>
        <div class="identity">
          <span class="account-badge">{{ isGuest ? 'Visitante' : 'Conta cadastrada' }}</span>
          <h2>{{ isGuest ? 'Entre para continuar' : displayName }}</h2>
          <p v-if="isGuest">Faça login ou crie sua conta para acessar o aplicativo.</p>
          <p v-else>{{ profile.email || 'E-mail não informado' }}</p>
        </div>
      </section>

      <p v-if="errorMessage" class="notice notice-error" role="alert">{{ errorMessage }}</p>
      <p v-if="initializationError" class="notice notice-error" role="alert">
        Não foi possível verificar sua sessão. {{ initializationError }}
      </p>
      <p v-if="successMessage" class="notice notice-success" role="status">
        {{ successMessage }}
      </p>

      <template v-if="!isGuest">
        <p v-if="pendingEmail" class="notice" role="status">
          Aguardando confirmação de <strong>{{ pendingEmail }}</strong
          >. Seu e-mail atual continua sendo usado até a confirmação.
        </p>

        <section class="details-panel" aria-labelledby="details-title">
          <div class="section-heading">
            <div>
              <h2 id="details-title">Dados pessoais</h2>
              <p>Mantenha suas informações atualizadas.</p>
            </div>
            <button
              v-if="!editing"
              type="button"
              class="text-button"
              :disabled="busy"
              @click="startEditing"
            >
              Editar perfil
            </button>
          </div>

          <form v-if="editing" novalidate @submit.prevent="saveProfile">
            <fieldset :disabled="busy" class="fields">
              <legend class="sr-only">Editar dados pessoais</legend>
              <label class="field" for="profile-name">
                Nome
                <input
                  id="profile-name"
                  v-model="draft.name"
                  name="name"
                  autocomplete="name"
                  maxlength="100"
                  required
                />
              </label>
              <label class="field" for="profile-email">
                E-mail
                <input
                  id="profile-email"
                  v-model="draft.email"
                  name="email"
                  type="email"
                  autocomplete="email"
                  maxlength="254"
                  :required="Boolean(profile.email)"
                  aria-describedby="email-help"
                />
              </label>
              <p id="email-help" class="field-help">
                Ao alterar seu e-mail, siga as instruções de confirmação enviadas aos endereços
                envolvidos.
              </p>
              <label class="field" for="profile-phone">
                Telefone <span class="optional">(opcional)</span>
                <input
                  id="profile-phone"
                  v-model="draft.phone"
                  name="tel"
                  type="tel"
                  autocomplete="tel"
                  placeholder="(11) 99999-9999"
                  maxlength="25"
                  aria-describedby="phone-help"
                />
              </label>
              <p id="phone-help" class="field-help">
                Inclua o DDD. Para remover o telefone, deixe o campo vazio.
              </p>
              <div class="form-actions">
                <button type="submit" class="button">
                  {{ busy ? 'Salvando…' : 'Salvar alterações' }}
                </button>
                <button type="button" class="secondary-button" @click="cancelEditing">
                  Cancelar
                </button>
              </div>
            </fieldset>
          </form>

          <dl v-else class="profile-details">
            <div>
              <dt>Nome</dt>
              <dd>{{ profile.name || 'Não informado' }}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{{ profile.email || 'Não informado' }}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{{ profile.phone ? formatPhone(profile.phone) : 'Não informado' }}</dd>
            </div>
          </dl>
        </section>

        <button
          type="button"
          class="secondary-button password-trigger"
          aria-haspopup="dialog"
          aria-controls="password-dialog"
          :disabled="busy"
          @click="openPasswordDialog"
        >
          Trocar senha
        </button>

        <dialog
          id="password-dialog"
          ref="passwordDialog"
          class="account-dialog password-dialog"
          aria-labelledby="security-title"
          aria-describedby="security-description"
          :aria-busy="changingPassword"
          @cancel="changingPassword && $event.preventDefault()"
          @keydown.esc.prevent="!changingPassword && passwordDialog?.close()"
          @close="clearPassword"
        >
          <div class="section-heading">
            <div>
              <h2 id="security-title">Trocar senha</h2>
              <p id="security-description">Use uma senha exclusiva para proteger sua conta.</p>
            </div>
          </div>
          <form novalidate @submit.prevent="changePassword">
            <fieldset class="fields" :disabled="busy">
              <legend class="sr-only">Alterar senha de acesso</legend>
              <p v-if="passwordError" class="notice notice-error" role="alert">
                {{ passwordError }}
              </p>
              <label class="field" for="current-password">
                Senha atual
                <input
                  id="current-password"
                  v-model="password.current"
                  type="password"
                  autocomplete="current-password"
                  autofocus
                  required
                />
              </label>
              <label class="field" for="new-password">
                Nova senha
                <input
                  id="new-password"
                  v-model="password.next"
                  type="password"
                  autocomplete="new-password"
                  minlength="8"
                  aria-describedby="new-password-help"
                  required
                />
              </label>
              <p id="new-password-help" class="field-help">
                Use pelo menos 8 caracteres e uma senha diferente da atual.
              </p>
              <label class="field" for="confirm-password">
                Confirmar nova senha
                <input
                  id="confirm-password"
                  v-model="password.confirmation"
                  type="password"
                  autocomplete="new-password"
                  minlength="8"
                  required
                />
              </label>
              <button type="submit" class="button">
                {{ changingPassword ? 'Alterando senha…' : 'Salvar nova senha' }}
              </button>
              <button type="button" class="secondary-button" @click="passwordDialog?.close()">
                Cancelar
              </button>
            </fieldset>
          </form>
        </dialog>
        <dialog
          v-if="recoveryPending"
          ref="resetPasswordDialog"
          open
          class="account-dialog password-dialog"
          aria-labelledby="reset-title"
        >
          <h2 id="reset-title">Defina uma nova senha</h2>
          <p>Escolha uma senha nova para voltar a acessar sua conta.</p>
          <form novalidate @submit.prevent="submitResetPassword">
            <fieldset class="fields" :disabled="busy">
              <label class="field" for="reset-password">
                Nova senha
                <input
                  id="reset-password"
                  v-model="resetPassword.next"
                  type="password"
                  minlength="8"
                  required
                />
              </label>
              <label class="field" for="reset-password-confirmation">
                Confirmar nova senha
                <input
                  id="reset-password-confirmation"
                  v-model="resetPassword.confirmation"
                  type="password"
                  minlength="8"
                  required
                />
              </label>
              <p v-if="errorMessage" class="notice notice-error" role="alert">
                {{ errorMessage }}
              </p>
              <button type="submit" class="button">
                {{ resettingPassword ? 'Salvando…' : 'Salvar nova senha' }}
              </button>
            </fieldset>
          </form>
        </dialog>
      </template>

      <template v-else>
        <section class="details-panel" aria-labelledby="access-title">
          <div class="section-heading">
            <div>
              <h2 id="access-title">
                {{
                  accessMode === 'signin'
                    ? 'Acesse sua conta'
                    : accessMode === 'signup'
                      ? 'Crie sua conta'
                      : 'Recupere sua senha'
                }}
              </h2>
              <p>Entre ou cadastre-se para salvar e editar seus dados pessoais.</p>
            </div>
          </div>

          <template v-if="isSupabaseConfigured">
            <div class="access-switch" role="group" aria-label="Forma de acesso">
              <button
                type="button"
                :aria-pressed="accessMode === 'signin'"
                :disabled="busy"
                @click="changeAccessMode('signin')"
              >
                Entrar
              </button>
              <button
                type="button"
                :aria-pressed="accessMode === 'signup'"
                :disabled="busy"
                @click="changeAccessMode('signup')"
              >
                Criar conta
              </button>
            </div>

            <form novalidate @submit.prevent="submitAccess">
              <fieldset :disabled="busy" class="fields">
                <legend class="sr-only">
                  {{
                    accessMode === 'signin'
                      ? 'Entrar na conta'
                      : accessMode === 'signup'
                        ? 'Cadastro'
                        : 'Recuperação de senha'
                  }}
                </legend>
                <label v-if="accessMode === 'signup'" class="field" for="access-name">
                  Nome
                  <input
                    id="access-name"
                    v-model="access.name"
                    name="name"
                    autocomplete="name"
                    maxlength="100"
                    required
                  />
                </label>
                <label class="field" for="access-email">
                  E-mail
                  <input
                    id="access-email"
                    v-model="access.email"
                    name="email"
                    type="email"
                    autocomplete="email"
                    maxlength="254"
                    placeholder="voce@exemplo.com"
                    required
                  />
                </label>
                <label v-if="accessMode === 'signup'" class="field" for="access-phone">
                  Telefone <span class="optional">(opcional)</span>
                  <input
                    id="access-phone"
                    v-model="access.phone"
                    name="tel"
                    type="tel"
                    autocomplete="tel"
                    placeholder="(11) 99999-9999"
                    maxlength="25"
                  />
                </label>
                <label v-if="accessMode !== 'forgot'" class="field" for="access-password">
                  Senha
                  <input
                    id="access-password"
                    v-model="access.password"
                    name="password"
                    type="password"
                    :autocomplete="accessMode === 'signin' ? 'current-password' : 'new-password'"
                    :minlength="accessMode === 'signup' ? 8 : undefined"
                    :aria-describedby="accessMode === 'signup' ? 'password-help' : undefined"
                    required
                  />
                </label>
                <label
                  v-if="accessMode === 'signup'"
                  class="field"
                  for="access-password-confirmation"
                >
                  Confirmar senha
                  <input
                    id="access-password-confirmation"
                    v-model="access.confirmation"
                    type="password"
                    autocomplete="new-password"
                    minlength="8"
                    required
                  />
                </label>
                <p v-if="accessMode === 'signup'" id="password-help" class="field-help">
                  Use pelo menos 8 caracteres.
                </p>
                <div v-if="accessMode === 'signup'" class="privacy-consent">
                  <label for="privacy-consent" class="privacy-consent-label">
                    <input
                      id="privacy-consent"
                      v-model="privacyAccepted"
                      name="privacy-consent"
                      type="checkbox"
                      required
                    />
                    <span>{{ PRIVACY_CONSENT_TEXT }}</span>
                  </label>
                  <RouterLink to="/privacidade" target="_blank" rel="noopener">
                    Ler política de privacidade (abre em nova aba)
                  </RouterLink>
                </div>
                <button type="submit" class="button access-submit">
                  {{
                    busy
                      ? 'Aguarde…'
                      : accessMode === 'signin'
                        ? 'Entrar na conta'
                        : accessMode === 'signup'
                          ? 'Criar minha conta'
                          : 'Enviar link de recuperação'
                  }}
                </button>
              </fieldset>
            </form>
            <div v-if="accessMode === 'signin'" class="access-links">
              <button
                type="button"
                class="text-button"
                :disabled="busy"
                @click="accessMode = 'forgot'"
              >
                Esqueci minha senha
              </button>
              <button
                type="button"
                class="text-button"
                :disabled="busy"
                @click="resendConfirmation"
              >
                Reenviar confirmação de e-mail
              </button>
            </div>
            <button
              v-else
              type="button"
              class="text-button"
              :disabled="busy"
              @click="changeAccessMode('signin')"
            >
              Voltar para entrar
            </button>
          </template>
          <p v-else class="notice">
            O acesso e o cadastro de contas estão indisponíveis no momento. Tente novamente mais
            tarde.
          </p>
        </section>
      </template>

      <section class="details-panel" aria-labelledby="profile-dependents-title">
        <div class="section-heading">
          <div>
            <h2 id="profile-dependents-title">
              Meus dependentes <span class="account-badge">{{ dependents.length }}</span>
            </h2>
            <p>Dependentes informados no cadastro de rendimentos desta sessão.</p>
          </div>
          <RouterLink :to="{ name: 'income' }" class="text-button"
            >Gerenciar dependentes</RouterLink
          >
        </div>
        <ul v-if="dependents.length" class="dependent-list">
          <li v-for="(dependent, index) in dependents" :key="dependent.key" class="dependent-item">
            <div>
              <h3>Dependente {{ index + 1 }}</h3>
              <p>{{ dependentIncomeLabels[dependent.incomeType] }}</p>
              <small>Cadastro de rendimentos {{ dependent.registrationNumber }}</small>
            </div>
            <strong v-if="dependent.incomeType !== 'none'"
              >{{ formatCurrency(cents(dependent.amount)) }}<small>por mês</small></strong
            >
          </li>
        </ul>
        <p v-else class="empty-state">
          Nenhum dependente cadastrado. Ao salvar seus dependentes na aba de rendimentos, eles
          aparecerão aqui.
        </p>
      </section>

      <section v-if="!isGuest" class="details-panel" aria-labelledby="account-actions-title">
        <div class="section-heading">
          <div>
            <h2 id="account-actions-title">Acesso à conta</h2>
            <p>Saia neste dispositivo ou exclua sua conta permanentemente.</p>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="secondary-button" :disabled="busy" @click="signOut">
            Sair da conta
          </button>
          <button type="button" class="danger-button" :disabled="busy" @click="openDeleteDialog">
            Excluir conta
          </button>
        </div>
      </section>
    </div>

    <dialog
      ref="deleteDialog"
      class="account-dialog delete-dialog"
      aria-labelledby="delete-title"
      aria-describedby="delete-description"
      :aria-busy="deleting"
      @cancel="deleting && $event.preventDefault()"
      @keydown.esc.prevent="!deleting && deleteDialog?.close()"
    >
      <h2 id="delete-title">Excluir sua conta?</h2>
      <p id="delete-description">
        Você realmente deseja excluir sua conta? Seu acesso e seus dados de perfil serão removidos
        permanentemente. Os rendimentos e dependentes desta sessão também serão apagados. Esta ação
        não pode ser desfeita.
      </p>
      <p v-if="deleteError" class="notice notice-error" role="alert">{{ deleteError }}</p>
      <p v-if="deleting" role="status">Excluindo sua conta…</p>
      <div class="form-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="deleting"
          autofocus
          @click="deleteDialog?.close()"
        >
          Cancelar
        </button>
        <label class="field delete-confirmation" for="delete-confirmation">
          Digite <strong>EXCLUIR</strong> para confirmar
          <input id="delete-confirmation" v-model="deleteConfirmation" autocomplete="off" />
        </label>
        <button
          type="button"
          class="danger-button danger-confirm"
          :disabled="busy || deleteConfirmation !== 'EXCLUIR'"
          @click="deleteAccount"
        >
          {{ deleting ? 'Excluindo…' : 'Sim, excluir minha conta' }}
        </button>
      </div>
    </dialog>
  </PageCard>
</template>

<style scoped>
.privacy-consent {
  display: grid;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: left;
}

.privacy-consent-label {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  cursor: pointer;
}

.privacy-consent-label input {
  flex: 0 0 auto;
  width: 1.125rem;
  height: 1.125rem;
  margin-top: 0.2rem;
  accent-color: var(--color-accent);
}

.intro {
  font-size: 1rem;
}

.account-content {
  display: grid;
  gap: 1.25rem;
  width: 100%;
  min-width: 0;
  text-align: left;
}

.profile-summary {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-block: 0.5rem;
}

.avatar {
  display: grid;
  flex: 0 0 4rem;
  place-items: center;
  width: 4rem;
  height: 4rem;
  border: 1px solid var(--glass-border);
  border-radius: 1.25rem;
  background: var(--glass-bg-raised);
  color: var(--color-accent);
  font-size: 1.375rem;
  font-weight: 700;
}

.avatar svg {
  width: 2rem;
  height: 2rem;
}

.identity {
  min-width: 0;
  overflow-wrap: anywhere;
}

.identity h2 {
  margin-top: 0.35rem;
  color: var(--color-text);
  font-size: 1.25rem;
  line-height: 1.3;
}

.identity p,
.section-heading p {
  margin-top: 0.25rem;
  font-size: 0.875rem;
}

.account-badge {
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  background: var(--glass-bg-raised);
  color: var(--color-accent);
  font-size: 0.75rem;
  font-weight: 700;
}

.details-panel {
  padding: 1.25rem;
  border: 1px solid var(--glass-border);
  border-radius: 1.25rem;
  background: var(--glass-bg);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.section-heading h2 {
  color: var(--color-text);
  font-size: 1.0625rem;
}

.profile-details {
  display: grid;
  gap: 1rem;
  margin: 0;
}

.profile-details div + div {
  padding-top: 1rem;
  border-top: 1px solid var(--glass-border);
}

.profile-details dt {
  font-size: 0.8125rem;
}

.profile-details dd {
  margin: 0.125rem 0 0;
  color: var(--color-text);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.fields {
  display: grid;
  gap: 1rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.field {
  display: block;
  color: var(--color-text);
  font-size: 0.875rem;
  font-weight: 600;
}

.optional {
  color: var(--color-text-muted);
  font-weight: 400;
}

.field input {
  display: block;
  width: 100%;
  min-height: 3rem;
  margin-top: 0.375rem;
  padding: 0.65rem 0.875rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  background: var(--glass-bg-raised);
  color: var(--color-text);
  font: inherit;
  font-size: 1rem;
  font-weight: 400;
}

.field input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.8;
}

.field-help {
  margin-top: -0.5rem;
  font-size: 0.8125rem;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.25rem;
}

.form-actions button {
  flex: 1 1 auto;
}

.secondary-button,
.text-button,
.access-switch button {
  min-height: 2.75rem;
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.secondary-button {
  background: var(--glass-bg-raised);
  color: var(--color-text);
}

.text-button {
  padding-inline: 0.25rem;
  text-underline-offset: 0.25rem;
}

.text-button:hover {
  text-decoration: underline;
}

.dependent-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.dependent-item {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-block: 1rem;
  overflow-wrap: anywhere;
}

.dependent-item + .dependent-item {
  border-top: 1px solid var(--glass-border);
}

.dependent-item h3 {
  color: var(--color-text);
  font-size: 0.95rem;
}

.dependent-item p,
.empty-state {
  font-size: 0.875rem;
}

.dependent-item small {
  display: block;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 400;
}

.danger-button {
  min-height: 2.75rem;
  padding: 0.65rem 1rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: #b42332;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.account-dialog {
  position: fixed;
  inset: 0;
  width: min(30rem, calc(100% - 2rem));
  max-height: calc(100dvh - 2rem);
  margin: auto;
  padding: 1.5rem;
  overflow-y: auto;
  border: 1px solid var(--glass-border);
  border-radius: 1.5rem;
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: 0 1.5rem 5rem #0004;
  text-align: left;
}

.account-dialog::backdrop {
  background: #10182899;
  backdrop-filter: blur(4px);
}

.password-trigger {
  width: 100%;
}

.password-dialog {
  width: min(34rem, calc(100% - 2rem));
  padding: 1.25rem;
  border-radius: 1.25rem;
  color: var(--color-text-muted);
}

.delete-dialog h2 {
  font-size: 1.25rem;
}

.delete-dialog p {
  margin-block: 1rem;
  font-size: 0.875rem;
}

.danger-confirm {
  background: #b42332;
  border-color: #b42332;
  color: white;
}

.access-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: var(--glass-bg);
}

.access-switch button[aria-pressed='true'] {
  background: var(--glass-bg-raised);
  color: var(--color-text);
  box-shadow: 0 2px 8px var(--glass-shadow);
}

.access-submit {
  width: 100%;
  margin-top: 0.25rem;
}

.notice {
  padding: 0.875rem 1rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.875rem;
  background: var(--glass-bg-raised);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.notice-error {
  color: #b42332;
  border-color: currentColor;
}

.notice-success {
  color: #14653d;
  border-color: currentColor;
}

button:disabled,
fieldset:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-color-scheme: dark) {
  .danger-button:not(.danger-confirm) {
    color: #ffb4bc;
  }
  .notice-error {
    color: #ffb4bc;
  }

  .notice-success {
    color: #8ae0b0;
  }
}

@media (max-width: 25rem) {
  .details-panel,
  .password-dialog {
    padding: 1rem;
  }

  .profile-summary {
    align-items: flex-start;
    gap: 0.75rem;
  }

  .avatar {
    flex-basis: 3rem;
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
  }
}
</style>
