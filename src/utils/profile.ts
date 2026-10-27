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
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
  switch (code) {
    case 'same_password':
      return 'Escolha uma senha diferente da atual.'
    case 'reauthentication_needed':
    case 'reauthentication_not_valid':
      return 'Entre novamente na sua conta e tente trocar a senha.'
    case 'user_not_found':
    case 'bad_jwt':
      return 'Sua sessão expirou. Entre novamente para continuar.'
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos. Confira os dados e tente novamente.'
    case 'email_not_confirmed':
      return 'Confirme seu e-mail pelo link recebido antes de entrar.'
    case 'user_already_exists':
    case 'email_exists':
      return 'Não foi possível usar esse e-mail. Tente entrar na sua conta.'
    case 'weak_password':
      return 'Escolha uma senha mais forte, com letras, números e símbolos.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'Sua sessão expirou. Entre novamente para continuar.'
    default:
      return 'Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente.'
  }
}

export function validatePasswordChange(current: string, password: string, confirmation: string) {
  if (!current) return 'Informe sua senha atual.'
  if (password.length < 8) return 'Crie uma senha com pelo menos 8 caracteres.'
  if (password === current) return 'Escolha uma senha diferente da atual.'
  if (password !== confirmation) return 'A confirmação da senha não corresponde à nova senha.'
  return null
}
