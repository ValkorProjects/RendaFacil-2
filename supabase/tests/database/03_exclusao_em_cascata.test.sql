-- RF-20 · Apagar o usuário em auth.users apaga todas as linhas dele (critério do RF-04).
--
-- Rodar: npx supabase test db (precisa do Docker; veja o README).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

-- Fixtures, como postgres ---------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste.local', '{"consentimento_versao": "teste"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@teste.local', '{"consentimento_versao": "teste"}');

insert into public.perfis (id, nome, consentimento_versao, consentimento_em) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'A', 'teste', now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'B', 'teste', now())
on conflict (id) do update set nome = excluded.nome;

insert into public.declaracoes (id, user_id, ano_calendario) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000001', 2026),
  ('aaaaaaaa-0000-0000-0000-0000000000d3', 'aaaaaaaa-0000-0000-0000-000000000001', 2027),
  ('bbbbbbbb-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-000000000002', 2026);

insert into public.dependentes (id, user_id, declaracao_id, apelido, relacao) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-0000000000d1', 'Filho de A', 'filho_enteado'),
  ('bbbbbbbb-0000-0000-0000-0000000000e2', 'bbbbbbbb-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-0000000000d2', 'Filho de B', 'filho_enteado');

insert into public.fontes_pagadoras (user_id, declaracao_id, dependente_id, nome, rendimentos_centavos) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', null, 'Empresa de A', 7800000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1',
   'aaaaaaaa-0000-0000-0000-0000000000e1', 'Estágio do filho de A', 1200000),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-0000000000d2', null, 'Empresa de B', 6000000);

insert into public.despesas (user_id, declaracao_id, categoria, tipo, beneficiario, dependente_id, valor_centavos, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1',
   'saude', 'consulta_medica', 'titular', null, 30000, '2026-03-10'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1',
   'educacao', 'ensino_fundamental', 'dependente', 'aaaaaaaa-0000-0000-0000-0000000000e1', 150000, '2026-02-05'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-0000000000d2',
   'saude', 'dentista', 'titular', null, 20000, '2026-04-01');

-- Apaga A, como faz a exclusão de conta -------------------------------------------------------

select lives_ok(
  $$ delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'apagar o usuário A em auth.users');

select is((select count(*)::int from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'nenhum perfil de A sobra');
select is((select count(*)::int from public.declaracoes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'nenhuma declaração de A sobra');
select is((select count(*)::int from public.dependentes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'nenhum dependente de A sobra');
select is((select count(*)::int from public.fontes_pagadoras where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'nenhuma fonte pagadora de A sobra');
select is((select count(*)::int from public.despesas where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'nenhuma despesa de A sobra');

-- Controle: os dados de B continuam -----------------------------------------------------------

select results_eq(
  $$ values
       ((select count(*)::int from public.perfis where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
        (select count(*)::int from public.declaracoes where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
        (select count(*)::int from public.dependentes where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
        (select count(*)::int from public.fontes_pagadoras where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
        (select count(*)::int from public.despesas where user_id = 'bbbbbbbb-0000-0000-0000-000000000002')) $$,
  $$ values (1, 1, 1, 1, 1) $$,
  'controle: as linhas de B continuam no banco');

select * from finish();
rollback;
