# ADR-0004 — Drizzle ORM

- **Status:** Proposto
- **Data:** 2026-10-15

## Contexto

Precisamos de acesso tipado ao Postgres, migrações versionadas e boa execução em ambiente serverless (cold start leve). Também precisamos de consultas recursivas/agregadas para a árvore de nós.

## Decisão

- **Drizzle ORM** + **drizzle-kit** para schema em TypeScript e migrações SQL versionadas no repositório (`src/db/migrations`).
- Consultas complexas (árvore, agregações) podem usar SQL explícito via `sql` do Drizzle, encapsuladas em repositórios.
- Better Auth usa o adapter do Drizzle, mantendo um único schema.
- **Versão estável** (D-12): drizzle-orm 0.44.7 + drizzle-kit 0.31.5; a 1.0 em RC (`@rc`) não é usada. Ver [stack-versions.md](../architecture/stack-versions.md).

## Alternativas consideradas

- **Prisma:** ótima DX, porém runtime mais pesado em serverless e menos flexível para SQL recursivo.
- **Kysely / SQL puro:** mais controle, menos produtividade para schema e migrações.

## Consequências

- Migrações são código revisável; cada história que altera dados inclui a migração.
- Biblioteca mais jovem que o Prisma; mitigado pelo uso de SQL transparente.
