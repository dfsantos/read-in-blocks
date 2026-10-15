# Architecture Decision Records (ADRs)

Cada decisão técnica relevante é registrada em um arquivo próprio, com contexto, decisão, alternativas e consequências. Uma decisão só muda por um novo ADR que a substitua (o antigo passa a `Substituído por ADR-XXXX`).

**Status possíveis:** `Proposto` → `Aceito` → (`Substituído` | `Descartado`).

Todos os ADRs abaixo estão **Propostos** e passam a **Aceitos** quando você aprovar o plano (história US-000 do [acompanhamento](../plan/progress.md)).

| ADR | Decisão | Status |
|---|---|---|
| [0001](0001-framework-nextjs-on-vercel.md) | Next.js (App Router) + TypeScript, hospedado na Vercel | Proposto |
| [0002](0002-ui-shadcn-tailwind.md) | shadcn/ui + Tailwind CSS | Proposto |
| [0003](0003-database-postgres-neon.md) | PostgreSQL no Neon (Vercel Marketplace) | Proposto |
| [0004](0004-orm-drizzle.md) | Drizzle ORM | Proposto |
| [0005](0005-authentication-better-auth-google.md) | Better Auth com Google | Proposto |
| [0006](0006-internationalization-next-intl.md) | next-intl, `pt-BR` por padrão | Proposto |
| [0007](0007-rich-text-tiptap.md) | Tiptap para anotações | Proposto |
| [0008](0008-data-isolation-per-user.md) | Isolamento de dados por usuário na camada de repositórios | Proposto |
| [0009](0009-book-tree-model-and-weighted-progress.md) | Modelo em árvore e progresso ponderado | Proposto |
| [0010](0010-quality-testing-and-ci.md) | Qualidade, testes e CI | Proposto |
| [0011](0011-zero-trust-security.md) | Estratégia de segurança Zero Trust | Proposto |
| [0012](0012-conventional-commits.md) | Conventional Commits | Proposto |
| [0013](0013-context7-docs-first.md) | Documentação via Context7 antes de mudar a stack | Proposto |

## Template

```md
# ADR-XXXX — Título

- **Status:** Proposto | Aceito | Substituído por ADR-YYYY
- **Data:** AAAA-MM-DD

## Contexto
## Decisão
## Alternativas consideradas
## Consequências
```
