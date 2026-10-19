---
paths:
  - "src/server/**"
  - "src/db/**"
  - "tests/integration/**"
---

# Acesso a dados (Zero Trust, ADR-0008)

- Consulta ao banco **somente** em `src/server/repositories/*` e `src/db/*`. Nunca importar o cliente de banco em páginas, componentes, actions ou `lib/`.
- Todo método de repositório recebe `userId` (da sessão, via `requireUser()`) como parâmetro obrigatório e o aplica em **toda** consulta e mutação com `ownedBy` (`src/server/repositories/owner-scope.ts`). Referência: `src/server/repositories/sessions.ts`; guia: `docs/architecture/data-access.md`. O repositório obtém o próprio cliente (`db = getDb()` como último parâmetro, só os testes injetam) e nunca exporta/reexporta cliente ou tabelas. As regras de lint de fronteira bloqueiam o banco e a instância do Better Auth (`getAuth`, `$context`) fora das pastas permitidas; não adicione exceção nem `eslint-disable` sem justificativa no guia.
- Repositório de **tabela de conteúdo** roda suas consultas dentro de `withOwner(userId, (tx) => …)` (`src/server/repositories/with-owner.ts`), que define o dono do RLS só naquela transação, **e** continua filtrando com `ownedBy` (as duas barreiras valem juntas). Nunca definir `app.user_id` de outra forma (`set_config(..., false)`, `SET` sem `LOCAL`): o teste `owner-setting.test.ts` bloqueia. Só repositórios importam `withOwner` (regra de lint; nunca reexportá-lo); nenhuma promessa sem `await` dentro dele (`no-floating-promises`). Tabela nova que o `app` alcança precisa da política de dono ou entrar, com justificativa, na lista `NOT_CONTENT` de `rls-catalog.test.ts`.
- Páginas transformam a ausência em 404 com `foundOrNotFound` (`src/server/not-found.ts`).
- Não existe leitura "por id" sem escopo de dono. Nunca confiar em `userId`/`ownerId` vindo do cliente.
- Tabelas de conteúdo (`book`, `book_node`, `note`) têm `owner_id` próprio, mesmo havendo `book_id`.
- Recurso de outro usuário se comporta exatamente como recurso inexistente: **404**, mesma mensagem, sem diferença observável.
- Consultas parametrizadas (Drizzle). Nada de SQL por concatenação de string.
- Toda função nova de repositório vem com teste de isolamento de dois usuários (skill `isolation-tests`).
- Não registrar conteúdo do usuário, tokens ou dados pessoais em logs.
