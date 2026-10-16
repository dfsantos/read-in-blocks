# E0 — Fundação

Infraestrutura mínima para entregar fatias verticais com segurança. Persona: **Desenvolvedor** (histórias técnicas, sem valor direto ao leitor).

---

### US-000 — Aprovar PRD, stack e plano
**Como** responsável pelo produto, **quero** revisar e aprovar o PRD, a stack e este plano, **para** autorizar o início do desenvolvimento.
**Cobre:** — · **Tamanho:** P · **Depende de:** — · **Bloqueios:** —

> **O que é esta história:** é o *portão de aprovação* do planejamento, sem código. "Em validação" significa que o pacote de documentos está entregue e aguarda o seu aceite. Nada de desenvolvimento começa antes dela ser **Aprovada**.

**O que revisar**
| Item | Onde |
|---|---|
| Produto (PRD, com autor e decisões D-01, D-02 aplicadas) | [prd-read-in-blocks.md](../../prd/prd-read-in-blocks.md) |
| Stack e versões fixadas (13 itens exatos, o restante como linha) | [tech-stack.md](../../architecture/tech-stack.md), [stack-versions.md](../../architecture/stack-versions.md) |
| Decisões técnicas (ADR-0001 a 0013, hoje "Proposto") | [adr/](../../adr/README.md) |
| Segurança Zero Trust, commits e política do Context7 | [zero-trust.md](../../security/zero-trust.md), [git-workflow.md](../../architecture/git-workflow.md), [stack-docs-policy.md](../../architecture/stack-docs-policy.md) |
| Histórias, ordem e marcos | [epics/](.), [roadmap.md](../roadmap.md), [progress.md](../progress.md) |
| Decisões D-01 a D-13 (todas resolvidas) | [open-decisions.md](../open-decisions.md) |

**Critérios de aceite**
- [x] PRD anexado em `docs/prd/` revisado.
- [x] ADRs 0001–0013 aceitos (status muda de *Proposto* para *Aceito*) ou ajustados.
- [x] Stack e versões fixadas revisadas.
- [x] Ordem do roadmap aprovada.
- [x] Decisões abertas respondidas (D-01 a D-13, em 2026-10-15).

**Aprovada em 2026-10-15.** Como foi aprovada: diga "aprovo a US-000" (ou liste os ajustes). Ao aprovar, o agente marcou a US-000 como *Aprovada* em `progress.md` com a data, muda os ADRs para *Aceito* e libera a `/start-story US-001`.

**Fora desta história:** qualquer código.

---

### US-001 — Projeto base com qualidade automatizada
**Como** desenvolvedor, **quero** um projeto Next.js com shadcn/ui, lint, testes e CI configurados, **para** que toda história seguinte nasça com verificação automática.
**Cobre:** exigências 2 e 4 · **Tamanho:** M · **Depende de:** US-000

**Critérios de aceite**
- [ ] Projeto Next.js (App Router) + TypeScript estrito criado com pnpm e versões fixadas.
- [ ] Tailwind e shadcn/ui inicializados; ao menos `Button` e `Card` instalados e usados na página inicial.
- [ ] ESLint, Prettier e `tsc --noEmit` configurados; scripts `lint`, `typecheck`, `test`, `build` funcionam.
- [ ] Vitest roda um teste de exemplo; Playwright configurado com um teste de fumaça.
- [ ] GitHub Actions executa lint, typecheck, testes e build em PRs.
- [ ] `.env.example` e README de desenvolvimento local.
- [ ] Estrutura de pastas conforme [conventions.md](../../architecture/conventions.md).
- [ ] **Conventional Commits:** `commitlint` com `scope-enum` de [git-workflow.md](../../architecture/git-workflow.md), hook `commit-msg` local e job no CI validando commits e título do PR.
- [ ] **Segurança da cadeia de suprimentos:** lockfile com `--frozen-lockfile`, Dependabot, `pnpm audit` e secret scanning no CI; GitHub Actions fixadas por SHA; `permissions` mínimas no workflow.
- [ ] Template de PR com o checklist de segurança Zero Trust, a lista de critérios de aceite e a seção **“Documentação consultada”** (biblioteca, ID Context7, versão adotada).
- [ ] **Scaffolding pelas CLIs oficiais:** projeto gerado com `create-next-app` (versão fixada da tabela) e shadcn via `shadcn init -t next` (Base UI, padrão da CLI), com as flags confirmadas no Context7. Depois, ajustes ao padrão do projeto (`src/`, versões exatas, estrutura de pastas das convenções). Nenhum arquivo gerado por CLI escrito à mão; em caso de conflito na raiz, gerar em pasta temporária e trazer os arquivos sem sobrescrever `README.md`, `CLAUDE.md`, `docs/` e `.claude/`.
- [ ] **Context7 primeiro:** versões de Next.js, Tailwind, shadcn, ESLint, Vitest, Playwright e demais pacotes foram escolhidas após consulta ao Context7 (ADR-0013), não de memória.

**Notas técnicas:** ADR-0001, 0002, 0010, 0013. Versões estáveis vigentes na data da implementação, confirmadas no Context7.

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `Node.js` | **24 (LTS)** | 🟡 Linha (patch a fechar) | `/nodejs/node` |
| `pnpm` | **12.x (linha estável corrente)** | 🟡 Linha (patch a fechar) | `/pnpm/pnpm` |
| `typescript` | **6.0.3** | ✅ Fixada | `/microsoft/typescript; /typescript-eslint/typescript-eslint` |
| `next` | **16.4.0 ou superior da linha 16** | 🟡 Linha (patch a fechar) | `/vercel/next.js` |
| `eslint-config-next` | **mesma versão do `next`** | 🟡 Linha (patch a fechar) | `/vercel/next.js` |
| `react / react-dom` | **19.x** | 🟡 Linha (patch a fechar) | `/websites/react_dev; /vercel/next.js` |
| `@types/react / @types/react-dom` | **19.x (versões atuais)** | 🟡 Linha (patch a fechar) | `/vercel/next.js` |
| `tailwindcss` | **4.3.3** | ✅ Fixada | `/tailwindlabs/tailwindcss.com` |
| `@tailwindcss/postcss` | **4.3.x (alinhar ao tailwindcss)** | 🟡 Linha (patch a fechar) | `/websites/tailwindcss` |
| `postcss` | **a fechar na US-001** | 🟡 Linha (patch a fechar) | `/websites/tailwindcss` |
| `shadcn (CLI)` | **4.21.4** | ✅ Fixada | `/shadcn-ui/ui` |
| `@base-ui/react, class-variance-authority, lucide-react, tw-animate-css, sonner` | **definidas pela CLI shadcn 4.21.0** | 🟡 Linha (patch a fechar) | `/shadcn-ui/ui` |
| `actions/checkout (GitHub Action)` | **v7.0.1 — SHA 3d3c42e5aac5ba805825da76410c181273ba90b1** | ✅ Fixada | `/pnpm/pnpm` |
| `pnpm/setup (GitHub Action)` | **v3.1.1 — SHA a0881977cd8ea73b1ed212236c99ca10dcc80cf4** | ✅ Fixada | `/pnpm/pnpm` |
| `eslint` | **10.12.0** | ✅ Fixada | `/eslint/eslint; /typescript-eslint/typescript-eslint` |
| `typescript-eslint` | **8.71.2** | ✅ Fixada | `/typescript-eslint/typescript-eslint` |
| `prettier` | **3.9.10** | ✅ Fixada | `/prettier/prettier` |
| `vitest` | **5.0.3** | ✅ Fixada | `/vitest-dev/vitest` |
| `vite` | **^6.4 || ^7 || ^8 (peer do Vitest)** | 🟡 Linha (patch a fechar) | `/vitest-dev/vitest` |
| `@testing-library/react, jest-dom, user-event, jsdom` | **a fechar na US-001** | 🟡 Linha (patch a fechar) | `/testing-library/react-testing-library` |
| `@playwright/test` | **1.63.0** | ✅ Fixada | `/microsoft/playwright` |
| `@commitlint/cli, @commitlint/config-conventional` | **21.2.3 (alinhar o config à mesma versão)** | ✅ Fixada | `/conventional-changelog/commitlint` |
| `husky` | **9.1.7** | ✅ Fixada | `/typicode/husky` |

- [ ] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. **Somente versões estáveis:** nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly` ou versões com sufixo `-x.y` (o hook bloqueia).

_Patches fechados na implementação: ver "Versões fechadas na implementação" em [stack-versions.md](../../architecture/stack-versions.md)._

---

### US-002 — Internacionalização preparada (pt-BR)
**Como** desenvolvedor, **quero** a infraestrutura de i18n funcionando com pt-BR, **para** que nenhum texto seja escrito direto em componentes.
**Cobre:** exigência 5 · **Tamanho:** M · **Depende de:** US-001

**Critérios de aceite**
- [ ] next-intl configurado com `pt-BR` como único locale e padrão; rotas em `app/[locale]`, URLs sem prefixo.
- [ ] Página inicial e layout raiz usam apenas chaves de `messages/pt-BR.json` (incluindo `<html lang="pt-BR">` e metadados).
- [ ] Datas, números e porcentagens exibidos por formatadores do next-intl (exemplo na página inicial).
- [ ] Verificação automática no CI falha ao encontrar literal de interface em `src/` fora do catálogo.
- [ ] Teste/script que garante que todos os locales registrados têm as mesmas chaves (passa com um só locale; falha ao adicionar um incompleto).
- [ ] Documentado em README como adicionar um novo idioma.

**Notas técnicas:** ADR-0006.
**Fora desta história:** seletor de idioma na UI; segundo idioma.

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `next-intl` | **4.14.7** | ✅ Fixada | `/amannn/next-intl` |

- [ ] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. **Somente versões estáveis:** nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly` ou versões com sufixo `-x.y` (o hook bloqueia).

---

### US-003 — Banco de dados e deploy na Vercel
**Como** desenvolvedor, **quero** o banco Postgres, as migrações e o deploy contínuo na Vercel funcionando, **para** validar o ambiente real desde o começo.
**Cobre:** exigência 1 · **Tamanho:** G · **Depende de:** US-002

**Critérios de aceite**
- [ ] Projeto Vercel conectado ao repositório: Preview Deployment por PR e produção a partir de `main`.
- [ ] Postgres (Neon) provisionado pela integração da Vercel; estratégia de banco para preview definida e documentada.
- [ ] Drizzle configurado com a primeira migração (tabela técnica mínima) aplicada de forma automatizada no deploy.
- [ ] Postgres local reproduzível (ex.: Docker Compose) para desenvolvimento e testes de integração; CI com Postgres de serviço.
- [ ] Página de saúde simples confirma conexão com o banco no ambiente publicado (sem expor dados).
- [ ] Variáveis de ambiente documentadas; nenhum segredo no repositório.
- [ ] **Zero Trust:** papéis de banco separados (`app` sem DDL; `migrator` só no deploy), credenciais distintas por ambiente; Preview Deployments com *Deployment Protection* da Vercel; Preview sem segredos de produção.

**Pré-requisitos do responsável (D-04):** conta Vercel com o repositório GitHub conectado e integração Neon (Marketplace). O agente guia o passo a passo; o responsável cria as contas e cadastra as variáveis na Vercel.

**Notas técnicas:** ADR-0001, 0003, 0004, 0010.
**Fora desta história:** modelos de domínio.

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `drizzle-orm / drizzle-kit` | **0.44.7 / 0.31.5 (estáveis)** | ✅ Fixada | `/drizzle-team/drizzle-orm-docs; /drizzle-team/drizzle-orm` |
| `@neondatabase/serverless` | **a fechar na US-003** | 🟡 Linha (patch a fechar) | `/neondatabase/serverless` |

- [ ] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. **Somente versões estáveis:** nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly` ou versões com sufixo `-x.y` (o hook bloqueia).
