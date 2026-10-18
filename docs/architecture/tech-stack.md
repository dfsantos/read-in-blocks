# Tech stack

**Status:** Aprovada (2026-10-15) · **Data:** 2026-10-15

Cada escolha abaixo tem um ADR com contexto, alternativas e consequências. Nenhuma versão está fixada aqui: a história US-001 fixa as versões estáveis vigentes no momento da implementação, **confirmadas no Context7** ([política](stack-docs-policy.md); versões em [stack-versions.md](stack-versions.md)).

## Exigências (dadas pelo responsável do projeto)

| # | Exigência | Como é atendida |
|---|---|---|
| 1 | Hospedagem na Vercel | Next.js na Vercel; banco via Vercel Marketplace; Preview Deployments por PR ([ADR-0001](../adr/0001-framework-nextjs-on-vercel.md)) |
| 2 | UI com shadcn | shadcn/ui + Tailwind CSS ([ADR-0002](../adr/0002-ui-shadcn-tailwind.md)) |
| 3 | Login social, só Google por ora | Better Auth com provedor Google; outros provedores entram por configuração; login só em local e produção, não no Preview ([ADR-0005](../adr/0005-authentication-better-auth-google.md), [ADR-0016](../adr/0016-no-google-sign-in-on-preview.md); guia em [authentication.md](authentication.md)) |
| 4 | Código em inglês | Convenção obrigatória ([conventions.md](conventions.md)) |
| 5 | Aplicação em português, pronta para i18n | `next-intl`, `pt-BR` como único locale ativo, zero texto fixo em componentes ([ADR-0006](../adr/0006-internationalization-next-intl.md)) |

## Resumo da stack

| Camada | Escolha | ADR |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript estrito | [0001](../adr/0001-framework-nextjs-on-vercel.md) |
| Runtime / gerenciador | Node.js LTS + pnpm | [0001](../adr/0001-framework-nextjs-on-vercel.md) |
| UI | shadcn/ui (Base UI) + Tailwind CSS + lucide-react | [0002](../adr/0002-ui-shadcn-tailwind.md) |
| Banco de dados | PostgreSQL (Neon, via Vercel Marketplace); driver `pg` | [0003](../adr/0003-database-postgres-neon.md), [0014](../adr/0014-database-driver-roles-and-deploy-migrations.md) |
| ORM / migrações | Drizzle ORM + drizzle-kit | [0004](../adr/0004-orm-drizzle.md) |
| Autenticação | Better Auth + Google OAuth | [0005](../adr/0005-authentication-better-auth-google.md) |
| i18n | next-intl (`pt-BR`) | [0006](../adr/0006-internationalization-next-intl.md) |
| Editor de anotações | Tiptap (ProseMirror), conteúdo em JSON | [0007](../adr/0007-rich-text-tiptap.md) |
| Isolamento de dados | Camada de acesso a dados com escopo obrigatório por usuário | [0008](../adr/0008-data-isolation-per-user.md) |
| Modelo da estrutura | Árvore por lista de adjacência + cálculo de progresso em domínio puro | [0009](../adr/0009-book-tree-model-and-weighted-progress.md) |
| Validação / formulários | Zod + React Hook Form (via componentes de formulário do shadcn) | [0010](../adr/0010-quality-testing-and-ci.md) |
| Testes | Vitest + Testing Library (unit/integração), Playwright (E2E) | [0010](../adr/0010-quality-testing-and-ci.md) |
| Qualidade | ESLint + Prettier + `tsc --noEmit` | [0010](../adr/0010-quality-testing-and-ci.md) |
| CI/CD | GitHub Actions (qualidade) + integração Git da Vercel (deploy) | [0010](../adr/0010-quality-testing-and-ci.md) |
| Segurança | Zero Trust: verificar sempre, menor privilégio, assumir violação | [0011](../adr/0011-zero-trust-security.md) |
| Histórico Git | Conventional Commits com commitlint | [0012](../adr/0012-conventional-commits.md) |
| Versões e APIs da stack | Sempre a partir de documentação atual do Context7 ([política](stack-docs-policy.md)) | [0013](../adr/0013-context7-docs-first.md) |

## Visão de arquitetura

Monólito Next.js, sem serviço separado. Para um produto de um único usuário no início (PRD §8) qualquer coisa além disso é custo sem benefício.

```
Browser ── React Server Components + Client Components (shadcn/ui, Tiptap)
   │
   ▼
Next.js on Vercel
   ├── app/[locale]/…            rotas e layouts (UI, textos via next-intl)
   ├── Server Actions            mutações (validadas com Zod, sempre autenticadas)
   ├── Route Handler /api/auth   Better Auth (Google OAuth, sessão)
   │
   ├── src/domain/               regras puras, sem I/O (progresso ponderado, rollup de estado, previsão)
   ├── src/server/repositories/  único ponto de acesso ao banco; exige userId em toda consulta
   └── src/db/                   schema Drizzle + migrações
   │
   ▼
PostgreSQL (Neon)
```

### Princípios

1. **Regras de negócio em `src/domain`**, funções puras e testadas isoladamente. Progresso ponderado e rollup de estado (regras críticas do PRD) não dependem de React nem de banco.
2. **Nenhuma consulta fora de `repositories`.** Todo método recebe o `userId` da sessão; não existe leitura “por id” sem escopo de dono (RF-010, [ADR-0008](../adr/0008-data-isolation-per-user.md)).
3. **Texto de interface só em catálogos de mensagens.** Nenhum literal em português dentro de componentes ([conventions.md](conventions.md)).
4. **Server Components por padrão**; Client Components só onde há interação (árvore dobrável, editor).
5. **Mudanças de schema só por migração versionada**, aplicadas no deploy.
6. **Zero Trust:** nenhuma camada confia na anterior. Autenticação e autorização no ponto do dado, entrada sempre validada, menor privilégio no banco/CI/segredos, CSP e cabeçalhos como segunda barreira ([política](../security/zero-trust.md)).

## Fora da stack (por enquanto)

- Cache/fila/Redis, busca textual dedicada, armazenamento de arquivos: não há requisito no MVP.
- Analytics e observabilidade avançada: o PRD não define objetivos nem métricas (ver [open-decisions.md](../plan/open-decisions.md), D-01). Usaremos os logs e o Speed Insights padrão da Vercel se for útil.
- Tailwind/shadcn de tema escuro: previsto no tema (variáveis CSS), mas não é requisito do MVP.
