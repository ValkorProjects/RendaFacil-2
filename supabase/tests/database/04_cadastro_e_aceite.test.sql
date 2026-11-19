-- RF-03 e RF-04 · O cadastro cria o perfil e a declaração de 2026, e o registro do aceite é
-- protegido: o usuário só lê o próprio perfil.
--
-- Rodar: npx supabase test db (precisa do Docker; veja o README).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

-- Cadastro com aceite ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste.local',
   '{"consentimento_versao": "teste", "full_name": "Ana"}');

select is((select consentimento_versao from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'teste', 'o cadastro grava o perfil com a versão do aceite');
select results_eq(
  $$ select ano_calendario, questionario_concluido, fontes_esperadas
     from public.declaracoes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values (2026, false, 1) $$,
  'o cadastro cria uma única declaração, a de 2026, com o questionário por concluir');

-- Cadastro sem aceite ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'b@teste.local', '{}') $$,
  '23514', null, 'o cadastro sem aceite é recusado');
select is((select count(*)::int from public.perfis where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 0,
  'o cadastro recusado não deixa perfil');
select is((select count(*)::int from public.declaracoes where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 0,
  'o cadastro recusado não deixa declaração');

-- O nome acompanha o metadata do usuário ---------------------------------------------------------

update auth.users
set raw_user_meta_data = '{"consentimento_versao": "teste", "full_name": "Ana Souza"}'
where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is((select nome from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Ana Souza', 'trocar o nome no metadata atualiza perfis.nome');

-- O usuário não mexe no registro do aceite ------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ update public.perfis set consentimento_versao = 'outra' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'o usuário não altera a versão do aceite');
select throws_ok(
  $$ delete from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'o usuário não apaga o registro do aceite');
select is((select count(*)::int from public.perfis), 1, 'controle: o usuário continua lendo o próprio perfil');

reset role;

select * from finish();
rollback;
