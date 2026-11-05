import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const session = shallowRef<Session | null>(null)
  const user = computed(() => session.value?.user ?? null)

  const signIn = (email: string, password: string) =>
    getSupabase().auth.signInWithPassword({ email, password })

  const signUp = (email: string, password: string) =>
    getSupabase().auth.signUp({ email, password })

  const signOut = () => getSupabase().auth.signOut()

  // Fires once with the persisted session, then again on every sign-in/out.
  if (isSupabaseConfigured) {
    getSupabase().auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
    })
  }

  return { session, user, signIn, signUp, signOut }
})
