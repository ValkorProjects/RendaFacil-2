import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  authErrorMessage,
  normalizeProfile,
  validateProfile,
  validatePasswordChange,
  type ProfileFields,
} from '@/utils/profile'
import { useIncomeStore } from '@/stores/income'

export const CONSENT_VERSION = '2026-11-06'

export const useAuthStore = defineStore('auth', () => {
  const income = useIncomeStore()
  const session = shallowRef<Session | null>(null)
  const ready = ref(!isSupabaseConfigured)
  const initializationError = ref('')
  const recoveryPending = ref(false)
  const user = computed(() => session.value?.user ?? null)
  const isGuest = computed(() => !user.value || Boolean(user.value.is_anonymous))

  const profileRedirectUrl = () =>
    new URL(`${import.meta.env.BASE_URL}user`, window.location.origin).href

  const signIn = (email: string, password: string) =>
    getSupabase().auth.signInWithPassword({ email, password })

  const signUp = (email: string, password: string) =>
    getSupabase().auth.signUp({ email, password })

  const signOut = () => getSupabase().auth.signOut()

  // Fires once with the persisted session, then again on every sign-in/out.
  if (isSupabaseConfigured) {
    try {
      const client = getSupabase()
      const { data } = client.auth.onAuthStateChange((event, newSession) => {
        if (session.value?.user.id && session.value.user.id !== newSession?.user.id) {
          income.clearAccountData()
        }
        session.value = newSession
        recoveryPending.value = event === 'PASSWORD_RECOVERY'
        initializationError.value = ''
        ready.value = true
      })
      void client.auth
        .getSession()
        .then(({ data: sessionData, error }) => {
          if (error) throw error
          if (!session.value) session.value = sessionData.session
          ready.value = true
        })
        .catch((error: unknown) => {
          initializationError.value = authErrorMessage(error)
          ready.value = true
        })
      onScopeDispose(() => data.subscription.unsubscribe())
    } catch (error: unknown) {
      initializationError.value = authErrorMessage(error)
      ready.value = true
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }

  async function signUp(fields: ProfileFields, password: string, consentAccepted: boolean) {
    if (!consentAccepted) throw new Error('Aceite a política de privacidade para criar sua conta.')
    const validationError = validateProfile(fields)
    if (validationError) throw new Error(validationError)
    const profile = normalizeProfile(fields)
    const { data, error } = await getSupabase().auth.signUp({
      email: profile.email,
      password,
      options: {
        emailRedirectTo: profileRedirectUrl(),
        data: {
          full_name: profile.name,
          consentimento_versao: CONSENT_VERSION,
          consentimento_em: new Date().toISOString(),
        },
      },
    })
    if (error) throw error
    return { needsConfirmation: !data.session }
  }

  async function resendConfirmation(email: string) {
    const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim() })
    if (error) throw error
  }

  async function requestPasswordReset(email: string) {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: profileRedirectUrl(),
    })
    if (error) throw error
  }

  async function resetPassword(password: string, confirmation: string) {
    if (password.length < 8) throw new Error('Crie uma senha com pelo menos 8 caracteres.')
    if (password !== confirmation) throw new Error('A confirmação da senha não corresponde.')
    const { error } = await getSupabase().auth.updateUser({ password })
    if (error) throw error
    recoveryPending.value = false
  }

  async function updateProfile(fields: ProfileFields) {
    if (isGuest.value) throw new Error('Entre na sua conta para editar seus dados.')
    const validationError = validateProfile(fields, Boolean(user.value?.email))
    if (validationError) throw new Error(validationError)
    const profile = normalizeProfile(fields)
    const emailChanged =
      Boolean(profile.email) &&
      profile.email !== user.value?.email &&
      profile.email !== user.value?.new_email
    const { data, error } = await getSupabase().auth.updateUser(
      {
        data: { full_name: profile.name },
        ...(emailChanged ? { email: profile.email } : {}),
      },
      { emailRedirectTo: profileRedirectUrl() },
    )
    if (error) throw error
    return { emailConfirmationPending: Boolean(data?.user?.new_email) }
  }

  async function signOut() {
    const { error } = await getSupabase().auth.signOut({ scope: 'local' })
    if (error) throw error
  }

  async function changePassword(current: string, password: string, confirmation: string) {
    if (isGuest.value || !user.value?.email)
      throw new Error('Entre na sua conta para trocar a senha.')
    const validationError = validatePasswordChange(current, password, confirmation)
    if (validationError) throw new Error(validationError)
    const accountId = user.value.id
    const client = getSupabase()
    // Verify the current password and establish a recent session for secure password changes.
    const { data, error: verificationError } = await client.auth.signInWithPassword({
      email: user.value.email,
      password: current,
    })
    if (verificationError) throw verificationError
    if (data.user.id !== accountId || user.value?.id !== accountId)
      throw new Error('Conta Incorreta')
    const { error } = await client.auth.updateUser({ password, current_password: current })
    if (error) throw error
  }

  async function deleteAccount() {
    if (isGuest.value) throw new Error('Entre na sua conta para excluí-la.')
    const accountId = user.value?.id
    const { data, error } = await getSupabase().functions.invoke('delete-account', { body: {} })
    if (error) throw error
    if (data?.deleted !== true) throw new Error('A exclusão não foi confirmada.')
    // A different account may have signed in through another tab while the request ran.
    if (user.value?.id !== accountId) return
    await signOut()
    income.clearAccountData()
  }

  return {
    session,
    user,
    ready,
    initializationError,
    isGuest,
    signIn,
    signUp,
    updateProfile,
    changePassword,
    deleteAccount,
    signOut,
    resendConfirmation,
    requestPasswordReset,
    resetPassword,
    recoveryPending,
  }
})
