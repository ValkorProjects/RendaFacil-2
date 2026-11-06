import type { User } from '@supabase/supabase-js'

export interface ProfileFields {
  name: string
  email: string
  phone: string
}

export function readProfile(user: User | null): ProfileFields {
  const metadata = user?.user_metadata ?? {}
  const name = [metadata.full_name, metadata.name].find(
    (value) => typeof value === 'string' && value.trim(),
  )
  // An empty contact phone intentionally overrides a phone used for authentication.
  const phone = [metadata.phone, metadata.phone_number, user?.phone].find(
    (value) => typeof value === 'string',
  )

  return { name: name ?? '', email: user?.email ?? '', phone: phone ?? '' }
}

export function normalizeProfile(profile: ProfileFields): ProfileFields {
  return {
    name: profile.name.trim(),
    email: profile.email.trim(),
    phone: profile.phone.trim().replace(/[\s().-]/g, ''),
  }
}

export function validateProfile(profile: ProfileFields, requireEmail = true): string | null {
  const { name, email, phone } = normalizeProfile(profile)
  if (!name || name.length > 100) return 'Informe seu nome com até 100 caracteres.'
  if (
    (requireEmail || email) &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  ) {
    return 'Informe um e-mail válido.'
  }
  if (phone && !/^\+?\d{10,15}$/.test(phone)) {
    return 'Informe um telefone com DDD, entre 10 e 15 dígitos, ou deixe o campo vazio.'
  }
  return null
}

export function formatPhone(phone: string): string {
  const normalized = normalizeProfile({ name: '', email: '', phone }).phone
  const local = normalized.replace(/^\+55(?=\d{10,11}$)/, '')
  if (/^\d{10,11}$/.test(local)) {
    const prefix = normalized.startsWith('+55') ? '+55 ' : ''
    return `${prefix}(${local.slice(0, 2)}) ${local.slice(2, -4)}-${local.slice(-4)}`
  }
  return phone
}

export function authErrorMessage(error: unknown): string {
  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : null

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

  if (
    codes.includes('reauthentication_needed') ||
    codes.includes('reauthentication_not_valid')
  ) {
    return 'Entre novamente na sua conta e tente trocar a senha.'
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

  if (
    codes.includes('user_already_exists') ||
    codes.includes('email_exists')
  ) {
    return 'Não foi possível usar esse e-mail. Tente entrar na sua conta.'
  }

  if (codes.includes('weak_password')) {
    return 'Escolha uma senha mais forte, com letras, números e símbolos.'
  }

  return 'Não foi possível concluir a solicitação. Tente novamente mais tarde.'
}


export function validatePasswordChange(current: string, password: string, confirmation: string) {
  if (!current) return 'Informe sua senha atual.'
  if (password.length < 8) return 'Crie uma senha com pelo menos 8 caracteres.'
  if (password === current) return 'Escolha uma senha diferente da atual.'
  if (password !== confirmation) return 'A confirmação da senha não corresponde à nova senha.'
  return null
}
