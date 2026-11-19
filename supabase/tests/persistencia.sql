-- Run with: docker exec -i supabase_db_RendaFacil-2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/persistencia.sql
-- Fixtures and assertions run in a transaction and never leave user data behind.
begin;
insert into auth.users (id, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', '{"consentimento_versao":"test"}'),
  ('10000000-0000-4000-8000-000000000002', '{"consentimento_versao":"test"}');

-- Simulate an account created before the declaration trigger.
delete from public.declaracoes where user_id = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.declaracoes (user_id, ano_calendario)
values (auth.uid(), 2026) on conflict (user_id, ano_calendario) do nothing;
insert into public.declaracoes (user_id, ano_calendario)
values (auth.uid(), 2026) on conflict (user_id, ano_calendario) do nothing;

do $$
declare
  declaration_id uuid;
  patch jsonb;
begin
  select id into strict declaration_id from public.declaracoes where user_id = auth.uid() and ano_calendario = 2026;
  patch := '{
    "dependentes":[{"id":"20000000-0000-4000-8000-000000000001","apelido":"Lia","relacao":"filho_enteado","em_outra_declaracao":false,"teve_renda":true}],
    "fontes":[{"id":"30000000-0000-4000-8000-000000000001","dependente_id":"20000000-0000-4000-8000-000000000001","nome":"CLT","categoria":"clt","cadastro_id":"40000000-0000-4000-8000-000000000001","rendimentos_centavos":7800001,"previdencia_centavos":853812,"irrf_centavos":298104}],
    "despesas":[{"id":"50000000-0000-4000-8000-000000000001","categoria":"saude","tipo":"consulta_medica","beneficiario":"dependente","dependente_id":"20000000-0000-4000-8000-000000000001","valor_centavos":10000,"reembolso_centavos":0,"data":"2026-01-10","descricao":"Consulta","base_legal_ok":null}],
    "pensao_mensal_centavos":80000
  }';
  perform public.salvar_lancamentos(declaration_id, patch);
  -- Retry exactly the same request: no duplicate rows, preserving cents.
  perform public.salvar_lancamentos(declaration_id, patch);
  assert (select count(*) = 1 from public.fontes_pagadoras);
  assert (select rendimentos_centavos = 7800001 from public.fontes_pagadoras);
  assert (select pensao_mensal_centavos = 80000 from public.declaracoes where id = declaration_id);

  -- An invalid source must roll back the preceding dependent update in the same call.
  begin
    perform public.salvar_lancamentos(declaration_id,
      jsonb_set(jsonb_set(patch, '{dependentes,0,apelido}', '"Should roll back"'), '{fontes,0,rendimentos_centavos}', '-1'));
    raise exception 'Expected a constraint failure';
  exception when check_violation then null;
  end;
  assert (select apelido = 'Lia' from public.dependentes);
end;
$$;

-- B can neither read A's rows nor attach A's dependent to B's declaration.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
declare declaration_id uuid;
begin
  assert (select count(*) = 1 from public.declaracoes);
  assert (select count(*) = 0 from public.dependentes);
  assert (select count(*) = 0 from public.fontes_pagadoras);
  assert (select count(*) = 0 from public.despesas);
  select id into strict declaration_id from public.declaracoes where ano_calendario = 2026;
  begin
    perform public.salvar_lancamentos(declaration_id, '{"fontes":[{"id":"30000000-0000-4000-8000-000000000002","dependente_id":"20000000-0000-4000-8000-000000000001","nome":"Foreign","categoria":"clt","cadastro_id":"40000000-0000-4000-8000-000000000002","rendimentos_centavos":100,"previdencia_centavos":0,"irrf_centavos":0}]}');
    raise exception 'Expected RLS to reject another owner dependent';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.salvar_lancamentos(declaration_id, '{"dependentes":[{"id":"20000000-0000-4000-8000-000000000001","apelido":"Stolen","relacao":"outro","em_outra_declaracao":false,"teve_renda":false}]}');
    raise exception 'Expected RLS to reject another owner id';
  exception when insufficient_privilege then null;
  end;
  update public.fontes_pagadoras set rendimentos_centavos = 1;
  delete from public.dependentes;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
declare declaration_id uuid;
begin
  assert (select rendimentos_centavos = 7800001 from public.fontes_pagadoras);
  assert (select apelido = 'Lia' from public.dependentes);
  select id into strict declaration_id from public.declaracoes where ano_calendario = 2026;
  perform public.salvar_lancamentos(declaration_id, '{"excluir_dependentes":["20000000-0000-4000-8000-000000000001"]}');
  assert (select count(*) = 0 from public.dependentes);
  assert (select count(*) = 0 from public.fontes_pagadoras);
  assert (select count(*) = 0 from public.despesas);
end;
$$;
rollback;
