---
paths:
  - "src/db/**"
---

# Schema e migrações (ADR-0003, ADR-0004)

- Mudança de schema só por **migração versionada** (drizzle-kit). Nunca editar migração já aplicada; criar uma nova.
- Toda tabela de conteúdo tem `owner_id` (NOT NULL, indexado, `text` como o `user.id` do Better Auth) e cascata de exclusão definida explicitamente.
- Toda tabela de conteúdo declara `ownerPolicy()` (`src/db/rls.ts`) no `pgTable`: o drizzle-kit gera `ENABLE ROW LEVEL SECURITY` e a política de dono para o `app` (`USING` e `WITH CHECK` em `owner_id = current_setting('app.user_id', true)`). Coluna que não seja `text` exige `nullif(..., '')` com conversão e revisão. Proibidos nas tabelas de conteúdo: view sem `security_invoker = true`, view materializada e função `SECURITY DEFINER` (o teste `tests/integration/rls-catalog.test.ts` falha). Ver `docs/architecture/database.md`.
- A história que altera o schema inclui a migração e os testes de integração correspondentes.
- Migrações rodam com o papel `migrator`; a aplicação usa o papel `app` (sem DDL).
- **Somente aditiva por deploy** (expandir → migrar dados → contrair): o código anterior continua rodando contra o schema novo durante o deploy e na branch `preview` compartilhada. Remover/renomear coluna ou tabela só em deploy posterior, quando nenhum código a usa.
- Migração que pega lock em tabela com dados (ALTER, índice sem `CONCURRENTLY`, constraint) começa com `SET lock_timeout` curto (o runner já usa `10s`) e, se for demorada, `SET statement_timeout`; falhar e repetir é melhor que travar a aplicação.
- O deploy aplica migrações com `pnpm db:migrate` (`src/db/migrate.ts`, sob `pg_advisory_lock`); nunca rodar `drizzle-kit migrate`/`push` contra Neon.
- Journal (`meta/_journal.json`): `when` estritamente crescente e entradas de `main` intocadas (`pnpm db:check-journal origin/main`, também no CI). Após rebase com migração nova em `main`, apagar a migração local e regerá-la.
- Funções novas não são executáveis por `PUBLIC` (migração `0002`); conceder `EXECUTE` ao `app` explicitamente quando necessário.
- Atualizar `.env.example` se uma variável nova for necessária; nunca incluir valores reais.
