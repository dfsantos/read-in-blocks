---
paths:
  - "src/server/**"
  - "src/db/**"
  - "tests/integration/**"
---

# Acesso a dados (Zero Trust, ADR-0008)

- Consulta ao banco **somente** em `src/server/repositories/*` e `src/db/*`. Nunca importar o cliente de banco em páginas, componentes, actions ou `lib/`.
- Todo método de repositório recebe `userId` (da sessão, via `requireUser()`) como parâmetro obrigatório e o aplica em **toda** consulta e mutação com `ownedBy` (`src/server/repositories/owner-scope.ts`). Referência: `src/server/repositories/sessions.ts`; guia: `docs/architecture/data-access.md`. A regra de lint `no-restricted-imports` bloqueia o banco fora das pastas permitidas; não adicione exceção sem justificativa no guia.
- Páginas transformam a ausência em 404 com `foundOrNotFound` (`src/server/not-found.ts`).
- Não existe leitura "por id" sem escopo de dono. Nunca confiar em `userId`/`ownerId` vindo do cliente.
- Tabelas de conteúdo (`book`, `book_node`, `note`) têm `owner_id` próprio, mesmo havendo `book_id`.
- Recurso de outro usuário se comporta exatamente como recurso inexistente: **404**, mesma mensagem, sem diferença observável.
- Consultas parametrizadas (Drizzle). Nada de SQL por concatenação de string.
- Toda função nova de repositório vem com teste de isolamento de dois usuários (skill `isolation-tests`).
- Não registrar conteúdo do usuário, tokens ou dados pessoais em logs.
