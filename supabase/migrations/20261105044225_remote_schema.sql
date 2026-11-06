CREATE TABLE "public"."declaracoes" (
  "id"                          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                     uuid                     NOT NULL,
  "ano_calendario"              integer                  NOT NULL,
  "fontes_esperadas"            integer                  NOT NULL DEFAULT 1,
  "questionario_etapa"          text,
  "questionario_concluido"      boolean                  NOT NULL DEFAULT false,
  "triagem"                     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "resultado_real_tipo"         text,
  "resultado_real_centavos"     bigint,
  "resultado_real_modelo"       text,
  "resultado_estimado_centavos" bigint,
  "criado_em"                   timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "declaracoes_fontes_esperadas_check" CHECK ((fontes_esperadas >= 0)),
  CONSTRAINT "declaracoes_pkey" PRIMARY KEY (id),
  CONSTRAINT "declaracoes_resultado_real_centavos_check" CHECK ((resultado_real_centavos >= 0)),
  CONSTRAINT "declaracoes_resultado_real_modelo_check" CHECK ((resultado_real_modelo = ANY (ARRAY['completo'::text, 'simplificado'::text]))),
  CONSTRAINT "declaracoes_resultado_real_tipo_check" CHECK ((resultado_real_tipo = ANY (ARRAY['restituicao'::text, 'pagar'::text, 'zero'::text]))),
  CONSTRAINT "declaracoes_user_id_ano_calendario_key" UNIQUE (user_id, ano_calendario)
);

ALTER TABLE "public"."declaracoes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."dependentes" (
  "id"                  uuid    NOT NULL DEFAULT gen_random_uuid(),
  "user_id"             uuid    NOT NULL,
  "declaracao_id"       uuid    NOT NULL,
  "apelido"             text    NOT NULL,
  "relacao"             text    NOT NULL,
  "em_outra_declaracao" boolean NOT NULL DEFAULT false,
  "teve_renda"          boolean NOT NULL DEFAULT false,
  CONSTRAINT "dependentes_pkey" PRIMARY KEY (id),
  CONSTRAINT "dependentes_relacao_check" CHECK ((relacao = ANY (ARRAY['filho_enteado'::text, 'conjuge'::text, 'pais_avos'::text, 'outro'::text])))
);

ALTER TABLE "public"."dependentes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."despesas" (
  "id"                 uuid    NOT NULL DEFAULT gen_random_uuid(),
  "user_id"            uuid    NOT NULL,
  "declaracao_id"      uuid    NOT NULL,
  "categoria"          text    NOT NULL,
  "tipo"               text    NOT NULL,
  "beneficiario"       text    NOT NULL,
  "dependente_id"      uuid,
  "valor_centavos"     bigint  NOT NULL,
  "reembolso_centavos" bigint  NOT NULL DEFAULT 0,
  "data"               date    NOT NULL,
  "descricao"          text,
  "base_legal_ok"      boolean,
  CONSTRAINT "despesas_beneficiario_check" CHECK ((beneficiario = ANY (ARRAY['titular'::text, 'dependente'::text, 'outra'::text]))),
  CONSTRAINT "despesas_categoria_check" CHECK ((categoria = ANY (ARRAY['saude'::text, 'educacao'::text, 'pensao'::text]))),
  CONSTRAINT "despesas_check" CHECK (((beneficiario = 'dependente'::text) = (dependente_id IS NOT NULL))),
  CONSTRAINT "despesas_pkey" PRIMARY KEY (id),
  CONSTRAINT "despesas_reembolso_centavos_check" CHECK ((reembolso_centavos >= 0)),
  CONSTRAINT "despesas_valor_centavos_check" CHECK ((valor_centavos > 0))
);

ALTER TABLE "public"."despesas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."fontes_pagadoras" (
  "id"                       uuid   NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                  uuid   NOT NULL,
  "declaracao_id"            uuid   NOT NULL,
  "dependente_id"            uuid,
  "nome"                     text   NOT NULL,
  "rendimentos_centavos"     bigint NOT NULL,
  "previdencia_centavos"     bigint NOT NULL DEFAULT 0,
  "irrf_centavos"            bigint NOT NULL DEFAULT 0,
  "decimo_terceiro_centavos" bigint NOT NULL DEFAULT 0,
  "irrf_13_centavos"         bigint NOT NULL DEFAULT 0,
  "plr_centavos"             bigint NOT NULL DEFAULT 0,
  CONSTRAINT "fontes_pagadoras_decimo_terceiro_centavos_check" CHECK ((decimo_terceiro_centavos >= 0)),
  CONSTRAINT "fontes_pagadoras_irrf_13_centavos_check" CHECK ((irrf_13_centavos >= 0)),
  CONSTRAINT "fontes_pagadoras_irrf_centavos_check" CHECK ((irrf_centavos >= 0)),
  CONSTRAINT "fontes_pagadoras_pkey" PRIMARY KEY (id),
  CONSTRAINT "fontes_pagadoras_plr_centavos_check" CHECK ((plr_centavos >= 0)),
  CONSTRAINT "fontes_pagadoras_previdencia_centavos_check" CHECK ((previdencia_centavos >= 0)),
  CONSTRAINT "fontes_pagadoras_rendimentos_centavos_check" CHECK ((rendimentos_centavos >= 0))
);

ALTER TABLE "public"."fontes_pagadoras"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."perfis" (
  "id"                   uuid                     NOT NULL,
  "nome"                 text,
  "consentimento_versao" text                     NOT NULL,
  "consentimento_em"     timestamp with time zone NOT NULL,
  CONSTRAINT "perfis_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."perfis"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."declaracoes"
  ADD CONSTRAINT "declaracoes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."dependentes"
  ADD CONSTRAINT "dependentes_declaracao_id_fkey" FOREIGN KEY (declaracao_id) REFERENCES public.declaracoes(id) ON DELETE CASCADE;

ALTER TABLE "public"."dependentes"
  ADD CONSTRAINT "dependentes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."despesas"
  ADD CONSTRAINT "despesas_declaracao_id_fkey" FOREIGN KEY (declaracao_id) REFERENCES public.declaracoes(id) ON DELETE CASCADE;

ALTER TABLE "public"."despesas"
  ADD CONSTRAINT "despesas_dependente_id_fkey" FOREIGN KEY (dependente_id) REFERENCES public.dependentes(id) ON DELETE CASCADE;

ALTER TABLE "public"."despesas"
  ADD CONSTRAINT "despesas_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."fontes_pagadoras"
  ADD CONSTRAINT "fontes_pagadoras_declaracao_id_fkey" FOREIGN KEY (declaracao_id) REFERENCES public.declaracoes(id) ON DELETE CASCADE;

ALTER TABLE "public"."fontes_pagadoras"
  ADD CONSTRAINT "fontes_pagadoras_dependente_id_fkey" FOREIGN KEY (dependente_id) REFERENCES public.dependentes(id) ON DELETE CASCADE;

ALTER TABLE "public"."fontes_pagadoras"
  ADD CONSTRAINT "fontes_pagadoras_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."perfis"
  ADD CONSTRAINT "perfis_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "dono" ON "public"."declaracoes"
  FOR ALL
  TO PUBLIC
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "dono" ON "public"."dependentes"
  FOR ALL
  TO PUBLIC
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "dono" ON "public"."despesas"
  FOR ALL
  TO PUBLIC
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "dono" ON "public"."fontes_pagadoras"
  FOR ALL
  TO PUBLIC
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "dono" ON "public"."perfis"
  FOR ALL
  TO PUBLIC
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."declaracoes" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."declaracoes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."declaracoes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."declaracoes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dependentes" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."dependentes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dependentes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dependentes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."despesas" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."despesas" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."despesas" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."despesas" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."fontes_pagadoras" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."fontes_pagadoras" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."fontes_pagadoras" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."fontes_pagadoras" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."perfis" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."perfis" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."perfis" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."perfis" TO "service_role";

