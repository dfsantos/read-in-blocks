# Architecture Decision Records (ADRs)

Cada decisão técnica relevante é registrada em um arquivo próprio, com contexto, decisão, alternativas e consequências. Uma decisão só muda por um novo ADR que a substitua (o antigo passa a `Substituído por ADR-XXXX`).

**Status possíveis:** `Proposto` → `Aceito` → (`Substituído` | `Descartado`).

Todos os ADRs abaixo foram **Aceitos** em 2026-10-15, com a aprovação da US-000 ([acompanhamento](../plan/progress.md)). Mudar uma decisão exige um novo ADR que a substitua.

| ADR | Decisão | Status |
|---|---|---|
| [0001](0001-framework-nextjs-on-vercel.md) | Next.js (App Router) + TypeScript, hospedado na Vercel | Aceito |
| [0002](0002-ui-shadcn-tailwind.md) | shadcn/ui + Tailwind CSS | Aceito |
| [0003](0003-database-postgres-neon.md) | PostgreSQL no Neon (Vercel Marketplace) | Aceito |
| [0004](0004-orm-drizzle.md) | Drizzle ORM | Aceito |
| [0005](0005-authentication-better-auth-google.md) | Better Auth com Google | Aceito |
| [0006](0006-internationalization-next-intl.md) | next-intl, `pt-BR` por padrão | Aceito |
| [0007](0007-rich-text-tiptap.md) | Tiptap para anotações | Aceito |
| [0008](0008-data-isolation-per-user.md) | Isolamento de dados por usuário na camada de repositórios | Aceito |
| [0009](0009-book-tree-model-and-weighted-progress.md) | Modelo em árvore e progresso ponderado | Aceito |
| [0010](0010-quality-testing-and-ci.md) | Qualidade, testes e CI | Aceito |
| [0011](0011-zero-trust-security.md) | Estratégia de segurança Zero Trust | Aceito |
| [0012](0012-conventional-commits.md) | Conventional Commits | Aceito |
| [0013](0013-context7-docs-first.md) | Documentação via Context7 antes de mudar a stack | Aceito |
| [0014](0014-database-driver-roles-and-deploy-migrations.md) | Driver `pg`, papéis de banco, banco de preview e migrações no deploy | Proposto |

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
