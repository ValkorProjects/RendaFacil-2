drop policy "dono" on public.dependentes;
create policy "dono" on public.dependentes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.declaracoes d
      where d.id = declaracao_id and d.user_id = (select auth.uid())
    )
  );

drop policy "dono" on public.fontes_pagadoras;
create policy "dono" on public.fontes_pagadoras for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.declaracoes d
      where d.id = declaracao_id and d.user_id = (select auth.uid())
    )
    and (
      dependente_id is null
      or exists (
        select 1 from public.dependentes p
        where p.id = dependente_id and p.declaracao_id = fontes_pagadoras.declaracao_id
          and p.user_id = (select auth.uid())
      )
    )
  );

drop policy "dono" on public.despesas;
create policy "dono" on public.despesas for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.declaracoes d
      where d.id = declaracao_id and d.user_id = (select auth.uid())
    )
    and (
      dependente_id is null
      or exists (
        select 1 from public.dependentes p
        where p.id = dependente_id and p.declaracao_id = despesas.declaracao_id
          and p.user_id = (select auth.uid())
      )
    )
  );

drop policy "dono" on public.declaracoes;
create policy "dono" on public.declaracoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "dono" on public.perfis;
create policy "dono" on public.perfis for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- As FKs com cascade e a RLS filtram por estas colunas.
create index on public.dependentes (user_id);
create index on public.dependentes (declaracao_id);
create index on public.fontes_pagadoras (user_id);
create index on public.fontes_pagadoras (declaracao_id);
create index on public.fontes_pagadoras (dependente_id);
create index on public.despesas (user_id);
create index on public.despesas (declaracao_id);
create index on public.despesas (dependente_id);

-- Só as operações que o app usa; o RLS não vale para TRUNCATE, TRIGGER, REFERENCES e MAINTAIN.
revoke all on all tables in schema public from anon;
revoke truncate, trigger, references, maintain on all tables in schema public from authenticated;