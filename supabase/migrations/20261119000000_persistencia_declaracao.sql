-- RF-12: preserve the monthly values captured by the income screens while keeping the
-- annualized values consumed by the declaration engine.
alter table public.fontes_pagadoras
  add column cadastro_id uuid not null default gen_random_uuid(),
  add column categoria text not null default 'nao_informada',
  add column rendimentos_mensais_centavos bigint,
  add column previdencia_mensal_centavos bigint,
  add column irrf_mensal_centavos bigint;

alter table public.fontes_pagadoras
  add constraint fontes_pagadoras_categoria_check
    check (categoria = any (array[
      'clt', 'proLabore', 'autonomo', 'aposentadoria', 'alugueis',
      'pensaoAlimenticia', 'nao_informada'
    ])),
  add constraint fontes_pagadoras_rendimentos_mensais_check
    check (rendimentos_mensais_centavos is null or rendimentos_mensais_centavos >= 0),
  add constraint fontes_pagadoras_previdencia_mensal_check
    check (previdencia_mensal_centavos is null or previdencia_mensal_centavos >= 0),
  add constraint fontes_pagadoras_irrf_mensal_check
    check (irrf_mensal_centavos is null or irrf_mensal_centavos >= 0);

alter table public.despesas
  add column recebedor text not null default '',
  add column pensao_iniciou_em_2026 boolean not null default false;

alter table public.dependentes
  drop constraint dependentes_relacao_check;

update public.dependentes
set relacao = case relacao
  when 'conjuge' then 'conjuge_companheiro'
  when 'pais_avos' then 'pais_avos_bisavos'
  else relacao
end;

alter table public.dependentes
  add constraint dependentes_relacao_check
    check (relacao = any (array[
      'filho_enteado', 'conjuge_companheiro', 'pais_avos_bisavos', 'outro'
    ]));

create index fontes_pagadoras_cadastro_id_idx
  on public.fontes_pagadoras (declaracao_id, cadastro_id);
