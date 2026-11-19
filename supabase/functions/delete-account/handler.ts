interface AccountAdmin {
  getUser(token: string): Promise<{
    data: { user: { id: string; is_anonymous?: boolean } | null }
    error: unknown
  }>
  admin: {
    signOut(token: string, scope: 'global'): Promise<{ error: unknown }>
    deleteUser(id: string): Promise<{ error: unknown }>
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (body: object, status: number) =>
  Response.json(body, { status, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } })

export async function handleDeleteAccount(request: Request, auth: AccountAdmin) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405)

  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return reply({ error: 'Entre na sua conta para continuar.' }, 401)

  try {
    // Validate with Auth, not just the JWT signature: a deleted user must not be accepted.
    const { data, error } = await auth.getUser(token)
    if (error || !data.user || data.user.is_anonymous) {
      return reply({ error: 'Sessão inválida. Entre novamente na sua conta.' }, 401)
    }

    // Revoke refresh sessions before deletion. Existing JWTs expire naturally.
    const { error: signOutError } = await auth.admin.signOut(token, 'global')
    if (signOutError) return reply({ error: 'Não foi possível encerrar as sessões da conta.' }, 500)

    // Never accept a target user ID from the request body or user-editable metadata.
    const { error: deleteError } = await auth.admin.deleteUser(data.user.id)
    if (deleteError)
      return reply(
        { error: 'Não foi possível excluir a conta. Entre novamente para tentar de novo.' },
        500,
      )

    return reply({ deleted: true }, 200)
  } catch {
    return reply({ error: 'Não foi possível concluir a exclusão.' }, 500)
  }
}
