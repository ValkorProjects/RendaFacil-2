-- Preserve existing profiles, their foreign key, RLS and ownership policies.
alter table public.profiles rename to perfis;

alter table public.perfis
  add column consentimento_versao text,
  add column consentimento_em timestamptz,
  add constraint perfis_consentimento_completo check (
    (consentimento_versao is null and consentimento_em is null)
    or (consentimento_versao is not null and consentimento_em is not null)
  );

-- Legacy accounts intentionally remain NULL: consent cannot be inferred retroactively.
comment on column public.perfis.consentimento_versao is 'Version of the privacy policy explicitly accepted at signup; NULL for legacy accounts.';
comment on column public.perfis.consentimento_em is 'Server timestamp of explicit signup consent; NULL for legacy accounts.';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- The Auth trigger must write the profile before a session exists (email confirmation).
-- Keep privileged trigger code outside the exposed API schema.
alter function public.handle_new_user() set schema private;
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.raw_user_meta_data -> 'privacy_consent' is distinct from 'true'::jsonb
     or new.raw_user_meta_data ->> 'privacy_policy_version' is distinct from '2026-11-05' then
    raise exception 'Explicit consent to the current privacy policy is required'
      using errcode = '23514';
  end if;

  insert into public.perfis (id, name, phone, consentimento_versao, consentimento_em)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    new.raw_user_meta_data ->> 'privacy_policy_version',
    statement_timestamp()
  );
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

-- Auth owns creation/deletion. Clients cannot forge or rewrite the consent evidence.
drop policy "Users can insert their own profile" on public.perfis;
revoke all on table public.perfis from public, anon, authenticated;
grant select on public.perfis to authenticated;
grant update (name, phone) on public.perfis to authenticated;
