-- RF-20 · Um usuário não enxerga nem mexe nos dados de outro.
--
-- A tem uma declaração completa (perfil, declaração, dependente, fontes e despesas, inclusive
-- ligadas ao dependente). B tem só perfil e declaração. Cada teste age como B, pela RLS, e
-- confere o efeito como postgres, que ignora a RLS. Os controles no início e no fim garantem que
-- as recusas vêm da RLS, e não de um privilégio faltando ou de fixtures vazias.
--
-- Rodar: npx supabase test db (precisa do Docker; veja o README).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

-- Fixtures, como postgres ---------------------------------------------------------------------

-- O trigger de cadastro (quando existir) exige o consentimento nos metadados e já cria o perfil;
-- por isso o insert em perfis atualiza a linha se ela existir.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste.local', '{"consentimento_versao": "teste"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@teste.local', '{"consentimento_versao": "teste"}');

insert into public.perfis (id, nome, consentimento_versao, consentimento_em) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'A', 'teste', now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'B', 'teste', now())
on conflict (id) do update set nome = excluded.nome;

insert into public.declaracoes (id, user_id, ano_calendario) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000001', 2026),
  ('bbbbbbbb-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-000000000002', 2026);

insert into public.dependentes (id, user_id, declaracao_id, apelido, relacao) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-0000000000d1', 'Filho de A', 'filho_enteado');

insert into public.fontes_pagadoras (id, user_id, declaracao_id, dependente_id, nome, rendimentos_centavos) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-0000000000d1', null, 'Empresa de A', 7800000),
  ('aaaaaaaa-0000-0000-0000-0000000000f2', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'Estágio do filho de A', 1200000);

insert into public.despesas (id, user_id, declaracao_id, categoria, tipo, beneficiario, dependente_id, valor_centavos, data) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-0000000000d1', 'saude', 'consulta_medica', 'titular', null, 30000, '2026-03-10'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-0000000000d1', 'educacao', 'ensino_fundamental', 'dependente',
   'aaaaaaaa-0000-0000-0000-0000000000e1', 150000, '2026-02-05');

-- Controle: A vê as próprias linhas -----------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.perfis), 1, 'controle: A vê o próprio perfil');
select is((select count(*)::int from public.declaracoes), 1, 'controle: A vê a própria declaração');
select is((select count(*)::int from public.dependentes), 1, 'controle: A vê o próprio dependente');
select is((select count(*)::int from public.fontes_pagadoras), 2, 'controle: A vê as próprias fontes');
select is((select count(*)::int from public.despesas), 2, 'controle: A vê as próprias despesas');

reset role;

-- B não lê as linhas de A ---------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;

select is_empty($$ select id from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'B não lê o perfil de A');
select is_empty($$ select id from public.declaracoes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'B não lê a declaração de A');
select is_empty($$ select id from public.dependentes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'B não lê os dependentes de A');
select is_empty($$ select id from public.fontes_pagadoras where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'B não lê as fontes pagadoras de A');
select is_empty($$ select id from public.despesas where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'B não lê as despesas de A');

-- B tenta alterar e apagar as linhas de A. A RLS esconde as linhas, então os comandos não dão
-- erro: afetam zero linhas. O efeito é conferido como postgres logo abaixo.

update public.perfis set nome = 'alterado por B' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.declaracoes set fontes_esperadas = 99 where id = 'aaaaaaaa-0000-0000-0000-0000000000d1';
update public.dependentes set apelido = 'alterado por B' where id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
update public.fontes_pagadoras set rendimentos_centavos = 1 where id = 'aaaaaaaa-0000-0000-0000-0000000000f1';
update public.despesas set valor_centavos = 1 where id = 'aaaaaaaa-0000-0000-0000-0000000000c1';

reset role;

select is((select nome from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'A',
  'B não altera o perfil de A');
select is((select fontes_esperadas from public.declaracoes where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'), 1,
  'B não altera a declaração de A');
select is((select apelido from public.dependentes where id = 'aaaaaaaa-0000-0000-0000-0000000000e1'), 'Filho de A',
  'B não altera os dependentes de A');
select is((select rendimentos_centavos from public.fontes_pagadoras where id = 'aaaaaaaa-0000-0000-0000-0000000000f1'), 7800000::bigint,
  'B não altera as fontes pagadoras de A');
select is((select valor_centavos from public.despesas where id = 'aaaaaaaa-0000-0000-0000-0000000000c1'), 30000::bigint,
  'B não altera as despesas de A');

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;

-- Filhas primeiro: assim, se a RLS falhasse, o cascade não esconderia a falha.
delete from public.despesas where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.fontes_pagadoras where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.dependentes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.declaracoes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001';

reset role;

select is((select count(*)::int from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1,
  'B não apaga o perfil de A');
select is((select count(*)::int from public.declaracoes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1,
  'B não apaga a declaração de A');
select is((select count(*)::int from public.dependentes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1,
  'B não apaga os dependentes de A');
select is((select count(*)::int from public.fontes_pagadoras where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 2,
  'B não apaga as fontes pagadoras de A');
select is((select count(*)::int from public.despesas where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 2,
  'B não apaga as despesas de A');

-- B não cria linhas em nome de A --------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.perfis (id, nome, consentimento_versao, consentimento_em)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'falso', 'teste', now()) $$,
  '42501', null, 'B não cria perfil em nome de A');
select throws_ok(
  $$ insert into public.declaracoes (user_id, ano_calendario)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 2027) $$,
  '42501', null, 'B não cria declaração em nome de A');
select throws_ok(
  $$ insert into public.dependentes (user_id, declaracao_id, apelido, relacao)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'falso', 'outro') $$,
  '42501', null, 'B não cria dependente em nome de A');
select throws_ok(
  $$ insert into public.fontes_pagadoras (user_id, declaracao_id, nome, rendimentos_centavos)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'falsa', 100) $$,
  '42501', null, 'B não cria fonte pagadora em nome de A');
select throws_ok(
  $$ insert into public.despesas (user_id, declaracao_id, categoria, tipo, beneficiario, valor_centavos, data)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1',
             'saude', 'dentista', 'titular', 100, '2026-01-01') $$,
  '42501', null, 'B não cria despesa em nome de A');
select throws_ok(
  $$ update public.declaracoes set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = 'bbbbbbbb-0000-0000-0000-0000000000d2' $$,
  '42501', null, 'B não passa a própria declaração para o nome de A');

-- B não cria linhas dentro da declaração de A, mesmo com o próprio user_id --------------------

select throws_ok(
  $$ insert into public.dependentes (user_id, declaracao_id, apelido, relacao)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'intruso', 'outro') $$,
  '42501', null, 'B não cria dependente na declaração de A');
select throws_ok(
  $$ insert into public.fontes_pagadoras (user_id, declaracao_id, nome, rendimentos_centavos)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'intrusa', 100) $$,
  '42501', null, 'B não cria fonte pagadora na declaração de A');
select throws_ok(
  $$ insert into public.despesas (user_id, declaracao_id, categoria, tipo, beneficiario, valor_centavos, data)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000d1',
             'saude', 'dentista', 'titular', 100, '2026-01-01') $$,
  '42501', null, 'B não cria despesa na declaração de A');

-- B não liga uma fonte ou uma despesa ao dependente de A --------------------------------------

select throws_ok(
  $$ insert into public.fontes_pagadoras (user_id, declaracao_id, dependente_id, nome, rendimentos_centavos)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-0000000000d2',
             'aaaaaaaa-0000-0000-0000-0000000000e1', 'ligada ao dependente de A', 100) $$,
  '42501', null, 'B não liga uma fonte pagadora ao dependente de A');
select throws_ok(
  $$ insert into public.despesas (user_id, declaracao_id, categoria, tipo, beneficiario, dependente_id, valor_centavos, data)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-0000000000d2',
             'saude', 'dentista', 'dependente', 'aaaaaaaa-0000-0000-0000-0000000000e1', 100, '2026-01-01') $$,
  '42501', null, 'B não liga uma despesa ao dependente de A');

-- Controle: B cria as mesmas linhas na própria declaração -------------------------------------
-- Sem estes testes, um privilégio de INSERT faltando também daria 42501 acima.

select lives_ok(
  $$ insert into public.dependentes (id, user_id, declaracao_id, apelido, relacao)
     values ('bbbbbbbb-0000-0000-0000-0000000000e2', 'bbbbbbbb-0000-0000-0000-000000000002',
             'bbbbbbbb-0000-0000-0000-0000000000d2', 'Filho de B', 'filho_enteado') $$,
  'controle: B cria dependente na própria declaração');
select lives_ok(
  $$ insert into public.fontes_pagadoras (id, user_id, declaracao_id, dependente_id, nome, rendimentos_centavos)
     values ('bbbbbbbb-0000-0000-0000-0000000000f3', 'bbbbbbbb-0000-0000-0000-000000000002',
             'bbbbbbbb-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-0000000000e2', 'Estágio do filho de B', 100) $$,
  'controle: B liga uma fonte pagadora ao próprio dependente');
select lives_ok(
  $$ insert into public.despesas (user_id, declaracao_id, categoria, tipo, beneficiario, dependente_id, valor_centavos, data)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-0000000000d2',
             'saude', 'dentista', 'dependente', 'bbbbbbbb-0000-0000-0000-0000000000e2', 100, '2026-01-01') $$,
  'controle: B liga uma despesa ao próprio dependente');

-- B não muda as próprias linhas para dentro da declaração de A --------------------------------

select throws_ok(
  $$ update public.fontes_pagadoras set declaracao_id = 'aaaaaaaa-0000-0000-0000-0000000000d1'
     where id = 'bbbbbbbb-0000-0000-0000-0000000000f3' $$,
  '42501', null, 'B não move a própria fonte pagadora para a declaração de A');
select throws_ok(
  $$ update public.fontes_pagadoras set dependente_id = 'aaaaaaaa-0000-0000-0000-0000000000e1'
     where id = 'bbbbbbbb-0000-0000-0000-0000000000f3' $$,
  '42501', null, 'B não troca o dependente da própria fonte pelo dependente de A');

-- Controle: B altera e apaga as próprias linhas ------------------------------------------------

select lives_ok(
  $$ update public.declaracoes set fontes_esperadas = 2 where id = 'bbbbbbbb-0000-0000-0000-0000000000d2' $$,
  'controle: B altera a própria declaração');
select is((select fontes_esperadas from public.declaracoes where id = 'bbbbbbbb-0000-0000-0000-0000000000d2'), 2,
  'controle: a alteração de B vale');
select lives_ok(
  $$ delete from public.fontes_pagadoras where id = 'bbbbbbbb-0000-0000-0000-0000000000f3' $$,
  'controle: B apaga a própria fonte pagadora');

reset role;

select is((select count(*)::int from public.fontes_pagadoras where id = 'bbbbbbbb-0000-0000-0000-0000000000f3'), 0,
  'controle: a fonte de B foi apagada');

select * from finish();
rollback;
