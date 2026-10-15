---
name: vertical-slice
description: Gera o esqueleto de uma fatia vertical de funcionalidade do Read in Blocks (schema Drizzle + migração, repositório com userId, Server Action com Zod, componente shadcn, chaves i18n e testes de isolamento) seguindo as convenções do projeto. Use ao implementar uma história que cria ou altera um recurso do usuário.
argument-hint: "<recurso, ex.: book, node, note>"
---

# Fatia vertical

Crie, **na ordem**, apenas o que a história em andamento exige:

1. **Domínio** (`src/domain/<resource>/`): regras puras + testes em tabela, se houver regra de negócio.
2. **Schema + migração** (`src/db/schema/`, `src/db/migrations/`): `owner_id` NOT NULL indexado, cascatas explícitas. Regra `migrations`.
3. **Repositório** (`src/server/repositories/<resource>.ts`): métodos com `userId` obrigatório; recurso alheio ⇒ "não encontrado". Regra `data-access`.
4. **Server Action** (`src/server/actions/<resource>.ts`): Zod → `requireUser()` → repositório → revalidate; retorno `{ ok, data | errorKey }`. Regra `server-actions`.
5. **Mensagens** em `messages/pt-BR.json` (chaves em inglês, valores em pt-BR), incluindo erros de validação e `aria-label`. Regra `i18n`.
6. **UI** (`src/components/<feature>/`, `src/app/[locale]/…`): shadcn, Server Components por padrão. Regra `ui-shadcn`.
7. **Testes:** unitário (domínio), integração com **isolamento de dois usuários** (skill `isolation-tests`), componente se houver lógica, E2E se a história listar.

Antes de escrever, confira os arquivos existentes do mesmo tipo e **siga o padrão deles**. Não crie abstrações além do necessário para a história.
