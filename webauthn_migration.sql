-- Server-side WebAuthn challenge state and credential metadata.
-- Run this after schema.sql for new projects, or once for existing projects.

alter table public.webauthn_credentials
  add column if not exists transports jsonb not null default '[]'::jsonb,
  add column if not exists device_type text,
  add column if not exists backed_up boolean not null default false,
  add column if not exists last_used_at timestamp with time zone;

-- Credentials created by the former client-side placeholder contain no real
-- WebAuthn public key and must never be accepted by the verifier.
delete from public.webauthn_credentials
where public_key like 'pubkey_representation_%';

drop policy if exists "Allow read/write of own credentials" on public.webauthn_credentials;
create policy "Read own WebAuthn credentials" on public.webauthn_credentials
  for select using (user_id = auth.uid());
create policy "Delete own WebAuthn credentials" on public.webauthn_credentials
  for delete using (user_id = auth.uid());
revoke insert, update on public.webauthn_credentials from anon, authenticated;

create table if not exists public.webauthn_challenges (
  id uuid default uuid_generate_v4() primary key,
  challenge text not null,
  ceremony text not null check (ceremony in ('registration', 'authentication')),
  user_id uuid references public.users(id) on delete cascade,
  credential_id text references public.webauthn_credentials(id) on delete cascade,
  expires_at timestamp with time zone not null,
  consumed boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.webauthn_challenges enable row level security;

-- No browser policies are intentionally defined. Only the WebAuthn Edge Function,
-- using its server-side service role, can read or mutate challenge records.
revoke all on public.webauthn_challenges from anon, authenticated;

create index if not exists webauthn_challenges_expiry_idx
  on public.webauthn_challenges (expires_at);
