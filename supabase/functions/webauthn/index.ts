import { createClient } from '@supabase/supabase-js'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const rpID = Deno.env.get('WEBAUTHN_RP_ID')!
const rpName = Deno.env.get('WEBAUTHN_RP_NAME') || 'AS Marketing Stock & Order'
const allowedOrigins = (Deno.env.get('WEBAUTHN_ORIGINS') || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function response(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'WebAuthn request failed.'
}

async function requireUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Sign in with your password before registering a biometric credential.')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Error('Your session has expired. Sign in again.')
  return data.user
}

async function consumeChallenge(id: string, ceremony: string, userId?: string) {
  let query = admin
    .from('webauthn_challenges')
    .update({ consumed: true })
    .eq('id', id)
    .eq('ceremony', ceremony)
    .eq('consumed', false)
    .gt('expires_at', new Date().toISOString())
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query.select('*').maybeSingle()
  if (error || !data) throw new Error('This biometric request expired or was already used. Please try again.')
  return data
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || ''
  if (!rpID || allowedOrigins.length === 0) {
    return response(origin, { error: 'WebAuthn server configuration is incomplete.' }, 503)
  }
  if (!allowedOrigins.includes(origin)) {
    return response('null', { error: 'This website origin is not authorized for biometric login.' }, 403)
  }
  if (req.method === 'OPTIONS') return response(origin, { ok: true })
  if (req.method !== 'POST') return response(origin, { error: 'Method not allowed.' }, 405)

  try {
    const body = await req.json()

    if (body.action === 'registration-options') {
      const authUser = await requireUser(req)
      const { data: profile, error: profileError } = await admin
        .from('users').select('name, email').eq('id', authUser.id).single()
      if (profileError) throw profileError
      const { data: credentials, error: credentialsError } = await admin
        .from('webauthn_credentials').select('id, transports').eq('user_id', authUser.id)
      if (credentialsError) throw credentialsError

      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: new TextEncoder().encode(authUser.id),
        userName: profile.email || authUser.email || authUser.id,
        userDisplayName: profile.name || profile.email || 'AS Marketing user',
        attestationType: 'none',
        supportedAlgorithmIDs: [-7, -257],
        excludeCredentials: (credentials || []).map((credential) => ({
          id: credential.id,
          transports: credential.transports || [],
        })),
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
      })
      const { data: challenge, error } = await admin.from('webauthn_challenges').insert({
        challenge: options.challenge,
        ceremony: 'registration',
        user_id: authUser.id,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }).select('id').single()
      if (error) throw error
      return response(origin, { options, ceremonyId: challenge.id })
    }

    if (body.action === 'registration-verify') {
      const authUser = await requireUser(req)
      const challenge = await consumeChallenge(body.ceremonyId, 'registration', authUser.id)
      const verification = await verifyRegistrationResponse({
        response: body.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      })
      if (!verification.verified || !verification.registrationInfo) {
        throw new Error('The device could not verify this biometric credential.')
      }
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
      const { error } = await admin.from('webauthn_credentials').insert({
        id: credential.id,
        user_id: authUser.id,
        public_key: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        device_name: String(body.deviceName || '').slice(0, 160),
      })
      if (error) throw error
      return response(origin, { verified: true, credentialId: credential.id })
    }

    if (body.action === 'authentication-options') {
      if (!body.credentialId) throw new Error('Fingerprint login is not set up on this device yet. Sign in with your password and enable it in Settings.')
      const { data: credential, error } = await admin
        .from('webauthn_credentials')
        .select('id, user_id, transports')
        .eq('id', body.credentialId)
        .maybeSingle()
      if (error || !credential) throw new Error('This device credential is no longer registered. Sign in with your password and register it again.')
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: [{ id: credential.id, transports: credential.transports || [] }],
        userVerification: 'required',
      })
      const { data: challenge, error: challengeError } = await admin.from('webauthn_challenges').insert({
        challenge: options.challenge,
        ceremony: 'authentication',
        user_id: credential.user_id,
        credential_id: credential.id,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }).select('id').single()
      if (challengeError) throw challengeError
      return response(origin, { options, ceremonyId: challenge.id })
    }

    if (body.action === 'authentication-verify') {
      const challenge = await consumeChallenge(body.ceremonyId, 'authentication')
      if (challenge.credential_id !== body.credential?.id) throw new Error('The biometric credential did not match this login request.')
      const { data: credential, error: credentialError } = await admin
        .from('webauthn_credentials')
        .select('id, user_id, public_key, counter, transports')
        .eq('id', challenge.credential_id)
        .single()
      if (credentialError) throw credentialError
      const verification = await verifyAuthenticationResponse({
        response: body.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: credential.id,
          publicKey: isoBase64URL.toBuffer(credential.public_key),
          counter: credential.counter,
          transports: credential.transports || [],
        },
        requireUserVerification: true,
      })
      if (!verification.verified) throw new Error('Fingerprint verification failed.')
      const { error: counterError } = await admin.from('webauthn_credentials').update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      }).eq('id', credential.id).eq('counter', credential.counter)
      if (counterError) throw counterError

      const { data: profile, error: profileError } = await admin
        .from('users').select('email').eq('id', credential.user_id).single()
      if (profileError || !profile.email) throw new Error('The account linked to this credential is unavailable.')
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: profile.email,
      })
      if (linkError || !link.properties?.hashed_token) throw new Error('Could not create an authenticated session.')
      return response(origin, { verified: true, tokenHash: link.properties.hashed_token })
    }

    return response(origin, { error: 'Unknown WebAuthn action.' }, 400)
  } catch (error) {
    console.error(error)
    return response(origin, { error: errorMessage(error) }, 400)
  }
})
