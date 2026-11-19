begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(37);

insert into auth.users (id, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', '{"consentimento_versao":"test"}'),
  ('10000000-0000-4000-8000-000000000002', '{"consentimento_versao":"test"}');

delete from public.declaracoes
where user_id = '10000000-0000-4000-8000-000000000001';
insert into public.declaracoes (user_id, ano_calendario)
values ('10000000-0000-4000-8000-000000000001', 2025);

select extensions.is(
  (
    select count(*) from public.declaracoes
    where user_id = '10000000-0000-4000-8000-000000000001' and ano_calendario = 2026
  ),
  0::bigint,
  'an account created before the declaration trigger has no 2026 declaration'
);
select extensions.ok(
  (
    select not prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.salvar_lancamentos(uuid,jsonb)'::regprocedure
  ),
  'the RPC runs as the authenticated caller'
);
select extensions.ok(
  (
    select coalesce(proconfig && array['search_path=""', 'search_path=']::text[], false)
    from pg_catalog.pg_proc
    where oid = 'public.salvar_lancamentos(uuid,jsonb)'::regprocedure
  ),
  'the RPC uses an empty search_path'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.salvar_lancamentos(uuid,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the RPC'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.salvar_lancamentos(uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated users can execute the RPC'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

select extensions.lives_ok(
  $$ insert into public.declaracoes (user_id, ano_calendario)
     values (auth.uid(), 2026)
     on conflict (user_id, ano_calendario) do nothing $$,
  'creates the 2026 declaration for an existing account'
);
select extensions.lives_ok(
  $$ insert into public.declaracoes (user_id, ano_calendario)
     values (auth.uid(), 2026)
     on conflict (user_id, ano_calendario) do nothing $$,
  'retries declaration creation safely'
);
select extensions.is(
  (select count(*) from public.declaracoes where user_id = auth.uid() and ano_calendario = 2026),
  1::bigint,
  'keeps one declaration per user and year'
);

select extensions.lives_ok(
  $$
    select public.salvar_lancamentos(
      (select id from public.declaracoes where user_id = auth.uid() and ano_calendario = 2026),
      $patch$
        {
          "dependentes":[{"id":"20000000-0000-4000-8000-000000000001","apelido":"Lia","relacao":"filho_enteado","em_outra_declaracao":false,"teve_renda":true}],
          "fontes":[{"id":"30000000-0000-4000-8000-000000000001","dependente_id":"20000000-0000-4000-8000-000000000001","nome":"CLT","categoria":"clt","cadastro_id":"40000000-0000-4000-8000-000000000001","rendimentos_centavos":7800001,"previdencia_centavos":853812,"irrf_centavos":298104,"decimo_terceiro_centavos":654321,"irrf_13_centavos":12345,"plr_centavos":67890}],
          "despesas":[
            {"id":"50000000-0000-4000-8000-000000000001","categoria":"saude","tipo":"consulta_medica","beneficiario":"dependente","dependente_id":"20000000-0000-4000-8000-000000000001","valor_centavos":10000,"reembolso_centavos":0,"data":"2026-01-10","descricao":"Consulta","base_legal_ok":null},
            {"id":"50000000-0000-4000-8000-000000000002","categoria":"pensao","tipo":"pensao_alimenticia","beneficiario":"dependente","dependente_id":"20000000-0000-4000-8000-000000000001","valor_centavos":250000,"reembolso_centavos":0,"data":"2026-12-31","descricao":"Pensão Lia","base_legal_ok":true,"recebedor":"Lia","pensao_iniciou_em_2026":true}
          ],
          "fontes_esperadas":2
        }
      $patch$::jsonb
    )
  $$,
  'saves dependents, sources, expenses and pension together'
);
select extensions.is((select count(*) from public.dependentes), 1::bigint, 'saves the dependent');
select extensions.is((select count(*) from public.fontes_pagadoras), 1::bigint, 'saves the source');
select extensions.is(
  (select rendimentos_centavos from public.fontes_pagadoras),
  7800001::bigint,
  'preserves source cents'
);
select extensions.is((select count(*) from public.despesas), 2::bigint, 'saves both expenses');

select extensions.lives_ok(
  $$
    select public.salvar_lancamentos(
      (select id from public.declaracoes where user_id = auth.uid() and ano_calendario = 2026),
      $patch$
        {
          "dependentes":[{"id":"20000000-0000-4000-8000-000000000001","apelido":"Lia","relacao":"filho_enteado","em_outra_declaracao":false,"teve_renda":true}],
          "fontes":[{"id":"30000000-0000-4000-8000-000000000001","dependente_id":"20000000-0000-4000-8000-000000000001","nome":"CLT","categoria":"clt","cadastro_id":"40000000-0000-4000-8000-000000000001","rendimentos_centavos":7800001,"previdencia_centavos":853812,"irrf_centavos":298104}],
          "despesas":[
            {"id":"50000000-0000-4000-8000-000000000001","categoria":"saude","tipo":"consulta_medica","beneficiario":"dependente","dependente_id":"20000000-0000-4000-8000-000000000001","valor_centavos":10000,"reembolso_centavos":0,"data":"2026-01-10","descricao":"Consulta","base_legal_ok":null},
            {"id":"50000000-0000-4000-8000-000000000002","categoria":"pensao","tipo":"pensao_alimenticia","beneficiario":"dependente","dependente_id":"20000000-0000-4000-8000-000000000001","valor_centavos":250000,"reembolso_centavos":0,"data":"2026-12-31","descricao":"Pensão Lia","base_legal_ok":true}
          ]
        }
      $patch$::jsonb
    )
  $$,
  'retries the same patch safely'
);
select extensions.is(
  (select count(*) from public.fontes_pagadoras),
  1::bigint,
  'does not duplicate sources on retry'
);
select extensions.is(
  (select nome from public.fontes_pagadoras),
  'CLT',
  'saves and preserves the source name'
);
select extensions.is(
  (select decimo_terceiro_centavos from public.fontes_pagadoras),
  654321::bigint,
  'preserves 13th salary when a later patch omits it'
);
select extensions.is(
  (select irrf_13_centavos from public.fontes_pagadoras),
  12345::bigint,
  'preserves 13th tax withheld when a later patch omits it'
);
select extensions.is(
  (select plr_centavos from public.fontes_pagadoras),
  67890::bigint,
  'preserves profit-sharing when a later patch omits it'
);
select extensions.is(
  (select fontes_esperadas from public.declaracoes where user_id = auth.uid()),
  2,
  'saves and preserves the expected source count'
);
select extensions.is(
  (select categoria from public.despesas where id = '50000000-0000-4000-8000-000000000002'),
  'pensao',
  'stores alimony as an expense'
);
select extensions.is(
  (select recebedor from public.despesas where id = '50000000-0000-4000-8000-000000000002'),
  'Lia',
  'saves and preserves the pension recipient'
);
select extensions.is(
  (select pensao_iniciou_em_2026 from public.despesas where id = '50000000-0000-4000-8000-000000000002'),
  true,
  'saves and preserves the pension start year'
);

select extensions.throws_ok(
  $$
    select public.salvar_lancamentos(
      (select id from public.declaracoes where user_id = auth.uid() and ano_calendario = 2026),
      $patch$
        {
          "dependentes":[{"id":"20000000-0000-4000-8000-000000000001","apelido":"Should roll back","relacao":"filho_enteado","em_outra_declaracao":false,"teve_renda":true}],
          "fontes":[{"id":"30000000-0000-4000-8000-000000000002","dependente_id":"20000000-0000-4000-8000-000000000001","nome":"CLT","categoria":"clt","cadastro_id":"40000000-0000-4000-8000-000000000001","rendimentos_centavos":-1,"previdencia_centavos":0,"irrf_centavos":0}]
        }
      $patch$::jsonb
    )
  $$,
  '23514',
  null,
  'rejects negative values'
);
select extensions.is(
  (select apelido from public.dependentes),
  'Lia',
  'rolls back earlier updates when a later row fails'
);
select extensions.throws_ok(
  $$
    select public.salvar_lancamentos(
      (select id from public.declaracoes where user_id = auth.uid() and ano_calendario = 2025),
      '{}'::jsonb
    )
  $$,
  '42501',
  'Declaração não encontrada.',
  'rejects declarations outside the supported calendar year'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';

select extensions.is((select count(*) from public.declaracoes), 1::bigint, 'user B sees only its declaration');
select extensions.is((select count(*) from public.dependentes), 0::bigint, 'user B cannot read user A dependents');
select extensions.is((select count(*) from public.fontes_pagadoras), 0::bigint, 'user B cannot read user A sources');
select extensions.is((select count(*) from public.despesas), 0::bigint, 'user B cannot read user A expenses');

select extensions.throws_ok(
  $$
    select public.salvar_lancamentos(
      (select id from public.declaracoes where user_id = auth.uid() and ano_calendario = 2026),
      '{"fontes":[{"id":"30000000-0000-4000-8000-000000000002","dependente_id":"20000000-0000-4000-8000-000000000001","nome":"Foreign","categoria":"clt","cadastro_id":"40000000-0000-4000-8000-000000000002","rendimentos_centavos":100,"previdencia_centavos":0,"irrf_centavos":0}]}'::jsonb
    )
  $$,
  '42501',
  null,
  'rejects linking another user dependent'
);
select extensions.throws_ok(
  $$
    select public.salvar_lancamentos(
      (select id from public.declaracoes where user_id = auth.uid() and ano_calendario = 2026),
      '{"dependentes":[{"id":"20000000-0000-4000-8000-000000000001","apelido":"Stolen","relacao":"outro","em_outra_declaracao":false,"teve_renda":false}]}'::jsonb
    )
  $$,
  '42501',
  null,
  'rejects updating another user dependent'
);

set local "request.jwt.claim.sub" = '';
select extensions.throws_ok(
  $$ select public.salvar_lancamentos('00000000-0000-4000-8000-000000000000', '{}'::jsonb) $$,
  '42501',
  'Entre na sua conta.',
  'rejects calls without an authenticated user'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

select extensions.is(
  (select rendimentos_centavos from public.fontes_pagadoras),
  7800001::bigint,
  'user B attempts did not change user A sources'
);
select extensions.is(
  (select apelido from public.dependentes),
  'Lia',
  'user B attempts did not change user A dependents'
);
select extensions.lives_ok(
  $$
    select public.salvar_lancamentos(
      (select id from public.declaracoes where user_id = auth.uid() and ano_calendario = 2026),
      '{"excluir_dependentes":["20000000-0000-4000-8000-000000000001"]}'::jsonb
    )
  $$,
  'deletes a dependent'
);
select extensions.ok(
  (select count(*) = 0 from public.dependentes)
    and (select count(*) = 0 from public.fontes_pagadoras)
    and (select count(*) = 0 from public.despesas),
  'cascades dependent deletion to sources and expenses'
);

reset role;
select * from extensions.finish();
rollback;
