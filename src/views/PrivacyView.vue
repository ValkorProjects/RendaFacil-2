<script setup lang="ts">
import PageCard from '@/components/PageCard.vue'
</script>

<template>
  <PageCard eyebrow="Privacidade" title="Política de privacidade">
    <section aria-labelledby="data-collected-title">
      <h2 id="data-collected-title">Dados utilizados</h2>
      <p>
        Para criar e manter uma conta, são usados nome, e-mail e dados de autenticação. Para estimar
        o ajuste anual do Imposto de Renda, você pode informar rendimentos, previdência, imposto
        retido, dependentes, pensões e despesas dedutíveis. Isso pode incluir despesas de saúde, que
        são dados pessoais sensíveis, e informações de dependentes, inclusive crianças e
        adolescentes. Ao informar dados de dependentes, confirme que você tem autorização e observe
        o melhor interesse da criança ou do adolescente. Informe somente os dados necessários.
      </p>
    </section>

    <section aria-labelledby="purpose-title">
      <h2 id="purpose-title">Finalidade e consentimento</h2>
      <p>
        Os dados são usados para calcular e explicar uma estimativa do imposto ou da restituição. O
        resultado é informativo, não é uma declaração oficial nem substitui orientação profissional.
        A base legal para o tratamento é o consentimento, solicitado de forma obrigatória no
        cadastro e incluindo expressamente despesas de saúde. A versão e a data do aceite são
        registradas junto ao perfil.
      </p>
    </section>

    <section aria-labelledby="operators-title">
      <h2 id="operators-title">Operadores e armazenamento</h2>
      <p>
        O Supabase processa autenticação e armazena os dados do perfil e do consentimento. A Vercel
        hospeda e entrega o aplicativo. Para contas autenticadas, os dados da declaração — incluindo
        rendimentos, dependentes e despesas — são armazenados no Supabase e protegidos por políticas
        de acesso associadas à conta. Eles são carregados ao entrar e removidos da memória local ao
        sair; o aplicativo precisa de conexão para ler e salvar e não oferece sincronização offline.
        Os dados de perfil, consentimento e declaração são mantidos enquanto a conta existir e
        removidos com a exclusão da conta. Cópias técnicas dos operadores podem seguir os prazos de
        retenção e backup próprios desses serviços. Os dados não são vendidos nem usados para
        publicidade.
      </p>
    </section>

    <section aria-labelledby="rights-title">
      <h2 id="rights-title">Seus direitos e contato</h2>
      <p>
        Nos termos da LGPD, você pode solicitar confirmação do tratamento, acesso, correção,
        anonimização, bloqueio ou eliminação de dados desnecessários, informações sobre
        compartilhamento, portabilidade quando aplicável e revogação do consentimento. Use os
        controles do perfil para corrigir seus dados ou excluir a conta. Para outros pedidos ou
        dúvidas de privacidade, escreva para
        <a href="mailto:reservaluismedeiros@gmail.com">reservaluismedeiros@gmail.com</a>. Não envie
        dados pessoais em canais públicos.
      </p>
    </section>
  </PageCard>
</template>
