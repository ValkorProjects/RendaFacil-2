create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  consentimento_versao text not null,
  consentimento_em timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.perfis enable row level security;

create policy "Users can read their own profile"
  on public.perfis for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.perfis for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.perfis for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome, consentimento_versao, consentimento_em)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'consentimento_versao', 'legacy'),
    coalesce(
      (new.raw_user_meta_data ->> 'consentimento_em')::timestamptz,
      now()
    )
  )
  on conflict (id) do update
    set nome = excluded.nome,
        consentimento_versao = excluded.consentimento_versao,
        consentimento_em = excluded.consentimento_em,
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

insert into public.perfis (id, nome, consentimento_versao, consentimento_em)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', ''),
  coalesce(raw_user_meta_data ->> 'consentimento_versao', 'legacy'),
  coalesce(
    (raw_user_meta_data ->> 'consentimento_em')::timestamptz,
    created_at
  )
from auth.users
on conflict (id) do nothing;
