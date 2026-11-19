# RendaFacil

App web que ajuda o trabalhador assalariado a estimar o resultado da própria declaração do Imposto de Renda: se vai ter **restituição** ou **imposto a pagar**, e por quê.

A primeira versão estima a **declaração de 2027, com a renda de 2026**, para quem recebe salário (CLT).

## Sumário

- [O problema](#o-problema)
- [O que o app faz](#o-que-o-app-faz)
- [Situação do projeto](#situação-do-projeto)
- [Tecnologias](#tecnologias)
- [Como rodar](#como-rodar)
- [Scripts](#scripts)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Motor de cálculo](#motor-de-cálculo)
- [Supabase](#supabase)
- [Progressive Web App](#progressive-web-app)
- [Deploy](#deploy)
- [Como contribuir](#como-contribuir)
- [Problemas comuns](#problemas-comuns)

## O problema

Todo mês, a empresa desconta o IR do salário. Na declaração do ano seguinte, a conta é refeita com a renda do ano inteiro, e o resultado pode ser uma restituição ou uma cobrança. Muita gente só descobre qual dos dois na hora de declarar, sem entender de onde veio o valor.

Mesmo quem tem uma empresa só e salário igual o ano todo pode ter imposto a pagar no ajuste. Além disso, é comum errar o que pode ser deduzido: na pesquisa feita pelo projeto, 13 de 35 pessoas achavam que remédio de farmácia deduz, e não deduz.

O RendaFacil quer responder, antes da declaração:

- quanto a pessoa deve receber ou pagar no ajuste anual;
- qual modelo vale mais a pena, o completo ou o simplificado;
- quais despesas reduzem o imposto e quanto cada uma vale;
- de onde vem cada número, passo a passo.

## O que o app faz

Quando o MVP estiver completo, o fluxo terá quatro etapas. Elas descrevem o produto planejado, não quatro telas já concluídas. O que funciona hoje está em [Situação do projeto](#situação-do-projeto).

1. **Questionário inicial:** coleta o básico (quantas empresas pagaram salário, dependentes, pensão, gastos com saúde e educação) e identifica situações que o app ainda não calcula, como aluguel recebido ou renda de autônomo.
2. **Rendas:** a pessoa lança o informe de rendimentos de cada empresa ou, antes de ele chegar, estima pelo salário mensal.
3. **Dependentes e dedutíveis:** cadastro de dependentes e de despesas de saúde, educação e pensão alimentícia, avisando quando uma despesa não deduz e por quê.
4. **Resultado:** a tela principal mostra um único valor (restituição ou imposto a pagar), o modelo recomendado e o cálculo detalhado nos dois modelos.

O cálculo segue as tabelas oficiais de 2026, incluindo a redução da Lei 15.270/2025, e está documentado com fórmulas e fontes em [`docs/calculo-irpf-2026.md`](docs/calculo-irpf-2026.md).

O resultado é uma **estimativa**. O que vale é a declaração entregue à Receita Federal.

## Situação do projeto

Em desenvolvimento, rumo ao MVP. As funcionalidades estão organizadas em issues com o prefixo `RF-` no [GitHub](https://github.com/ValkorProjects/RendaFacil-2/issues).

| Pronto                                                                                | Em andamento ou planejado                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Motor de cálculo do ajuste anual e da folha mensal, com testes de casos de referência | Questionário inicial com triagem                             |
| Parâmetros fiscais de 2026                                                            | Persistência das rendas e dos dependentes no Supabase        |
| Estrutura do banco e políticas RLS definidas em [`supabase/`](supabase/)              | Telas finais de Rendas e Dedutíveis             |
| Tela de Rendas com estimativa do imposto (dados ainda só em memória)                  | Home com o resultado e o detalhe do cálculo                  |
| Cadastro, login, perfil, consentimento e política de privacidade                      | Publicação da Edge Function de exclusão e deploy de produção |
| Documentação do cálculo                                                               |                                                              |
| Layout base: saudação, barra inferior (Home, Rendas, Dedutíveis, Menu)                |                                                              |
| Cadastro de dependentes em `/dependentes`, com acesso pelo Menu e questionário de Rendas |                                                          |

O cadastro de dependentes guarda apenas apelido, relação, presença em outra declaração e renda
própria em 2026. Dependentes em outra declaração, suas rendas e despesas ficam fora do cálculo.
Cada dependente válido deduz R$ 2.275,08 no modelo completo. Quando há renda própria sem informe
salvo em Rendas no campo “De quem é o rendimento?”, a estimativa fica provisória.
Ao marcar “Teve renda própria em 2026?” no cadastro do dependente, abre-se um questionário com
tipo de rendimento, valor mensal, INSS e IR retido, com suporte a várias fontes. Os rendimentos
são salvos junto com o dependente e aparecem automaticamente em Rendas. A opção “Preencher
depois” mantém a pendência; editar o dependente recupera os valores já cadastrados.

Dedutíveis permite lançar despesas anuais de saúde e educação com beneficiário; o motor aplica
o limite de educação por pessoa. Ao excluir um dependente, a confirmação lista suas despesas
e informa a remoção dos rendimentos vinculados. Todos esses dados ainda ficam em memória nesta
sessão, sem persistência após recarregar a página. O questionário inicial separado segue planejado;
o acesso atual ao cadastro está no formulário de Rendas.

Fora do escopo do MVP: aluguel recebido, autônomo, MEI ou PJ (carnê-leão), aposentadoria, ganho de capital, bolsa de valores, renda do exterior e previdência privada. A lista completa está na [seção 9 da documentação do cálculo](docs/calculo-irpf-2026.md#9-fora-do-escopo-do-mvp).

## Tecnologias

| Área           | Ferramenta                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Framework      | [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)             |
| Linguagem      | [TypeScript](https://www.typescriptlang.org/)                               |
| Build          | [Vite](https://vite.dev/)                                                   |
| Rotas          | [Vue Router](https://router.vuejs.org/)                                     |
| Estado         | [Pinia](https://pinia.vuejs.org/)                                           |
| App instalável | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Workbox)              |
| Backend        | [Supabase](https://supabase.com/) (Postgres, autenticação e RLS)            |
| Qualidade      | ESLint, Prettier, `vue-tsc`, [Vitest](https://vitest.dev/) e GitHub Actions |

## Como rodar

### Pré-requisitos

- [Node.js](https://nodejs.org/) `24.x`, a versão de `engines` no `package.json`.
- npm 11 ou mais novo, que já vem com o Node.js 24. Use-o para instalar ou atualizar dependências: o npm 10 não resolve as dependências opcionais do Vite 8 e reescreve o `package-lock.json`.

### Instalação

```bash
npm install
```

### Variáveis de ambiente

O app lê a configuração do arquivo `.env`, que não vai para o Git. Num clone novo, crie-o a partir do exemplo:

```bash
cp .env.example .env
```

| Variável                        | Obrigatória | Descrição                                   |
| ------------------------------- | ----------- | ------------------------------------------- |
| `VITE_SUPABASE_URL`             | Sim         | URL do projeto no Supabase                  |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim         | Chave publicável (antiga `anon`) do projeto |

Os valores de `.env.example` são exemplos, não credenciais válidas. Depois de copiar o arquivo,
substitua-os pelos valores do seu projeto Supabase. Se qualquer uma das variáveis estiver faltando,
o perfil informa que o acesso e o cadastro estão indisponíveis e as telas privadas não podem ser
acessadas. Veja
[Supabase](#supabase).

Reinicie o servidor depois de alterar o `.env`.

### Servidor de desenvolvimento

```bash
npm run dev
```

O app abre no navegador em <http://localhost:5173>. Se a porta estiver ocupada, o Vite usa a próxima livre e mostra o endereço no terminal. As alterações no código aparecem na hora.

Para abrir no celular, na mesma rede Wi-Fi:

```bash
npm run dev -- --host
```

Depois, abra no celular o endereço "Network" que o Vite mostra. Por `http://192.168…` o app abre, mas não pode ser instalado (veja [Progressive Web App](#progressive-web-app)).

## Scripts

| Comando                       | O que faz                                                                |
| ----------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                 | Sobe o servidor de desenvolvimento e abre o navegador                    |
| `npm run build`               | Confere os tipos e gera a versão de produção em `dist/`                  |
| `npm run preview`             | Serve a versão de produção localmente                                    |
| `npm run type-check`          | Confere os tipos com `vue-tsc`                                           |
| `npm test`                    | Roda o Vitest e os testes de perfil e ciclo de vida da conta em `tests/` |
| `npm run test:watch`          | Roda os testes e repete a cada alteração                                 |
| `npm run lint`                | Roda o ESLint e corrige o que for automático                             |
| `npm run format`              | Formata `src/` com Prettier                                              |
| `npm run generate-pwa-assets` | Gera de novo os ícones em `public/` a partir de `public/favicon.svg`     |

Todo pull request para `dev` ou `main` roda no GitHub Actions o ESLint, a checagem do Prettier, os testes, a checagem de tipos e o build ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Rode as mesmas checagens antes de enviar:

```bash
npm run lint
```

```bash
npx prettier --check src/
```

```bash
npm test
```

```bash
npm run build
```

## Estrutura do projeto

```text
├── .github/workflows/ci.yml   Checagens de todo pull request
├── docs/
│   └── calculo-irpf-2026.md   Fórmulas, parâmetros e fontes do cálculo
├── public/                    Arquivos estáticos (favicon e ícones do app)
├── src/
│   ├── assets/main.css        Estilos globais e variáveis de cor
│   ├── components/            Componentes reutilizáveis (cabeçalho, navegação, cartões, ícones,
│   │                          carregando, lista vazia, erro e confirmação de exclusão)
│   │   └── TaxEstimateCard.vue  Estimativa do imposto e "Ver o cálculo" na tela de Rendas
│   ├── composables/
│   │   └── usePwaInstall.ts   Botão "Instalar app"
│   ├── irpf/                  Motor de cálculo do IRPF (funções puras, valores em centavos)
│   │   ├── parametros/        Tabelas e valores de cada ano-calendário
│   │   └── __tests__/         Casos de referência do motor
│   ├── lib/supabase.ts        Cliente do Supabase
│   ├── router/                Rotas (index.ts) e abas da barra inferior (tabs.ts)
│   ├── stores/                Estado global (sessão do usuário, rendas da tela de Rendas)
│   ├── types/database.types.ts  Tipos do banco
│   ├── utils/                 Formatação de moeda e do resultado
│   ├── views/                 Uma tela por arquivo
│   ├── App.vue                Estrutura do app: saudação, tela atual e barra inferior
│   └── main.ts                Ponto de entrada
├── supabase/
│   ├── config.toml            Configuração do Supabase local
│   ├── functions/             Edge Function delete-account (exclusão de conta)
│   ├── migrations/            Tabelas e políticas de acesso (RLS) do banco
│   └── tests/database/        Testes de RLS e privilégios (pgTAP)
├── tests/                     Testes Node de perfil e exclusão de conta
├── .env.example               Modelo das variáveis de ambiente
├── vite.config.ts             Configuração do Vite e do PWA
└── vitest.config.ts           Configuração dos testes
```

Nos imports, `@/` é um atalho para `src/`, como em `import PageCard from '@/components/PageCard.vue'`.

## Motor de cálculo

O cálculo fica em [`src/irpf/`](src/irpf/), separado das telas. As telas só montam a entrada e mostram o resultado, sem fazer conta própria.

- **Funções puras:** recebem os dados e os parâmetros do ano e devolvem o resultado, sem acessar banco ou tela. A mesma entrada sempre dá o mesmo resultado.
- **Dinheiro em centavos:** todo valor é um número inteiro de centavos, e as multiplicações por alíquota arredondam ao centavo de forma definida. Não há `float` em conta de dinheiro.
- **Parâmetros por ano:** os valores da lei ficam só em [`src/irpf/parametros/2026.ts`](src/irpf/parametros/2026.ts). Para o ano seguinte, basta um arquivo novo.
- **Os dois modelos:** o motor calcula o completo e o simplificado, escolhe o de menor imposto e devolve os valores intermediários de cada um, para a tela explicar a conta.

```ts
import { calcularAjusteAnual, montarEntrada } from '@/irpf'

const resultado = calcularAjusteAnual(montarEntrada({ fontes, dependentes, despesas }))

resultado.resultado // > 0 restituição · < 0 imposto a pagar · 0 sem saldo
resultado.modelo // 'completo' ou 'simplificado'
```

As fórmulas, a tabela de parâmetros com as fontes oficiais, as regras de arredondamento e um exemplo completo estão em [`docs/calculo-irpf-2026.md`](docs/calculo-irpf-2026.md). Todo erro de cálculo encontrado deve virar um caso novo nos testes.

## Supabase

As migrations em [`supabase/migrations/`](supabase/migrations/) definem as tabelas `perfis`,
`declaracoes`, `fontes_pagadoras`, `dependentes` e `despesas`, com políticas RLS (Row Level Security)
para restringir o acesso aos dados do usuário autenticado. A tela de Rendas ainda mantém rendimentos
e dependentes apenas em memória; a persistência deles no Supabase ainda está planejada.

### Conectar um projeto

1. Crie um projeto no [painel do Supabase](https://supabase.com/dashboard). Em **Project Settings → API**, copie a **Project URL** e a chave **publishable** (em projetos antigos, `anon`).
2. Substitua os valores de exemplo no `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. Em **Authentication → URL Configuration**, defina a Site URL e permita o redirecionamento para o perfil (`http://localhost:5173/user` no desenvolvimento e a URL `/user` do app publicado). Se o app estiver em um subdiretório, inclua o caminho base.
4. Ative o provedor de e-mail. Durante o desenvolvimento, a confirmação de e-mail fica desativada no projeto por causa do limite de envios do Supabase. O SMTP próprio e a confirmação de e-mail ficam para depois do MVP, conforme a [issue #35](https://github.com/ValkorProjects/RendaFacil-2/issues/35). Reinicie o servidor: o **Perfil** passa a oferecer **Entrar** e **Criar conta**. Sem uma sessão ativa, as telas privadas ficam inacessíveis; a política de privacidade continua pública.

> **Segurança:** toda variável `VITE_` vai junto com o código para o navegador. Só a chave publicável pode ficar aqui, nunca uma chave `secret` ou `service_role`. Os dados ficam protegidos pelas políticas de RLS de cada tabela.

### Usar o cliente

```ts
import { getSupabase } from '@/lib/supabase'

const { data, error } = await getSupabase().from('declaracoes').select()
```

`getSupabase()` devolve um cliente único, criado na primeira chamada. Se as variáveis estiverem faltando, ele lança um erro explicando o que fazer. Para código que precisa funcionar sem o Supabase, confira antes `isSupabaseConfigured`, do mesmo arquivo.

[`src/stores/auth.ts`](src/stores/auth.ts) acompanha a sessão e expõe `session`, `user`, `ready`,
`initializationError` e `isGuest`. As ações incluem entrar, criar conta, atualizar perfil e e-mail,
alterar e recuperar senha, reenviar confirmação de cadastro, sair e excluir a conta. O cadastro exige
aceite da política de privacidade; a versão e a data do aceite são gravadas em `perfis` pelo trigger.

### Exclusão de conta

A exclusão depende da Edge Function
[`delete-account`](supabase/functions/delete-account/index.ts), que precisa ser publicada no mesmo
projeto Supabase usado pelo app:

```bash
npx supabase functions deploy delete-account --project-ref SEU_PROJECT_REF --no-verify-jwt
```

A função valida a sessão com `auth.getUser`, recusa usuários anônimos, encerra as sessões e exclui
somente a conta autenticada. O Supabase fornece `SUPABASE_SERVICE_ROLE_KEY` ao ambiente da função;
nunca coloque essa chave em variáveis `VITE_` ou no frontend. Até a função ser publicada, a exclusão
da conta mostra um erro e não informa sucesso.

### Tipos do banco

Para gerar os tipos do TypeScript a partir do banco:

```bash
npx supabase login
```

```bash
npx supabase gen types typescript --project-id seu-project-ref > src/types/database.types.ts
```

### Testes do banco (RLS)

O app fala com o Supabase direto do navegador, com a chave pública. A única barreira entre um usuário e os dados de outro são as políticas de RLS e os privilégios definidos nas migrations. Se uma migration apagar uma política ou liberar um privilégio, nada no app quebra, e a falha fica aberta. Os testes em [`supabase/tests/database/`](supabase/tests/database/) conferem isso automaticamente, com [pgTAP](https://pgtap.org/), num banco criado do zero pelas migrations:

- um usuário não lê, não altera, não apaga e não cria dados de outro, nem dentro da declaração de outro;
- `anon` não tem nenhum privilégio, e `authenticated` tem só `SELECT`, `INSERT`, `UPDATE` e `DELETE` (em `perfis`, só `SELECT`: o registro do aceite não pode ser alterado);
- toda tabela de `public` tem RLS ligada, nenhuma view ignora a RLS e nenhuma função `security definer` pode ser chamada por `anon` ou `authenticated`;
- o cadastro cria o perfil e a declaração de 2026, é recusado sem o aceite da política de privacidade, e o usuário não altera nem apaga o registro do aceite;
- apagar o usuário em `auth.users` apaga todas as linhas dele;
- dinheiro fica só em `bigint`, e não há colunas de CPF, data de nascimento ou diagnóstico.

Para rodar localmente, é preciso ter o [Docker](https://docs.docker.com/get-started/get-docker/) instalado e aberto. Suba o Postgres local (a primeira vez baixa as imagens e demora alguns minutos):

```bash
npx supabase db start
```

```bash
npx supabase test db
```

Depois de mudar uma migration, recrie o banco antes de testar de novo:

```bash
npx supabase db reset
```

Para desligar os containers ao terminar:

```bash
npx supabase stop
```

No CI, o job `database` roda esses testes nos pull requests que mudam algo em `supabase/`, no `.github/workflows/ci.yml`, no `package.json` ou no `package-lock.json` (que fixam a versão da CLI do Supabase).

Uma tabela nova em `public` precisa de RLS ligada, de políticas e de `revoke` dos privilégios que o Supabase concede por padrão a `anon` e `authenticated`. Sem isso, os testes falham.

### Funcionamento offline

O app guarda em cache apenas os próprios arquivos. As consultas ao Supabase sempre vão para a rede, então os dados não ficam disponíveis offline.

## Progressive Web App

O RendaFacil pode ser instalado no celular e no computador como um app. A configuração fica em `vite.config.ts`, e o `vite-plugin-pwa` gera o manifesto (nome, cores e ícones) e o service worker, que guarda os arquivos do app para abrir mais rápido e funcionar sem internet. Quando sai uma versão nova, ela é baixada em segundo plano e vale na próxima vez que o app for aberto.

O navegador só oferece a instalação em **HTTPS** ou em **`localhost`**.

### Instalar

- **Chrome ou Edge no computador:** clique no ícone **Instalar** no fim da barra de endereço, ou no botão **Instalar app** do app.
- **Chrome no Android:** toque em **Instalar app** no app, ou em **⋮ → Adicionar à tela inicial → Instalar**.
- **Safari no iPhone e no iPad:** toque em **Compartilhar → Adicionar à Tela de Início → Adicionar**. O iOS não tem aviso de instalação, então o botão do app não aparece.
- **Safari no Mac:** **Arquivo → Adicionar ao Dock… → Adicionar**.

### Testar localmente

O `npm run dev` não registra o service worker, para não servir arquivos antigos durante o desenvolvimento. Para testar a instalação e o funcionamento offline, use a versão de produção:

```bash
npm run build
```

```bash
npm run preview
```

### Trocar o ícone

1. Substitua `public/favicon.svg` (um SVG quadrado com fundo transparente funciona melhor).
2. Rode `npm run generate-pwa-assets` para gerar de novo os PNG e o ICO em `public/`.

A cor de fundo dos ícones da tela inicial fica em `pwa-assets.config.ts`.

## Deploy

`npm run build` gera o site estático em `dist/`, que pode ser servido por uma hospedagem estática.
Para produção:

- **HTTPS** é necessário para o service worker e a instalação do app.
- **Fallback da SPA:** como o roteador usa URLs limpas (por exemplo, `/income`), a hospedagem precisa
  servir `index.html` para caminhos desconhecidos.
- **Variáveis de ambiente:** configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas
  configurações de build da hospedagem. O Vite as incorpora ao app durante o build; alterar os valores
  exige gerar e publicar um novo build.

O processo de deploy de produção, incluindo hospedagem, URL e release, está sendo acompanhado na
[issue #20 (RF-19)](https://github.com/ValkorProjects/RendaFacil-2/issues/20).

## Como contribuir

1. Escolha uma issue e crie uma branch a partir da `dev`, com prefixo pelo tipo: `feature/`, `fix/` ou `docs/`.

   ```bash
   git checkout dev
   ```

   ```bash
   git pull
   ```

   ```bash
   git checkout -b feature/nome-da-funcionalidade
   ```

2. Faça commits pequenos, com mensagens em português que digam o que mudou.
3. Rode as checagens da seção [Scripts](#scripts) antes de enviar.
4. Abra o pull request para a `dev` e referencie a issue com `Refs #N`. Não use `Closes #N`: o GitHub só fecha issues automaticamente quando o PR é integrado à branch padrão (`main`), e este PR vai primeiro para `dev`. A `main` recebe a `dev` quando uma versão está pronta.
5. Depois do merge e de confirmar os critérios de aceite, feche a issue manualmente.
6. Mudança no cálculo precisa de caso de teste e, se mudar uma regra, de atualização em [`docs/calculo-irpf-2026.md`](docs/calculo-irpf-2026.md).

## Problemas comuns

**O navegador mostra uma versão antiga em `localhost`.** Um service worker de uma sessão anterior ainda está servindo arquivos em cache. Abra o DevTools → **Application → Service workers → Unregister** e recarregue a página.

**A opção de instalar não aparece.** Confira se a página está em HTTPS ou em `localhost`, se o app já não está instalado e se não é uma janela anônima.

**Acesso e cadastro de contas estão indisponíveis.** O perfil mostra esse aviso quando falta uma das
variáveis do Supabase. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores
do seu projeto no `.env` e reinicie o servidor. Se os valores de exemplo ou credenciais inválidas
estiverem preenchidos, o formulário pode aparecer, mas a autenticação não funcionará. Sem uma sessão,
as telas privadas ficam inacessíveis; a política de privacidade continua pública.
