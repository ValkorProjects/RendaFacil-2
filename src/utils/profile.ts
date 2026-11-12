import type { User } from '@supabase/supabase-js'

export interface ProfileFields {
  name: string
  email: string
}

export function readProfile(user: User | null): ProfileFields {
  const metadata = user?.user_metadata ?? {}
  const name = [metadata.full_name, metadata.name].find(
    (value) => typeof value === 'string' && value.trim(),
  )
  return { name: name ?? '', email: user?.email ?? '' }
}

export function normalizeProfile(profile: ProfileFields): ProfileFields {
  return {
    name: profile.name.trim(),
    email: profile.email.trim(),
  }
}

export function validateProfile(profile: ProfileFields, requireEmail = true): string | null {
  const { name, email } = normalizeProfile(profile)
  if (!name || name.length > 100) return 'Informe seu nome com até 100 caracteres.'
  if (
    (requireEmail || email) &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  ) {
    return 'Informe um e-mail válido.'
  }
  return null
}

export function authErrorMessage(error: unknown): string {
  const record =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null

  const getText = (key: string): string => {
    const value = record?.[key]
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
  }

  const name = getText('name')
  const codes = [getText('code'), getText('error_code')]
  const message = [getText('message'), getText('error_description')].join(' ')

  if (
    name === 'typeerror' ||
    name === 'authretryablefetcherror' ||
    message.includes('failed to fetch')
  ) {
    return 'Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.'
  }

  if (
    codes.includes('over_email_send_rate_limit') ||
    codes.includes('over_request_rate_limit') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('email rate limit')
  ) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
  }

  if (codes.includes('same_password')) {
    return 'Escolha uma senha diferente da atual.'
  }

  if (codes.includes('reauthentication_needed') || codes.includes('reauthentication_not_valid')) {
    return 'Entre novamente na sua conta e tente trocar a senha.'
  }

  // Link de confirmação ou de recuperação vencido ou já usado (volta na URL do app).
  if (codes.includes('otp_expired')) {
    return 'Este link expirou ou já foi usado. Peça um novo em “Esqueci minha senha” ou “Reenviar confirmação de e-mail”.'
  }

  if (
    codes.includes('user_not_found') ||
    codes.includes('bad_jwt') ||
    codes.includes('session_not_found') ||
    codes.includes('refresh_token_not_found')
  ) {
    return 'Sua sessão expirou. Entre novamente para continuar.'
  }

  if (codes.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos. Confira os dados e tente novamente.'
  }

  if (codes.includes('email_not_confirmed')) {
    return 'Confirme seu e-mail pelo link recebido antes de entrar.'
  }

  if (codes.includes('user_already_exists') || codes.includes('email_exists')) {
    return 'Não foi possível usar esse e-mail. Tente entrar na sua conta.'
  }

  if (codes.includes('weak_password')) {
    return 'Escolha uma senha mais forte, com letras, números e símbolos.'
  }

  return 'Não foi possível concluir a solicitação. Tente novamente mais tarde.'
}

export interface AuthRedirectNotice {
  kind: 'error' | 'success'
  message: string
}

// Resultado de um link de e-mail do Supabase (confirmação ou recuperação de senha), lido da URL
// para onde o link volta. O erro vem no hash (fluxo implícito) ou na query (fluxo PKCE).
export function readAuthRedirect(url: string): AuthRedirectNotice | null {
  const { hash, search } = new URL(url)
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  new URLSearchParams(search).forEach((value, key) => {
    if (!params.has(key)) params.set(key, value)
  })

  const errorCode = params.get('error_code') ?? params.get('error')
  if (errorCode) {
    return {
      kind: 'error',
      message: authErrorMessage({
        error_code: errorCode,
        error_description: params.get('error_description') ?? '',
      }),
    }
  }
  if (params.get('type') === 'signup' && params.has('access_token')) {
    return { kind: 'success', message: 'Seu e-mail foi confirmado.' }
  }
  return null
}

export function validatePasswordChange(current: string, password: string, confirmation: string) {
  if (!current) return 'Informe sua senha atual.'
  if (password.length < 8) return 'Crie uma senha com pelo menos 8 caracteres.'
  if (password === current) return 'Escolha uma senha diferente da atual.'
  if (password !== confirmation) return 'A confirmação da senha não corresponde à nova senha.'
  return null
}
