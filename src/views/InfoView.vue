<script setup lang="ts">
import PageCard from '@/components/PageCard.vue'
import { usePwaInstall } from '@/composables/usePwaInstall'

const { isInstalled } = usePwaInstall()
</script>

<template>
  <PageCard eyebrow="Sobre a estimativa" title="Como o RendaFacil calcula">
    <section aria-labelledby="premissas-title">
      <h2 id="premissas-title">Premissas</h2>
      <ul>
        <li>
          Estima a declaração de 2027, com os rendimentos de 2026, pelas tabelas e regras de 2026,
          incluindo a Lei 15.270/2025.
        </li>
        <li>
          Calcula os dois modelos, completo e simplificado, e recomenda o que dá o menor imposto.
        </li>
        <li>
          O resultado compara o imposto devido no ano com o que já foi retido na fonte: a diferença
          é a restituição ou o imposto a pagar.
        </li>
      </ul>
    </section>

    <section aria-labelledby="fora-title">
      <h2 id="fora-title">O que ainda fica de fora</h2>
      <ul>
        <li>
          Rendimentos que não são salário: aluguel, trabalho autônomo, MEI ou PJ, aposentadoria e
          renda do exterior.
        </li>
        <li>Ganho de capital, bolsa e aplicações financeiras.</li>
        <li>Previdência complementar (PGBL), livro-caixa, doações e incentivos.</li>
      </ul>
    </section>

    <section aria-labelledby="fontes-title">
      <h2 id="fontes-title">Fontes oficiais</h2>
      <ul>
        <li>
          <a
            href="https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026"
            target="_blank"
            rel="noopener"
            >Tabelas do IRPF 2026 (Receita Federal)</a
          >
        </li>
        <li>
          <a
            href="https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm"
            target="_blank"
            rel="noopener"
            >Lei 15.270/2025</a
          >
        </li>
        <li>
          <a
            href="https://www27.receita.fazenda.gov.br/simulador-irpf/"
            target="_blank"
            rel="noopener"
            >Simulador oficial da Receita</a
          >
        </li>
      </ul>
    </section>

    <p class="disclaimer">
      Estimativa. Não substitui a declaração oficial nem a orientação de um contador.
    </p>
    <p class="installed">App instalado neste aparelho: {{ isInstalled ? 'sim' : 'não' }}</p>
  </PageCard>
</template>

<style scoped>
section {
  display: grid;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
}

h2 {
  font-size: 1rem;
}

ul {
  display: grid;
  gap: 0.375rem;
  margin: 0;
  padding-left: 1.25rem;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

a {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  color: var(--color-accent);
}

.disclaimer,
.installed {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
</style>
