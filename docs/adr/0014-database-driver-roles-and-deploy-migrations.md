# ADR-0014 — Driver `pg`, papéis de banco, banco de preview e migrações no deploy

- **Status:** Aceito (2026-10-16)
- **Data:** 2026-10-15
- **Substitui parcialmente:** [ADR-0003](0003-database-postgres-neon.md) (somente o item do driver e a escolha do banco de preview, que o ADR-0003 deixou para a US-003)

## Contexto

O ADR-0003 previa o driver serverless do Neon (`@neondatabase/serverless`). Na US-003 verificamos no Context7 que:

- o modo HTTP (`neon()`) só conversa com o proxy HTTP do Neon; um Postgres comum (Docker local, serviço do CI) exige um proxy de terceiros (`local-neon-http-proxy`) ou caminhos de código diferentes por ambiente;
- o modo HTTP não tem transações interativas;
- a Vercel (Fluid compute) documenta o uso de `pg` com `Pool` + `attachDatabasePool` de `@vercel/functions`, que libera conexões ociosas antes de suspender a função.

Também era preciso decidir o banco dos Preview Deployments, onde aplicar as migrações e como separar os papéis `app` (sem DDL) e `migrator` exigidos pela política Zero Trust.

## Decisão

1. **Driver:** `pg` (node-postgres) com `drizzle-orm/node-postgres` em **todos** os ambientes (local, CI, Preview, produção). Na Vercel, o `Pool` é registrado com `attachDatabasePool`. A aplicação usa a URL **com pooler** do Neon; o `migrator` usa a URL **direta** (sem pooler).
2. **Papéis:** criados por SQL (`src/db/bootstrap/roles.sql`), nunca pelo console do Neon (papéis do console entram em `neon_superuser`):
   - `migrator`: dono das tabelas, `CREATE` no schema `public` e no banco (schema `drizzle` do histórico de migrações). Usado só no build.
   - `app`: `CONNECT` + `USAGE` no schema e apenas `SELECT/INSERT/UPDATE/DELETE`, concedidos pela migração `0000_grant_app_privileges` (`ALTER DEFAULT PRIVILEGES` executado pelo próprio `migrator`). Sem DDL.
3. **Ambientes:** branch Neon de produção (`main`) e **uma branch única `preview`** compartilhada pelos Preview Deployments, com senhas próprias (`ALTER ROLE … PASSWORD` na branch), configuradas manualmente na Vercel no escopo *Preview*. Local e CI usam Postgres 17 em contêiner (imagem oficial fixada por digest).
4. **Migrações:** geradas pelo `drizzle-kit generate` em `src/db/migrations` e aplicadas pelo `drizzle-kit migrate` no **build da Vercel** (`vercel.json`: `pnpm db:migrate && pnpm build`), com `MIGRATOR_DATABASE_URL`. Falha na migração impede o deploy.

## Alternativas consideradas

- **Manter o driver Neon HTTP + proxy local:** fiel ao ADR-0003, mas adiciona imagem de terceiros na cadeia de suprimentos e não tem transações interativas.
- **Neon em produção e `pg` local:** dois drivers, testes que não exercitam o caminho de produção.
- **Branch Neon por Preview (integração):** isolamento total, mas a integração injeta a credencial do dono (com DDL), quebrando a separação `app`/`migrator`.
- **Migrações no GitHub Actions:** credencial fora da Vercel, mas sem ordem garantida entre migração e deploy.

## Consequências

- Um só caminho de código, testado contra Postgres real; transações disponíveis para histórias futuras (árvore, reordenação).
- `@neondatabase/serverless` não é instalado. Dependências novas: `pg`, `@types/pg`, `@vercel/functions`.
- **Risco aceito:** variáveis de ambiente da Vercel ficam disponíveis no build **e** no runtime, então `MIGRATOR_DATABASE_URL` existe também nas funções. Mitigação: o código da aplicação nunca lê essa variável (só `drizzle.config.ts`), e ela só é cadastrada nos ambientes que fazem deploy.
- Previews simultâneos compartilham o schema da branch `preview`; migrações devem seguir expandir → migrar → contrair. Com um único desenvolvedor e uma história por vez, o conflito é improvável. Se a branch divergir, ela pode ser recriada a partir de `main` (redefinindo as senhas).
- Cold start do compute do Neon continua podendo adicionar latência na primeira requisição.

## Adendo (US-029, 2026-10-16) — endurecimento

Refinamentos que não mudam a decisão, vindos das revisões de segurança e de migração da US-003:

- **Papéis:** `roles.sql` não confia em papéis pré-existentes: remove atributos elevados (`SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`) e aborta se `app` ou `migrator` pertencer a algum papel. A migração `0002` revoga de `PUBLIC` o `EXECUTE` padrão nas funções do `migrator` (global, pois um `REVOKE … IN SCHEMA` não remove o padrão global).
- **Aplicação das migrações (item 4):** o build continua rodando `pnpm db:migrate`, mas agora por `src/db/migrate.ts` (`migrate()` de `drizzle-orm/node-postgres/migrator`) sob `pg_advisory_lock`, com `lock_timeout` de 10 s para as instruções, em vez de `drizzle-kit migrate`. Motivo: builds de Preview simultâneos compartilham a branch `preview`. O CI verifica que o `when` do journal é estritamente crescente e que as entradas de `main` não mudaram. Regras de migração segura (somente aditiva por deploy, `lock_timeout`) em [database.md](../architecture/database.md#regras-para-migrações-seguras).
- **Leitura de `MIGRATOR_DATABASE_URL`:** além do `drizzle.config.ts`, só `src/db/migrate.ts` (executado no build) lê a variável; o código servido pela aplicação continua sem lê-la.
- **Risco do build de Preview:** o build executa o código da branch do PR com `MIGRATOR_DATABASE_URL` de Preview (DDL na branch `preview`). Quem consegue abrir um PR que dispara o build consegue usar essa credencial. Mitigações: **Git Fork Protection** da Vercel ativa (confirmada pelo responsável em 2026-10-16), de modo que PRs de forks só fazem build com aprovação; a credencial é só de Preview, sem acesso à branch `main`; repositório com um único colaborador. Revisar se o repositório ganhar colaboradores.
- **Superfície pública:** `/api/health` é exceção explícita ao `requireUser()`, registrada em [zero-trust.md](../security/zero-trust.md); rate limit planejado na US-028.
- **Senhas:** `scripts/setup-database.sh` envia as senhas ao Neon só pelo stdin do `psql`, sobre TLS `verify-full`. O envio de verificadores SCRAM-SHA-256 (US-029) foi revertido: o Neon só aceita senha em texto e a guarda com hash (ver [database.md](../architecture/database.md)).
