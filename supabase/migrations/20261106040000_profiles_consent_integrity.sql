alter table public.perfis
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.perfis
set consentimento_versao = 'anterior-ao-aceite'
where consentimento_versao = 'legacy';

insert into public.perfis (id, nome, consentimento_versao, consentimento_em)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', ''),
  'anterior-ao-aceite',
  users.created_at
from auth.users as users
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  consent_version text := nullif(btrim(new.raw_user_meta_data ->> 'consentimento_versao'), '');
begin
  if consent_version is null then
    raise exception 'Consentimento obrigatório para criar uma conta.'
      using errcode = '23514';
  end if;

  insert into public.perfis (id, nome, consentimento_versao, consentimento_em)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    consent_version,
    now()
  )
  on conflict (id) do update
    set nome = excluded.nome,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.handle_user_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.perfis
  set nome = coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute procedure public.handle_user_update();