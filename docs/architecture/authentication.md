# Autenticação

Login com Google pelo Better Auth ([ADR-0005](../adr/0005-authentication-better-auth-google.md)), acesso negado por padrão ([D-10](../plan/open-decisions.md), [zero-trust.md](../security/zero-trust.md)) e sem login no Preview ([ADR-0016](../adr/0016-no-google-sign-in-on-preview.md)). Implementado na US-004.

## Como funciona

1. A página `/login` mostra um único botão, "Entrar com Google". Ele chama `authClient.signIn.social({ provider: "google" })` (`src/components/auth/google-sign-in-button.tsx`).
2. O Better Auth (`/api/auth/[...all]`) gera `state` e o desafio PKCE (S256), guarda o `state` num cookie assinado e redireciona para o Google.
3. No retorno (`/api/auth/callback/google`), o Better Auth confere o `state`, troca o código pelo token enviando o `code_verifier`, lê o perfil do `id_token` e cria ou reaproveita o usuário (`user` + `account`).
4. Antes de gravar, os *database hooks* (`src/server/auth/options.ts`) aplicam a allowlist:
   - **`user.create.before`**: no primeiro login, e-mail fora da lista ou não verificado pelo Google (`email_verified`) é recusado, e **nada é gravado**.
   - **`session.create.before`**: em todo login, novo ou não, a regra é conferida de novo. Tirar um e-mail da lista impede o próximo login.
5. A recusa redireciona para `/login?error=account_not_allowed`, com uma mensagem genérica. A página só traduz três casos (recusado, cancelado no Google, falha), nunca mostra o valor da URL e não informa o motivo.
6. A sessão fica em cookie `httpOnly`, `SameSite=Lax`, e `Secure` com prefixo `__Secure-` sempre que a URL base é `https`. Dura 12 h, é prorrogada no máximo uma vez por hora enquanto em uso e não tem *cookie cache*: toda requisição confere a sessão no banco, então revogar (apagar a linha de `session`) vale na hora.
7. Eventos registrados em JSON: `auth.login` (com `userId`) e `auth.login_denied` (com motivo e, se houver, `userId`). Nunca e-mail, nome ou token.

Código: `src/server/auth/` (`options.ts` é a configuração única, `env.ts` valida as variáveis com Zod, `allowlist.ts` decide quem entra) e `src/db/auth-schema.ts`, gerado pelo CLI.

## Variáveis de ambiente

| Variável | Production | Preview | Local (`.env.local`) |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | sim, próprio | sim, outro valor | sim, outro valor |
| `BETTER_AUTH_URL` | `https://read-in-blocks.vercel.app` | não | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | sim | **não** (ADR-0016) | sim |
| `AUTH_ALLOWED_EMAILS` | e-mails separados por vírgula | os mesmos | os mesmos |

- Configuração inválida (segredo curto, só uma das credenciais do Google, e-mail inválido na lista) **falha ao iniciar** a autenticação, sem mostrar o valor.
- Allowlist vazia ou ausente bloqueia todo mundo.
- Na Vercel, cadastrar cada variável como *Sensitive*, digitando o valor no prompt da CLI, sem passá-lo como argumento: `pnpm dlx vercel@64.3.1 env add BETTER_AUTH_SECRET production --sensitive`.
- Trocar o `BETTER_AUTH_SECRET` invalida todas as sessões abertas. Se isso um dia for um problema, use a opção `secrets` do Better Auth (rotação com chaves versionadas).

## Cliente OAuth no Google Cloud Console (D-04)

- Tela de consentimento *External*, em modo **Testing**, com **só os e-mails da allowlist como usuários de teste**: o próprio Google barra os demais antes do app.
- Escopos padrão: `openid`, `email`, `profile`.
- Origens JavaScript: `http://localhost:3000` e `https://read-in-blocks.vercel.app`.
- URIs de redirecionamento: `http://localhost:3000/api/auth/callback/google` e `https://read-in-blocks.vercel.app/api/auth/callback/google`. Nenhuma URI de Preview.

## Adicionar outro provedor no futuro

É configuração, sem mudança de fluxo:

1. Decidir em ADR (o ADR-0005 limita o login ao Google) e conferir no Context7 o provedor no Better Auth.
2. Acrescentar a entrada em `socialProviders` de `src/server/auth/options.ts` e as duas variáveis em `env.ts`, `.env.example` e na Vercel.
3. Conferir se o provedor informa e-mail verificado; a allowlist exige `emailVerified`.
4. Acrescentar o botão na página de login, com texto no catálogo, e casos nos testes de integração (`tests/integration/auth.test.ts`).

## Testes

- **Unitários:** `allowlist.test.ts`, `env.test.ts`, mapeamento de erros e botão de login.
- **Integração** (`tests/integration/auth.test.ts`): roda o fluxo OAuth real do Better Auth contra o banco de teste, simulando só o endpoint de token do Google. Cobre `state` e PKCE, criação e reaproveitamento do usuário, cookies, recusas sem gravar nada e `state` forjado.
- **E2E** (`tests/e2e/login.spec.ts`): página em pt-BR, início do fluxo (o Google é interceptado), mensagens de erro e sessão semeada pelo plugin `testUtils` do Better Auth. O plugin só é carregado por `tests/e2e/auth-helpers.ts`; um teste garante que ele nunca aparece em `src/`.
- Rodar o E2E localmente exige essas variáveis no processo, com um banco migrado. O CI usa um Postgres descartável, segredo gerado por execução e credenciais do Google fictícias.

## Regenerar o schema

Depois de mudar plugins ou campos do usuário:

```bash
pnpm dlx auth@1.6.23 generate --config src/server/auth/cli.ts --output src/db/auth-schema.ts --yes
```

Em seguida, `pnpm db:generate --name <nome>` para a migração (regra de migrações: só aditiva).
