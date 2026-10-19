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

## RLS nas tabelas de conteúdo

Segunda barreira do isolamento ([ADR-0008](../adr/0008-data-isolation-per-user.md), item 6; US-033). O filtro de dono dos repositórios (`ownedBy`) continua obrigatório; o RLS pega o filtro esquecido.

**Convenção de migração.** Toda tabela de conteúdo (`book`, `book_node`, `note` e as próximas) tem `owner_id text not null` e declara `ownerPolicy()` (`src/db/rls.ts`) no `pgTable`:

```ts
export const book = pgTable(
  "book",
  { id: uuid("id").primaryKey().defaultRandom(), ownerId: text("owner_id").notNull() /* … */ },
  () => [ownerPolicy()],
);
```

O `pnpm db:generate` gera então, na migração:

```sql
ALTER TABLE "book" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON "book" AS PERMISSIVE FOR ALL TO "app"
  USING (owner_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), ''));
```

- O papel `app` entra no schema como `pgRole("app").existing()`: o drizzle-kit não o cria nem o remove (ele vem do `roles.sql`).
- Sem dono definido, `current_setting(..., true)` é `NULL`, ou `''` numa conexão do pool que já passou por um `withOwner`; o `nullif` transforma `''` em `NULL`, que não casa com nenhum `owner_id`: nenhuma linha, e nenhuma linha gravada com dono vazio (falha fechada). `owner_id` é `text`, como o `user.id` do Better Auth; com `uuid`, a expressão seria `owner_id = nullif(current_setting('app.user_id', true), '')::uuid` e exige revisão.
- `WITH CHECK` recusa criar linha para outro dono e mudar o `owner_id` de uma linha para outro leitor.
- O `migrator`, dono das tabelas, ignora o RLS (sem `FORCE ROW LEVEL SECURITY`); por isso **não** use, sobre dados de conteúdo, view sem `security_invoker = true`, view materializada nem função `SECURITY DEFINER`: elas rodam como o dono.
- O teste `tests/integration/rls-catalog.test.ts` lê o catálogo do banco migrado e **nega por padrão**: toda tabela que o `app` alcança precisa ter `owner_id` e a política de dono (RLS ligado, nenhuma outra política permissiva que alcance o `app`) ou estar na lista `NOT_CONTENT` do teste (hoje `app_meta` e as tabelas do Better Auth). Tabela nova falha até ser classificada. Ele também falha com view sem `security_invoker`, view materializada, regra (`CREATE RULE`), função `SECURITY DEFINER`, tabela cujo dono seja o `app`, `TRUNCATE`/`REFERENCES`/`TRIGGER` concedidos ao `app` ou `app` com `BYPASSRLS`.

- **Tabela que já existe:** ligar o RLS (`ownerPolicy()`) numa tabela já usada **não** é aditivo: o código anterior, que ainda não usa `withOwner`, passa a ver nada e a ter as escritas recusadas durante o deploy e na branch `preview` compartilhada. Siga expandir → contrair: primeiro um deploy em que todos os repositórios daquela tabela já rodam por `withOwner`; a migração com `ownerPolicy()` só em deploy posterior, com `owner_id` já `NOT NULL` e preenchido (linha sem dono fica invisível ao `app`). Tabelas novas (US-007 em diante) nascem com a política e não têm esse problema.
- **Referências entre tabelas:** o RLS só olha o `owner_id` da própria linha, e a checagem de FK roda como dono da tabela, ignorando o RLS. Um nó com `owner_id = A` poderia apontar para o livro de B. Por isso, FKs entre tabelas de conteúdo são compostas e incluem o dono: `(owner_id, book_id)` referencia `UNIQUE (owner_id, id)` do livro (idem para `parent_id` e anotações).
- **Mudar `ownerPolicy()`** altera a política de todas as tabelas de conteúdo na próxima migração gerada, e as expressões esperadas em `rls-catalog.test.ts` mudam junto (o teste compara o texto que o Postgres 17 guarda).

**Dono por transação.** Em runtime, o dono é definido só por `withOwner(userId, fn)` (`src/server/repositories/with-owner.ts`), que abre uma transação e roda `set_config('app.user_id', userId, true)`: o valor some no `COMMIT` ou no `ROLLBACK`. Configuração de sessão (`set_config(..., false)`, `SET` sem `LOCAL`) ficaria na conexão do pool e entregaria as linhas de um leitor ao próximo; o pooler do Neon (PgBouncer em modo transação) também não a suporta. O teste `src/server/repositories/owner-setting.test.ts` impede essas formas no código. Uso nos repositórios: [data-access.md](data-access.md#rls-do-postgres).

**RLS no pooler do Neon.** Os testes de integração só rodam em host local; para provar o comportamento no pooler do Neon, rode `scripts/check-rls-pooler.ts` contra a connection string **pooled** (`-pooler`) da branch `preview`, com `sslmode=verify-full` (troque o `sslmode=require` que o console do Neon mostra). Prefira a do papel `app` (menor privilégio); se só tiver a do `neondb_owner`, o resultado é o mesmo, porque o script não cria nem lê tabela:

```bash
printf 'Pooled URL: ' && read -rs RLS_CHECK_DATABASE_URL && echo && export RLS_CHECK_DATABASE_URL && node scripts/check-rls-pooler.ts; unset RLS_CHECK_DATABASE_URL
```

Ele roda 1000 transações em 5 conexões paralelas, cada uma define um dono, confere que ele vale dentro da transação e que não aparece na consulta seguinte (1 em cada 10 termina em `ROLLBACK`), e mede a latência de `select 1` sozinho e embrulhado como no `withOwner`. Recusa host que não seja `-pooler` (ou local, para a medição de referência) e conexão sem `sslmode=verify-full`, e nunca imprime a URL nem mensagens do driver (só o código do erro). Resultado registrado no adendo da US-033 do ADR-0008.

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
- Gera as senhas de `app` e `migrator` localmente (`openssl rand`), aplica `roles.sql` e `ALTER ROLE … PASSWORD` em cada branch, testa as conexões e grava `DATABASE_URL` e `MIGRATOR_DATABASE_URL` como *Sensitive* em Production e Preview, conferindo cada gravação.
- Remove as variáveis da integração Neon listadas acima.
- Nenhuma senha é exibida nem passada como argumento de linha de comando: chegam ao `psql` só pelo stdin (`\set`), sobre TLS `verify-full`.
- **Rotacionar derruba a produção até um novo deploy.** Cada deploy da Vercel guarda as variáveis do momento em que foi criado, então o deploy no ar continua com a senha antiga, que deixa de valer. Logo depois do script, refaça o deploy de Produção e o de Preview (`vercel redeploy <URL do deploy atual>`) e confira `/api/health` nos dois. Em 2026-10-18 a produção ficou fora do ar (503) por isso até ser republicada.
- **A senha vai em texto ao Neon.** O Neon só aceita senha em texto e a guarda com hash ("Hashed passwords are not supported", [Manage roles](https://neon.com/docs/manage/roles)); um verificador SCRAM calculado localmente é recusado pelo plano de controle (`Neon only supports being given plaintext passwords`). Por isso o envio de verificadores SCRAM, adotado na US-029, foi revertido em 2026-10-18.
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
