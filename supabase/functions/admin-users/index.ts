import { createClient } from '@supabase/supabase-js'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return reply({ ok: true })
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    if (authError || !auth.user) return reply({ error: 'Your session has expired.' }, 401)
    const body = await req.json()
    const { data: allowed, error: permissionError } = await admin.rpc('is_super_admin', { check_user_id: auth.user.id })
    if (permissionError || !allowed) return reply({ error: 'Only the protected Super admin role can manage staff users.' }, 403)

    if (body.action === 'create') {
      const { data: role } = await admin.from('roles').select('id').eq('id', body.roleId).single()
      if (!role) return reply({ error: 'Select a valid role.' }, 400)
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { name: body.name, mobile: body.mobile, role: 'user', must_change_password: true },
      })
      if (error) throw error
      const { error: updateError } = await admin.from('users').update({ role_id: body.roleId, name: body.name, mobile: body.mobile, email: body.email }).eq('id', data.user.id)
      if (updateError) { await admin.auth.admin.deleteUser(data.user.id); throw updateError }
      return reply({ user: data.user })
    }

    if (body.action === 'update') {
      const { data: role } = await admin.from('roles').select('id').eq('id', body.roleId).single()
      if (!role) return reply({ error: 'Select a valid role.' }, 400)
      const { error } = await admin.from('users').update({ name: body.name, mobile: body.mobile, role_id: body.roleId }).eq('id', body.userId)
      if (error) throw error
      if (body.email) { const { error: authUpdateError } = await admin.auth.admin.updateUserById(body.userId, { email: body.email }); if (authUpdateError) throw authUpdateError }
      return reply({ user: { id: body.userId } })
    }

    if (body.action === 'delete') {
      if (body.userId === auth.user.id) return reply({ error: 'You cannot delete your own account.' }, 400)
      const { error } = await admin.auth.admin.deleteUser(body.userId)
      if (error) throw error
      return reply({ success: true })
    }
    return reply({ error: 'Unknown action.' }, 400)
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Staff operation failed.' }, 400)
  }
})
