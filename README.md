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

1. **Questionário inicial:** coleta o básico (quantas empresas pagaram salário, dependentes, pensão, gastos com saúde e educação) e identifica situações que o app ainda não calcula, como aluguel recebido ou renda de autônomo.
2. **Rendas:** a pessoa lança o informe de rendimentos de cada empresa ou, antes de ele chegar, estima pelo salário mensal.
3. **Dependentes e dedutíveis:** cadastro de dependentes e de despesas de saúde, educação e pensão alimentícia, avisando quando uma despesa não deduz e por quê.
4. **Resultado:** a tela principal mostra um único valor (restituição ou imposto a pagar), o modelo recomendado e o cálculo detalhado nos dois modelos.

O cálculo segue as tabelas oficiais de 2026, incluindo a redução da Lei 15.270/2025, e está documentado com fórmulas e fontes em [`docs/calculo-irpf-2026.md`](docs/calculo-irpf-2026.md).

O resultado é uma **estimativa**. O que vale é a declaração entregue à Receita Federal.

## Situação do projeto

Em desenvolvimento, rumo ao MVP. As funcionalidades estão organizadas em issues com o prefixo `RF-` no [GitHub](https://github.com/ValkorProjects/RendaFacil-2/issues).

| Pronto                                                                                       | Em andamento ou planejado                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Motor de cálculo do ajuste anual e da folha mensal, com testes de casos de referência        | Cadastro, login e recuperação de senha                             |
| Parâmetros fiscais de 2026                                                                   | Questionário inicial com triagem                                   |
| Banco de dados no Supabase com ano-calendário e RLS (migrations em [`supabase/`](supabase/)) | Telas de Rendas, Dependentes e Dedutíveis na versão final          |
| Tela de Rendas com estimativa do imposto (dados ainda só em memória)                         | Home com o resultado e o detalhe do cálculo                        |
| Documentação do cálculo                                                                      | Consentimento, privacidade, exclusão de conta e deploy de produção |

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
| `VITE_SUPABASE_URL`             | Não\*       | URL do projeto no Supabase                  |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Não\*       | Chave publicável (antiga `anon`) do projeto |

\* O app roda sem elas, e a estimativa na tela de Rendas funciona. Elas só são necessárias para as partes que usam o banco e o login. Veja [Supabase](#supabase).

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

| Comando                       | O que faz                                                            |
| ----------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                 | Sobe o servidor de desenvolvimento e abre o navegador                |
| `npm run build`               | Confere os tipos e gera a versão de produção em `dist/`              |
| `npm run preview`             | Serve a versão de produção localmente                                |
| `npm run type-check`          | Confere os tipos com `vue-tsc`                                       |
| `npm test`                    | Roda os testes uma vez, com Vitest                                   |
| `npm run test:watch`          | Roda os testes e repete a cada alteração                             |
| `npm run lint`                | Roda o ESLint e corrige o que for automático                         |
| `npm run format`              | Formata `src/` com Prettier                                          |
| `npm run generate-pwa-assets` | Gera de novo os ícones em `public/` a partir de `public/favicon.svg` |

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
│   ├── components/            Componentes reutilizáveis (navegação, cartões, ícones)
│   │   └── TaxEstimateCard.vue  Estimativa do imposto e "Ver o cálculo" na tela de Rendas
│   ├── composables/
│   │   └── usePwaInstall.ts   Botão "Instalar app"
│   ├── irpf/                  Motor de cálculo do IRPF (funções puras, valores em centavos)
│   │   ├── parametros/        Tabelas e valores de cada ano-calendário
│   │   └── __tests__/         Casos de referência do motor
│   ├── lib/supabase.ts        Cliente do Supabase
│   ├── router/index.ts        Rotas
│   ├── stores/                Estado global (sessão do usuário, rendas da tela de Rendas)
│   ├── types/database.types.ts  Tipos do banco
│   ├── utils/                 Formatação de moeda e do resultado
│   ├── views/                 Uma tela por arquivo
│   ├── App.vue                Estrutura do app: tela atual e navegação
│   └── main.ts                Ponto de entrada
├── supabase/
│   ├── config.toml            Configuração do Supabase local
│   └── migrations/            Tabelas e políticas de acesso (RLS) do banco
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

O banco guarda uma declaração por usuário e por ano-calendário, com as tabelas `perfis`, `declaracoes`, `fontes_pagadoras`, `dependentes` e `despesas`. Todas têm RLS (Row Level Security): cada usuário autenticado só lê e altera os próprios dados. A estrutura está nas migrations em [`supabase/migrations/`](supabase/migrations/).

### Conectar um projeto

1. No [painel do Supabase](https://supabase.com/dashboard), abra **Project Settings → API** e copie a **Project URL** e a chave **publishable** (em projetos antigos, `anon`).
2. Cole no `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. Reinicie o servidor. A tela de usuário passa a mostrar que o Supabase está configurado.

> **Segurança:** toda variável `VITE_` vai junto com o código para o navegador. Só a chave publicável pode ficar aqui, nunca uma chave `secret` ou `service_role`. Os dados ficam protegidos pelas políticas de RLS de cada tabela.

### Usar o cliente

```ts
import { getSupabase } from '@/lib/supabase'

const { data, error } = await getSupabase().from('declaracoes').select()
```

`getSupabase()` devolve um cliente único, criado na primeira chamada. Se as variáveis estiverem faltando, ele lança um erro explicando o que fazer. Para código que precisa funcionar sem o Supabase, confira antes `isSupabaseConfigured`, do mesmo arquivo.

[`src/stores/auth.ts`](src/stores/auth.ts) acompanha a sessão e expõe `session` e `user`, além de `signIn`, `signUp` e `signOut`.

### Tipos do banco

Para gerar os tipos do TypeScript a partir do banco:

```bash
npx supabase login
```

```bash
npx supabase gen types typescript --project-id seu-project-ref > src/types/database.types.ts
```

No Windows, rode o segundo comando no Prompt de Comando, no Git Bash ou no PowerShell 7+. O Windows PowerShell 5.1 salva a saída de `>` em UTF-16, e o Vite e o ESLint não conseguem ler o arquivo. Gere os tipos de novo sempre que o banco mudar.

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
4. Abra o pull request para a `dev`, citando a issue. A `main` recebe a `dev` quando uma versão está pronta.
5. Mudança no cálculo precisa de caso de teste e, se mudar uma regra, de atualização em [`docs/calculo-irpf-2026.md`](docs/calculo-irpf-2026.md).

## Problemas comuns

**O navegador mostra uma versão antiga em `localhost`.** Um service worker de uma sessão anterior ainda está servindo arquivos em cache. Abra o DevTools → **Application → Service workers → Unregister** e recarregue a página.

**A opção de instalar não aparece.** Confira se a página está em HTTPS ou em `localhost`, se o app já não está instalado e se não é uma janela anônima.

**Erro `Supabase is not configured`.** Falta uma das duas variáveis no `.env`, ou o servidor não foi reiniciado depois da alteração.
