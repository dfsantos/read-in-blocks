# Banco de dados, migrações e deploy

Decisões: [ADR-0003](../adr/0003-database-postgres-neon.md), [ADR-0004](../adr/0004-orm-drizzle.md) e [ADR-0014](../adr/0014-database-driver-roles-and-deploy-migrations.md). Histórias: US-003 e US-029 (endurecimento).

## Visão geral

| Ambiente | Banco | Quem aplica as migrações | Variáveis |
|---|---|---|---|
| Local | Postgres 17 em contêiner (`compose.yaml`), bancos `read_in_blocks` e `read_in_blocks_test` | você, com `pnpm db:migrate` | `.env.local`, `.env.test.local` |
| CI | Serviço `postgres` do job `integration` (mesma imagem e digest) | `tests/integration/global-setup.ts` | definidas no workflow (credenciais descartáveis) |
| Preview (Vercel) | Branch Neon **`preview`**, compartilhada por todos os Preview Deployments | build da Vercel (`vercel.json`) | Vercel, escopo *Preview* |
| Produção (Vercel) | Branch Neon **`main`** (padrão) | build da Vercel (`vercel.json`) | Vercel, escopo *Production* |

O código usa `pg` + `drizzle-orm/node-postgres` em todos os ambientes; na Vercel o pool é registrado com `attachDatabasePool` (`src/db/client.ts`).

## Papéis (menor privilégio)

| Papel | Pode | Não pode | Usado por |
|---|---|---|---|
| `migrator` | DDL no schema `public`; criar o schema `drizzle` (histórico de migrações) | — (não é superusuário) | `pnpm db:migrate` / build da Vercel (`MIGRATOR_DATABASE_URL`) |
| `app` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` nas tabelas criadas pelo `migrator` | `CREATE`, `ALTER`, `DROP`, `TRUNCATE` | aplicação em runtime (`DATABASE_URL`) |

- Os papéis são criados por [`src/db/bootstrap/roles.sql`](../../src/db/bootstrap/roles.sql), uma vez por banco, com o dono do banco.
- Papéis que já existiam não são aceitos como estão (US-029): o script remove `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION` e `BYPASSRLS` (e para, se o dono não puder removê-los) e **aborta** se `app` ou `migrator` for membro de qualquer papel (ex.: `neon_superuser`, `pg_read_all_data`). Nesse caso, revogue a filiação (`REVOKE <papel> FROM app`) e rode de novo.
- Os privilégios do `app` sobre as tabelas vêm da migração `0000_grant_app_privileges` (executada pelo próprio `migrator`). A migração `0002` revoga de `PUBLIC` o `EXECUTE` padrão em funções criadas pelo `migrator` (de forma global: `IN SCHEMA` não consegue revogar um padrão global); funções que o `app` precise chamar recebem `GRANT EXECUTE` explícito.
- O teste `tests/integration/db-roles.test.ts` prova que o `app` não executa DDL nem funções por padrão, usa as sequências de tabelas `serial` e que nenhum papel tem atributo elevado ou filiação.
- **Nunca** crie esses papéis pelo console do Neon: papéis criados lá entram em `neon_superuser`.

## Desenvolvimento local

```bash
pnpm db:up        # sobe o contêiner; na primeira vez cria os bancos e os papéis
pnpm db:migrate   # aplica as migrações no banco de desenvolvimento
pnpm dev
```

- `.env.local`: `DATABASE_URL` e `MIGRATOR_DATABASE_URL` com os valores locais indicados em `.env.example`.
- `.env.test.local`: `TEST_DATABASE_URL` e `TEST_MIGRATOR_DATABASE_URL` apontando para `read_in_blocks_test`; depois `pnpm test:integration`. Os testes recusam qualquer host que não seja `localhost`, `127.0.0.1` ou `::1` (eles gravam e apagam dados).
- A porta fica presa em `127.0.0.1` (não exposta na rede). As senhas do `compose.yaml` são só do contêiner local.
- Para recomeçar do zero: `docker compose down -v && pnpm db:up`.

## Mudar o schema

1. Editar `src/db/schema.ts` (tabela de conteúdo sempre com `owner_id`, ver `.claude/rules/migrations.md`).
2. `pnpm db:generate --name <descricao>` gera a migração em `src/db/migrations` (nunca escrever à mão; SQL customizado via `pnpm db:generate --custom`).
3. `pnpm db:migrate` localmente e `pnpm test:integration`.
4. Nunca editar migração já aplicada; corrigir com uma migração nova.

### Regras para migrações seguras

- **Somente aditiva por deploy.** Durante o build, o código anterior ainda atende requisições contra o schema novo, e a branch `preview` é compartilhada por PRs com códigos diferentes. Cada deploy só **adiciona** (tabela, coluna anulável ou com default, índice); renomear ou remover segue *expandir → migrar dados → contrair* em deploys separados:
  1. expandir: adicionar o novo (coluna/tabela) e fazer o código escrever nos dois;
  2. migrar: copiar os dados antigos (migração ou script) e passar a ler do novo;
  3. contrair: em um deploy **posterior**, quando nenhum código usa o antigo, removê-lo.
- **`lock_timeout`.** `pnpm db:migrate` define `lock_timeout = 10s` para as instruções das migrações: um `ALTER TABLE` que espera um lock falha em vez de enfileirar todas as consultas da aplicação atrás dele. Migração que precise de outro valor declara no topo `SET lock_timeout = '…';` (e `SET statement_timeout = '…';` se for longa). Índice em tabela grande: `CREATE INDEX CONCURRENTLY` em migração própria (não roda em transação; ver o Context7 do Drizzle antes).
- **Uma migração por vez.** `pnpm db:migrate` executa [`src/db/migrate.ts`](../../src/db/migrate.ts): pega um `pg_advisory_lock` (espera até 3 min) antes do `migrate()` do Drizzle, então dois builds de Preview simultâneos não aplicam migrações ao mesmo tempo. Ele recusa host `-pooler` (o PgBouncer em modo transação não mantém o lock de sessão). Nunca usar `drizzle-kit migrate` ou `push` contra o Neon.
- **Ordem do journal.** O Drizzle só aplica uma migração cujo `when` (em `meta/_journal.json`) é posterior ao da última aplicada. Se outra migração entrou em `main` enquanto a sua estava na branch, depois do rebase **apague a sua migração (SQL, snapshot e entrada do journal) e gere de novo**. `pnpm db:check-journal origin/main` confere `when` estritamente crescente e que as entradas e os SQL de `main` não mudaram; o CI roda o mesmo contra a base do PR (job *Migration journal*). Ele também exige snapshot por entrada e acusa `.sql` fora do journal.
- **Limite na branch `preview`:** a checagem compara com `main`, não com o banco. Se o PR A aplicar na `preview` uma migração com `when` maior e depois o PR B trouxer outra com `when` menor, o Drizzle pula a de B sem erro. Com uma história por vez isso não ocorre; se ocorrer, recrie a branch `preview` a partir de `main` (ADR-0014).

## Configuração na Vercel e no Neon (responsável, D-04)

Passo a passo para fazer uma vez. Não cole senhas em issues, PRs ou chats.

### 1. Projeto na Vercel

1. Vercel → **Add New → Project** → importar o repositório do GitHub. Framework: Next.js (detectado). O `buildCommand` vem do `vercel.json` (`pnpm db:migrate && pnpm build`).
2. **Settings → Git:** branch de produção `main`. Cada PR gera um Preview Deployment. **Git Fork Protection** ativa (confirmada pelo responsável em 2026-10-16): PR vindo de fork só faz build com aprovação, porque o build roda o código do PR com `MIGRATOR_DATABASE_URL` de Preview.
3. **Settings → Deployment Protection:** *Vercel Authentication* ativa para **Preview** (somente membros da equipe acessam).
4. Node.js: o `package.json` fixa `engines.node = 24.x`.

### 2. Neon pela integração da Vercel

1. Vercel → **Storage → Create Database → Neon** (Marketplace), região próxima da região das funções da Vercel.
2. Ao conectar ao projeto, **desmarque *Preview* e *Development*** e desative a criação automática de branch por Preview: usamos uma branch `preview` fixa (ADR-0014).
3. A integração cria cerca de 17 variáveis com a credencial do **dono** (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PG*`, `POSTGRES_*`, `NEON_*`) em Preview e Production. Elas têm DDL e **não** são usadas pela aplicação: o script do passo seguinte as remove. Desligue a sincronização de variáveis da integração (Integrations → Neon → Manage → Projects) para que não voltem e, como a senha do dono ficou exposta nessas variáveis, redefina a senha do `neondb_owner` no Neon.

### Atalho: `scripts/setup-database.sh` (recomendado)

Faz os passos 3 a 5 de uma vez e pode ser repetido para **rotacionar** todas as senhas:

```bash
./scripts/setup-database.sh
```

- Pede `vercel login`/`vercel link` se necessário e as connection strings do `neondb_owner` das branches `main` e `preview` (entrada oculta).
- Gera as senhas de `app` e `migrator` localmente (`openssl rand`), aplica `roles.sql` e `ALTER ROLE … PASSWORD` em cada branch enviando só o **verificador SCRAM-SHA-256** calculado localmente (a senha em texto não chega ao Neon nem aos logs dele), testa as conexões e grava `DATABASE_URL` e `MIGRATOR_DATABASE_URL` como *Sensitive* em Production e Preview, conferindo cada gravação.
- Remove as variáveis da integração Neon listadas acima.
- Nenhuma senha é exibida nem passada como argumento de linha de comando.
- Requer `psql` (libpq 16+), `openssl`, `python3` e `pnpm`; usa `pnpm dlx vercel@64.3.1` (versão exata). A CLI não vira `devDependency`: na US-029 ela trouxe 15 alertas *high* e 1 *critical* para o `pnpm audit` (quebrando o job de auditoria), e o `dlx` a mantém fora do lockfile da aplicação.

Os passos 3 a 5 abaixo descrevem o mesmo processo manualmente.

### 3. Papéis na branch `main` (produção)

No console do Neon, copie a connection string **direta** do dono (sem `-pooler`) e rode, com senhas fortes geradas por um gerenciador de senhas:

```bash
psql "<URL direta do dono, branch main>" -v ON_ERROR_STOP=1 \
  -v app_password='<senha app produção>' \
  -v migrator_password='<senha migrator produção>' \
  -f src/db/bootstrap/roles.sql
```

### 4. Branch `preview`

1. Neon → **Branches → Create branch** `preview` a partir de `main` **depois** do passo 3 (os papéis são copiados).
2. Troque as senhas na branch `preview`, para que preview e produção tenham credenciais distintas:

```bash
psql "<URL direta do dono, branch preview>" -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE app PASSWORD '<senha app preview>'" \
  -c "ALTER ROLE migrator PASSWORD '<senha migrator preview>'"
```

### 5. Variáveis de ambiente na Vercel

Settings → Environment Variables, marcando como *Sensitive*:

| Variável | Production (branch `main`) | Preview (branch `preview`) |
|---|---|---|
| `DATABASE_URL` | `postgresql://app:<senha>@<host-main>-pooler.../neondb?sslmode=verify-full` | idem, host **pooled** da branch `preview` |
| `MIGRATOR_DATABASE_URL` | `postgresql://migrator:<senha>@<host-main>.../neondb?sslmode=verify-full` (host **direto**) | idem, host direto da branch `preview` |

- `DATABASE_URL` usa o host com `-pooler` (PgBouncer); `MIGRATOR_DATABASE_URL` usa o host direto (DDL e histórico de migrações).
- Nenhum valor de produção no escopo *Preview*. Escopo *Development* fica vazio (local usa o contêiner).
- **Risco aceito (ADR-0014):** a Vercel expõe as variáveis também no runtime das funções; o código da aplicação nunca lê `MIGRATOR_DATABASE_URL`.

### 6. Verificar

1. Abrir um PR → o build do Preview aplica as migrações na branch `preview` → abrir `<url do preview>/api/health` (com a Deployment Protection, faça login na Vercel) → `{"status":"ok"}`.
2. Fazer merge em `main` → `https://<domínio de produção>/api/health` → `{"status":"ok"}`.
3. `/api/health` responde só `{"status":"ok"}` (200) ou `{"status":"error"}` (503), com `Cache-Control: no-store`; detalhes do erro vão apenas para o log, como código do Postgres.

## Rotação de credenciais

`ALTER ROLE <papel> PASSWORD '<nova>'` na branch afetada, atualizar a variável na Vercel e fazer um novo deploy (deploys existentes não recebem variáveis novas).
