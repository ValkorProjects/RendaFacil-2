import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  normalizeProfile,
  validateProfile,
  validatePasswordChange,
  type ProfileFields,
} from '@/utils/profile'
import { useIncomeStore } from '@/stores/income'

export const useAuthStore = defineStore('auth', () => {
  const income = useIncomeStore()
  const session = shallowRef<Session | null>(null)
  const ready = ref(!isSupabaseConfigured)
  const user = computed(() => session.value?.user ?? null)
  const isGuest = computed(() => !user.value || Boolean(user.value.is_anonymous))

  const profileRedirectUrl = () =>
    new URL(`${import.meta.env.BASE_URL}user`, window.location.origin).href

  // Fires once with the persisted session, then again on every sign-in/out.
  if (isSupabaseConfigured) {
    const { data } = getSupabase().auth.onAuthStateChange((_event, newSession) => {
      if (session.value?.user.id && session.value.user.id !== newSession?.user.id) {
        income.clearAccountData()
      }
      session.value = newSession
      ready.value = true
    })
    onScopeDispose(() => data.subscription.unsubscribe())
  }

  async function signIn(email: string, password: string) {
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }

  async function signUp(fields: ProfileFields, password: string) {
    const validationError = validateProfile(fields)
    if (validationError) throw new Error(validationError)
    const profile = normalizeProfile(fields)
    const { data, error } = await getSupabase().auth.signUp({
      email: profile.email,
      password,
      options: {
        emailRedirectTo: profileRedirectUrl(),
        data: { full_name: profile.name, phone: profile.phone },
      },
    })
    if (error) throw error
    return { needsConfirmation: !data.session }
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
        data: { full_name: profile.name, phone: profile.phone },
        ...(emailChanged ? { email: profile.email } : {}),
      },
      { emailRedirectTo: profileRedirectUrl() },
    )
    if (error) throw error
    return { emailConfirmationPending: Boolean(data.user.new_email) }
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
      throw new Error('Conta alterada.')
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
    isGuest,
    signIn,
    signUp,
    updateProfile,
    changePassword,
    deleteAccount,
    signOut,
  }
})
