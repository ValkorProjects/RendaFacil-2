-- RF-03: a declaração de 2026 nasce junto com a conta, para as telas e o questionário (RF-10)
-- já encontrarem onde gravar. Roda depois do trigger do perfil: se o cadastro for recusado por
-- falta de aceite, nada é criado.
create or replace function public.handle_new_user_declaracao()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.declaracoes (user_id, ano_calendario)
  values (new.id, 2026)
  on conflict (user_id, ano_calendario) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_declaracao on auth.users;
create trigger on_auth_user_created_declaracao
  after insert on auth.users
  for each row execute procedure public.handle_new_user_declaracao();

revoke execute on function public.handle_new_user_declaracao() from public, anon, authenticated;

-- RF-04: o registro do aceite só é gravado pelos triggers de cadastro e de nome. O app não grava
-- em perfis pela API, então o usuário fica só com leitura do próprio perfil e não consegue
-- alterar nem apagar a versão e a data do aceite.
revoke insert, update, delete on public.perfis from authenticated;
