<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PageCard from '@/components/PageCard.vue'
import { PRIVACY_CONSENT_TEXT, PRIVACY_POLICY_VERSION } from '@/utils/privacy'

const contactEmail = import.meta.env.VITE_PRIVACY_CONTACT_EMAIL?.trim()
</script>

<template>
  <PageCard eyebrow="Seus dados" title="Política de privacidade">
    <div class="privacy-content">
      <p>RendaFacil · Versão {{ PRIVACY_POLICY_VERSION }} · Atualizada em 5 de novembro de 2026.</p>

      <section aria-labelledby="privacy-data">
        <h2 id="privacy-data">Dados coletados</h2>
        <p>
          Tratamos nome, e-mail, telefone opcional, credenciais de acesso e o registro de
          consentimento (versão da política e data da autorização). Também tratamos os rendimentos,
          a quantidade de dependentes e os rendimentos dos dependentes que você informar. Despesas
          de saúde, quando informadas para o cálculo, são dados pessoais sensíveis. Os serviços de
          infraestrutura podem tratar registros técnicos de acesso, como endereço IP, navegador,
          data e hora, para funcionamento e segurança.
        </p>
      </section>

      <section aria-labelledby="privacy-purpose">
        <h2 id="privacy-purpose">Finalidade e base legal</h2>
        <p>
          Usamos os dados para criar e manter sua conta e calcular e apresentar estimativas do
          Imposto de Renda a partir das informações fornecidas. O tratamento descrito nesta política
          tem como base legal o seu consentimento, nos termos do art. 7º, I, da LGPD. Para despesas
          de saúde, o consentimento é específico e destacado, conforme o art. 11, I, da LGPD. Esses
          dados não são usados para publicidade.
        </p>
        <p>Ao criar uma conta, você autoriza expressamente:</p>
        <blockquote>{{ PRIVACY_CONSENT_TEXT }}</blockquote>
        <p>
          A autorização não vem marcada. Você pode revogá-la a qualquer momento; a revogação impede
          novos tratamentos baseados nela e não invalida os realizados anteriormente. Sem essa
          autorização, não é possível criar a conta para usar o serviço.
        </p>
      </section>

      <section aria-labelledby="privacy-processors">
        <h2 id="privacy-processors">Operadores</h2>
        <p>
          O Supabase fornece autenticação e armazenamento dos dados de conta e de consentimento. A
          Vercel fornece hospedagem e entrega da aplicação. Esses operadores tratam os dados
          necessários à prestação desses serviços. O uso dessas infraestruturas pode envolver
          processamento fora do Brasil, sujeito às garantias aplicáveis da LGPD.
        </p>
      </section>

      <section aria-labelledby="privacy-retention">
        <h2 id="privacy-retention">Tempo de guarda e exclusão</h2>
        <p>
          Os dados da conta e o registro de consentimento são mantidos enquanto a conta estiver
          ativa. A exclusão da conta remove o cadastro e o perfil associado, incluindo o registro de
          consentimento. Atualmente, rendimentos e dependentes ficam apenas na memória desta sessão
          e são apagados ao recarregar a página, sair ou trocar de conta; não são sincronizados com
          o banco de dados.
        </p>
        <p>
          Registros técnicos e cópias de segurança seguem os ciclos de retenção dos operadores.
          Quando houver obrigação legal de conservação, apenas os dados necessários serão mantidos
          pelo prazo legal aplicável, com acesso restrito.
        </p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Seus direitos</h2>
        <p>
          Você pode pedir confirmação do tratamento, acesso, correção, anonimização, bloqueio ou
          eliminação de dados desnecessários, excessivos ou tratados em desacordo com a LGPD,
          portabilidade nos termos da regulamentação, informação sobre compartilhamento e eliminação
          dos dados tratados com consentimento, observadas as exceções legais. Pode também revogar o
          consentimento, obter informações sobre a possibilidade de não consentir e suas
          consequências e apresentar reclamação à ANPD.
        </p>
        <p>
          No perfil, você pode corrigir seus dados e solicitar a exclusão da conta. Para os demais
          pedidos ou para revogar o consentimento, utilize o canal abaixo. Poderemos solicitar a
          confirmação da sua identidade para proteger seus dados.
        </p>
      </section>

      <section aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">Canal de contato</h2>
        <p v-if="contactEmail">
          Para dúvidas ou solicitações sobre dados pessoais, entre em contato com o responsável pelo
          RendaFacil pelo e-mail
          <a :href="`mailto:${contactEmail}`">{{ contactEmail }}</a
          >. Não envie senhas nem documentos de saúde no primeiro contato.
        </p>
        <p v-else>O canal de atendimento sobre privacidade ainda não foi informado.</p>
      </section>

      <RouterLink to="/user">Voltar para minha conta</RouterLink>
    </div>
  </PageCard>
</template>

<style scoped>
.privacy-content {
  display: grid;
  gap: 1.5rem;
  text-align: left;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

h2 {
  margin-bottom: 0.5rem;
  color: var(--color-text);
  font-size: 1.125rem;
}

p + p {
  margin-top: 0.75rem;
}

blockquote {
  margin: 1rem 0;
  padding-left: 1rem;
  border-left: 3px solid var(--color-accent);
  color: var(--color-text);
}
</style>
