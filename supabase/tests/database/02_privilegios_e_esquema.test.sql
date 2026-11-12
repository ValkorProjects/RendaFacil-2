-- RF-20 · Privilégios dos papéis e regras do esquema.
--
-- As checagens percorrem todas as tabelas de public, e não uma lista fixa: uma tabela nova sem
-- RLS, com privilégio para anon ou com dinheiro fora de bigint derruba o teste.
--
-- Rodar: npx supabase test db (precisa do Docker; veja o README).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

-- RLS ligada em toda tabela -------------------------------------------------------------------

select is_empty(
  $$ select c.relname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'toda tabela de public tem RLS ligada');

-- anon: nenhum privilégio, nem de coluna ------------------------------------------------------

select is_empty(
  $$ select c.relname, p.privilegio
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                             'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilegio)
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and has_table_privilege('anon', c.oid, p.privilegio) $$,
  'anon não tem privilégio em nenhuma tabela de public');

select is_empty(
  $$ select c.relname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES') $$,
  'anon não tem privilégio em nenhuma coluna de public');

-- anon tenta ler e gravar ---------------------------------------------------------------------

set local role anon;

select throws_ok($$ select * from public.perfis $$, '42501', null, 'anon não lê perfis');
select throws_ok($$ select * from public.declaracoes $$, '42501', null, 'anon não lê declaracoes');
select throws_ok($$ select * from public.dependentes $$, '42501', null, 'anon não lê dependentes');
select throws_ok($$ select * from public.fontes_pagadoras $$, '42501', null, 'anon não lê fontes_pagadoras');
select throws_ok($$ select * from public.despesas $$, '42501', null, 'anon não lê despesas');
select throws_ok(
  $$ insert into public.declaracoes (user_id, ano_calendario)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 2026) $$,
  '42501', null, 'anon não grava em declaracoes');

reset role;

-- authenticated: só SELECT, INSERT, UPDATE e DELETE -------------------------------------------
-- O RLS não vale para TRUNCATE, TRIGGER, REFERENCES nem MAINTAIN, então esses ficam de fora.

select table_privs_are('public', 'perfis', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'authenticated tem só SELECT, INSERT, UPDATE e DELETE em perfis');
select table_privs_are('public', 'declaracoes', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'authenticated tem só SELECT, INSERT, UPDATE e DELETE em declaracoes');
select table_privs_are('public', 'dependentes', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'authenticated tem só SELECT, INSERT, UPDATE e DELETE em dependentes');
select table_privs_are('public', 'fontes_pagadoras', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'authenticated tem só SELECT, INSERT, UPDATE e DELETE em fontes_pagadoras');
select table_privs_are('public', 'despesas', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'authenticated tem só SELECT, INSERT, UPDATE e DELETE em despesas');

select is_empty(
  $$ select c.relname, p.privilegio
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilegio)
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and has_table_privilege('authenticated', c.oid, p.privilegio) $$,
  'authenticated não tem TRUNCATE, REFERENCES, TRIGGER nem MAINTAIN em nenhuma tabela de public');

-- Dinheiro só em bigint -----------------------------------------------------------------------

select is_empty(
  $$ select table_name, column_name, data_type
     from information_schema.columns
     where table_schema = 'public'
       and (data_type in ('real', 'double precision', 'numeric', 'money')
            or (column_name like '%centavos' and data_type <> 'bigint')) $$,
  'dinheiro só em bigint: nenhuma coluna real, double, numeric ou money, e toda coluna *_centavos é bigint');

-- Dados que o app não deve guardar ------------------------------------------------------------

select is_empty(
  $$ select table_name, column_name
     from information_schema.columns
     where table_schema = 'public' and column_name ~* '(cpf|nascimento|nasc_|diagnos)' $$,
  'nenhuma coluna de CPF, data de nascimento ou diagnóstico');

select * from finish();
rollback;
