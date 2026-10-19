# Acesso a dados e isolamento por dono

Como o código chega ao banco sem que um leitor veja ou altere dados de outro. Decisão: [ADR-0008](../adr/0008-data-isolation-per-user.md). Política: [zero-trust.md](../security/zero-trust.md). Montado na US-006.

## Camadas

```
página / Server Action / Route Handler
  └─ requireUser()                  → userId da sessão (nunca do cliente)
      └─ src/server/repositories/*  → toda consulta filtrada por dono
          └─ src/db/*               → cliente (papel app), schema, migrações
```

- **Somente** `src/server/repositories` e `src/db` importam o cliente de banco, o schema, `drizzle-orm` ou os drivers (`pg`, `pg-*`, `postgres`, `@neondatabase/*`, `@vercel/postgres`). As regras `no-restricted-imports` e `no-restricted-syntax` em `eslint.config.mjs` bloqueiam o resto de `src/`:
  - imports com alias, relativos, `import type` e drivers;
  - **reexportação** de módulos de banco, inclusive dentro dos repositórios (quem importasse o repositório receberia o cliente);
  - a instância do Better Auth (`getAuth`/`createAuth`) e o `$context` dele, cujo adaptador lê e apaga dados de qualquer leitor sem filtro de dono. Fora de `src/server/auth`, da rota `/api/auth` e da action de sair, use `requireUser()`.
- `src/server/repositories/data-access-boundary.test.ts` prova essas regras e cobre o que o lint não vê: nenhum repositório **exporta** cliente, banco ou tabela (conferido nos módulos carregados); nenhum `eslint-disable` desliga as regras de fronteira; os `import()`/`require()` **literais** para o banco são detectados, e `import()` com especificador calculado ou `createRequire` só são aceitos em arquivos revisados (hoje, `src/i18n/request.ts`, que carrega o catálogo de `messages/`). É uma verificação por texto: a revisão de PR continua necessária.
- **Exceções documentadas** (fora das pastas, mas autorizadas na regra):

  | Arquivo | Motivo |
  |---|---|
  | `src/server/auth/index.ts` | Camada de dados do próprio Better Auth (tabelas `user`, `session`, `account`, `verification` e, desde a US-028, `rate_limit`) |
  | `src/server/auth/cli.ts` | Entrada só do CLI do Better Auth; não abre conexão |
  | `src/app/api/health/route.ts` | Verificação pública de saúde; só `src/db/health.ts` (consulta fixa, sem dado de usuário) |
  | `src/server/auth/**`, `src/app/api/auth/**`, `src/server/actions/auth.ts` | Podem usar a instância do Better Auth (sessão, rota, sair), mas não o banco |

  Exceção nova exige justificativa nesta tabela e na regra de lint, e revisão de segurança.
- Os testes em `tests/` ficam fora da regra: eles precisam semear e conferir o banco diretamente.

## Repositórios

Todo repositório recebe o `userId` como parâmetro obrigatório e o aplica em **toda** consulta e mutação com `ownedBy` (`src/server/repositories/owner-scope.ts`):

```ts
export async function findSession(userId: string, sessionId: string, db: Database = getDb()) {
  const [row] = await db
    .select(ownSessionColumns)
    .from(authSchema.session)
    .where(ownedBy(authSchema.session.userId, userId, eq(authSchema.session.id, sessionId)))
    .limit(1);
  return row; // undefined: não existe OU é de outro leitor
}
```

- O repositório obtém o cliente sozinho (`db = getDb()` como último parâmetro, injetado só pelos testes): quem chama nunca segura o cliente.
- `ownedBy(colunaDoDono, userId, ...condições)` monta `owner = $userId AND …` com parâmetros, e **lança erro** se o `userId` vier vazio (sinal de que a chamada pulou o `requireUser()`).
- Não existe leitura "por id" sem o dono. Mutações (`update`/`delete`) também filtram por dono e informam se algo foi afetado.
- Selecionar só as colunas que o leitor pode ver (ex.: o repositório de sessões nunca devolve o `token`).
- **Ids gerados no servidor** em toda criação: aceitar um id do cliente revelaria, por violação de chave, que ele já existe para outro leitor.
- **Recurso de exemplo:** `src/server/repositories/sessions.ts` (sessões do próprio leitor: listar, buscar, excluir), sobre a tabela `session` do Better Auth, sem migração. Ainda não tem tela; serve de referência para as tabelas de conteúdo (`book`, `book_node`, `note`), que terão `owner_id` próprio (ADR-0008, item 2).

## Recurso alheio = 404

- O repositório devolve **o mesmo valor** para recurso inexistente e recurso de outro leitor (`undefined` na leitura, `false` na exclusão). Ele nunca sabe, nem informa, que o recurso existe para outra pessoa.
- Páginas usam `foundOrNotFound(resultado)` (`src/server/not-found.ts`), que chama o `notFound()` do Next para `undefined` ou `null`: a mesma página 404 nos dois casos, nunca 403.
- Server Actions devolvem `{ ok: false, errorKey }` com a mesma chave de "não encontrado" nos dois casos (a chave entra no catálogo na primeira história que tiver uma action desse tipo).

## Testes de isolamento entre dois leitores

Utilitário: `tests/integration/isolation/two-readers.ts`. Cada recurso descreve suas operações num `IsolationSpec` e chama `describeIsolation`:

```ts
describeIsolation(db, "sessions", {
  seed: seedSession,                         // cria o recurso do dono
  missing: () => ({ id: randomUUID() }),     // mesmo formato, id inexistente
  snapshot: (_owner, owned) => sessionRow(owned.id),
  contains: (result, owned) => /* o resultado traz o recurso do dono? */,
  operations: {
    list: (userId) => listSessions(db, userId),
    find: (userId, target) => findSession(db, userId, target.id),
    delete: (userId, target) => deleteSession(db, userId, target.id),
  },
});
```

Para cada operação, o utilitário cria dois leitores e verifica que:

1. o intruso, sobre o recurso do dono, recebe **exatamente** o mesmo resultado (ou o mesmo erro) que sobre um id inexistente;
2. o resultado do intruso não traz o recurso do dono (`contains`), o que pega uma listagem que mistura itens próprios e alheios;
3. o recurso do dono continua igual (`snapshot` antes e depois);
4. o dono, com a mesma chamada, alcança o recurso (controle positivo: sem ele, uma operação que nunca acha nada passaria).

O próprio utilitário é testado contra um repositório que ignora o dono (`sessions.test.ts`, "isolation harness"). Novos recursos seguem a skill `isolation-tests`.

## Checklist de revisão de PR

Bloqueante em toda história que toca dados (também no [template de PR](../../.github/pull_request_template.md) e no [Definition of Done](../plan/README.md)):

- [ ] Toda consulta tem escopo de dono: nenhuma consulta fora de `src/server/repositories`/`src/db` e todo método de repositório usa `ownedBy` com o `userId` de `requireUser()`.
- [ ] Tabela de conteúdo nova com `ownerPolicy()` (RLS) e repositório rodando por `withOwner`, usando o `tx` recebido.
- [ ] Recurso alheio responde igual a recurso inexistente (404 / mesma `errorKey`).
- [ ] Operações novas registradas no `describeIsolation` do recurso.
- [ ] Nenhuma exceção nova nas regras de fronteira (nem `eslint-disable`) sem justificativa nesta página.
- [ ] Repositório não exporta nem reexporta cliente, banco ou tabelas; criações usam ids gerados no servidor.

## RLS do Postgres

Segunda barreira (US-033, D-14): as tabelas de conteúdo têm RLS com a política de dono ([database.md](database.md#rls-nas-tabelas-de-conteúdo)), e o repositório roda suas consultas dentro de `withOwner`, que define o dono só naquela transação. O filtro `ownedBy` continua em toda consulta: as duas barreiras valem juntas.

```ts
export async function findBook(userId: string, bookId: string, db: Database = getDb()) {
  return withOwner(
    userId,
    async (tx) => {
      const [row] = await tx
        .select(bookColumns)
        .from(schema.book)
        .where(ownedBy(schema.book.ownerId, userId, eq(schema.book.id, bookId)))
        .limit(1);
      return row;
    },
    db,
  );
}
```

- Use sempre o `tx` recebido, nunca o `db`, dentro do `withOwner`: consulta fora da transação não tem dono e não vê nada (falha fechada).
- `withOwner` lança erro com `userId` vazio, como `ownedBy`.
- Só repositórios importam `withOwner` (regra `no-restricted-imports` em `eslint.config.mjs`, que também proíbe reexportá-lo; o teste de fronteira confere que nenhum repositório o exporta e pega `import()` dinâmico), e só ele define `app.user_id` (teste `owner-setting.test.ts`). Com ele, quem chama escolheria o dono do RLS e receberia uma transação sobre o schema inteiro.
- Nos repositórios, `@typescript-eslint/no-floating-promises` é erro: uma consulta sem `await` continuaria depois do `COMMIT`, fora da transação do dono.
- Limite: o RLS pega um filtro esquecido, não um servidor comprometido. O `app` define o dono que quiser; o `userId` continua vindo só do `requireUser()`.
- As tabelas do Better Auth ficam fora (o adaptador dele não define o dono); o acesso a elas já é restrito a `src/server/auth` e ao repositório de sessões.

Provas: `tests/integration/rls.test.ts` (dono, falha fechada, fim da transação e erro na mesma conexão do pool, mudança de dono recusada), `tests/integration/rls-catalog.test.ts` (catálogo) e o resultado no pooler do Neon no [adendo da US-033 do ADR-0008](../adr/0008-data-isolation-per-user.md).
