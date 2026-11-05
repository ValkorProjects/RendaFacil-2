// Keep this version aligned with the signup validation in the database migration.
export const PRIVACY_POLICY_VERSION = '2026-11-05'
export const PRIVACY_CONSENT_TEXT =
  'Li a política de privacidade e autorizo o uso dos meus dados, inclusive despesas de saúde, para calcular a estimativa do meu Imposto de Renda.'
export const PRIVACY_CONSENT_REQUIRED =
  'Leia a política de privacidade e marque a autorização para criar sua conta.'

export function requirePrivacyConsent(accepted: boolean) {
  if (accepted !== true) {
    throw new Error(PRIVACY_CONSENT_REQUIRED)
  }
}
