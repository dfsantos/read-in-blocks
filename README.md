# Read in Blocks

Aplicativo web de acompanhamento de leitura que usa a estrutura hierárquica do livro (partes, capítulos e tópicos) como unidade de progresso, com anotações ancoradas em cada capítulo.

> **Estado atual:** planejamento aprovado (US-000); projeto base em desenvolvimento (US-001). Acompanhe em [`docs/plan/progress.md`](docs/plan/progress.md).

## Desenvolvimento local

Requisitos: Node 24 (`.nvmrc`) e pnpm 12 (`corepack enable` usa a versão de `packageManager`).

```bash
pnpm install
cp .env.example .env.local   # sem variáveis obrigatórias por enquanto
pnpm dev                     # http://localhost:3000
```

| Script                              | Para quê                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| `pnpm lint`                         | ESLint                                                             |
| `pnpm typecheck`                    | `tsc --noEmit`                                                     |
| `pnpm format` / `pnpm format:check` | Prettier                                                           |
| `pnpm test`                         | Vitest (unitário/integração)                                       |
| `pnpm test:e2e`                     | Playwright (primeira vez: `pnpm exec playwright install chromium`) |
| `pnpm build`                        | Build de produção                                                  |

Commits seguem Conventional Commits; o hook `commit-msg` (husky + commitlint) bloqueia mensagens fora do padrão. Regras completas em [`CLAUDE.md`](CLAUDE.md).

## Documentação

Toda a documentação vive em [`docs/`](docs/README.md):

| Documento                                           | Conteúdo                                           |
| --------------------------------------------------- | -------------------------------------------------- |
| [PRD](docs/prd/prd-read-in-blocks.md)               | O que será construído e por quê                    |
| [Tech stack](docs/architecture/tech-stack.md)       | Tecnologias escolhidas e visão de arquitetura      |
| [ADRs](docs/adr/README.md)                          | Registro das decisões técnicas e suas alternativas |
| [Segurança Zero Trust](docs/security/zero-trust.md) | Política de segurança obrigatória                  |
| [Git e commits](docs/architecture/git-workflow.md)  | Conventional Commits, branches, PRs                |
| [CLAUDE.md](CLAUDE.md)                              | Regras permanentes para o agente                   |
| [Plano de desenvolvimento](docs/plan/README.md)     | Como o trabalho é conduzido e aprovado             |
| [Acompanhamento](docs/plan/progress.md)             | Status de cada história de usuário                 |
