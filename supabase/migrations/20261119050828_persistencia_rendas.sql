-- Preserve the monthly form's category and grouping; monetary source columns remain annual cents.
alter table public.fontes_pagadoras
  add column categoria text not null default 'clt'
    check (categoria in ('clt', 'proLabore', 'autonomo', 'aposentadoria', 'alugueis', 'pensaoAlimenticia')),
  add column cadastro_id uuid not null default gen_random_uuid();

alter table public.declaracoes
  add column pensao_mensal_centavos bigint not null default 0
    check (pensao_mensal_centavos >= 0);

-- A patch contains only changed rows, never a replacement of the entire declaration.
-- SECURITY INVOKER deliberately keeps every write subject to the existing RLS policies.
create function public.salvar_lancamentos(p_declaracao_id uuid, p_alteracoes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := auth.uid();
  item jsonb;
  afetadas integer;
begin
  if dono is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  perform 1 from public.declaracoes
    where id = p_declaracao_id and user_id = dono and ano_calendario = 2026 for update;
  if not found then raise exception 'Declaração não encontrada.' using errcode = '42501'; end if;

  for item in select value from jsonb_array_elements(coalesce(p_alteracoes->'dependentes', '[]')) loop
    insert into public.dependentes (id, user_id, declaracao_id, apelido, relacao, em_outra_declaracao, teve_renda)
    values ((item->>'id')::uuid, dono, p_declaracao_id, item->>'apelido', item->>'relacao',
      (item->>'em_outra_declaracao')::boolean, (item->>'teve_renda')::boolean)
    on conflict (id) do update set apelido = excluded.apelido, relacao = excluded.relacao,
      em_outra_declaracao = excluded.em_outra_declaracao, teve_renda = excluded.teve_renda
      where dependentes.user_id = dono and dependentes.declaracao_id = p_declaracao_id;
    get diagnostics afetadas = row_count;
    if afetadas <> 1 then raise exception 'Dependente não encontrado.' using errcode = '42501'; end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_alteracoes->'fontes', '[]')) loop
    insert into public.fontes_pagadoras (id, user_id, declaracao_id, dependente_id, nome, categoria, cadastro_id,
      rendimentos_centavos, previdencia_centavos, irrf_centavos)
    values ((item->>'id')::uuid, dono, p_declaracao_id, (item->>'dependente_id')::uuid,
      item->>'nome', item->>'categoria', (item->>'cadastro_id')::uuid,
      (item->>'rendimentos_centavos')::bigint, (item->>'previdencia_centavos')::bigint, (item->>'irrf_centavos')::bigint)
    on conflict (id) do update set dependente_id = excluded.dependente_id, nome = excluded.nome,
      categoria = excluded.categoria, cadastro_id = excluded.cadastro_id,
      rendimentos_centavos = excluded.rendimentos_centavos,
      previdencia_centavos = excluded.previdencia_centavos, irrf_centavos = excluded.irrf_centavos
      where fontes_pagadoras.user_id = dono and fontes_pagadoras.declaracao_id = p_declaracao_id;
    get diagnostics afetadas = row_count;
    if afetadas <> 1 then raise exception 'Renda não encontrada.' using errcode = '42501'; end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_alteracoes->'despesas', '[]')) loop
    insert into public.despesas (id, user_id, declaracao_id, categoria, tipo, beneficiario, dependente_id,
      valor_centavos, reembolso_centavos, data, descricao, base_legal_ok)
    values ((item->>'id')::uuid, dono, p_declaracao_id, item->>'categoria', item->>'tipo',
      item->>'beneficiario', (item->>'dependente_id')::uuid, (item->>'valor_centavos')::bigint,
      (item->>'reembolso_centavos')::bigint, (item->>'data')::date, item->>'descricao', (item->>'base_legal_ok')::boolean)
    on conflict (id) do update set categoria = excluded.categoria, tipo = excluded.tipo,
      beneficiario = excluded.beneficiario, dependente_id = excluded.dependente_id,
      valor_centavos = excluded.valor_centavos, reembolso_centavos = excluded.reembolso_centavos,
      data = excluded.data, descricao = excluded.descricao, base_legal_ok = excluded.base_legal_ok
      where despesas.user_id = dono and despesas.declaracao_id = p_declaracao_id;
    get diagnostics afetadas = row_count;
    if afetadas <> 1 then raise exception 'Despesa não encontrada.' using errcode = '42501'; end if;
  end loop;

  delete from public.fontes_pagadoras where user_id = dono and declaracao_id = p_declaracao_id
    and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_alteracoes->'excluir_fontes', '[]')));
  delete from public.despesas where user_id = dono and declaracao_id = p_declaracao_id
    and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_alteracoes->'excluir_despesas', '[]')));
  -- Foreign keys cascade to this dependent's sources and expenses.
  delete from public.dependentes where user_id = dono and declaracao_id = p_declaracao_id
    and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_alteracoes->'excluir_dependentes', '[]')));

  update public.declaracoes set atualizado_em = now(),
    pensao_mensal_centavos = coalesce((p_alteracoes->>'pensao_mensal_centavos')::bigint, pensao_mensal_centavos)
    where id = p_declaracao_id and user_id = dono;
end;
$$;

revoke all on function public.salvar_lancamentos(uuid, jsonb) from public, anon;
grant execute on function public.salvar_lancamentos(uuid, jsonb) to authenticated;
