# Autenticação

Login com Google pelo Better Auth ([ADR-0005](../adr/0005-authentication-better-auth-google.md)), acesso negado por padrão ([D-10](../plan/open-decisions.md), [zero-trust.md](../security/zero-trust.md)) e sem login no Preview ([ADR-0016](../adr/0016-no-google-sign-in-on-preview.md)). Login implementado na US-004; sessão, saída e rotas protegidas na US-005.

## Como funciona

1. A página `/login` mostra um único botão, "Entrar com Google". Ele chama `authClient.signIn.social({ provider: "google" })` (`src/components/auth/google-sign-in-button.tsx`).
2. O Better Auth (`/api/auth/[...all]`) gera `state` e o desafio PKCE (S256), guarda o `state` num cookie assinado e redireciona para o Google.
3. No retorno (`/api/auth/callback/google`), o Better Auth confere o `state`, troca o código pelo token enviando o `code_verifier`, lê o perfil do `id_token` e cria ou reaproveita o usuário (`user` + `account`).
4. Antes de gravar, os *database hooks* (`src/server/auth/options.ts`) aplicam a allowlist:
   - **`user.create.before`**: no primeiro login, e-mail fora da lista ou não verificado pelo Google (`email_verified`) é recusado, e **nada é gravado**.
   - **`session.create.before`**: em todo login, novo ou não, a regra é conferida de novo. Tirar um e-mail da lista impede o próximo login.
   - **`account.create/update.before`**: os tokens do Google (`access`, `refresh`, `id_token`) são descartados antes de gravar, porque o app só usa o Google para entrar. Como segunda camada, `encryptOAuthTokens` cifraria o que ainda chegasse ao banco.
5. A recusa redireciona para `/login?error=account_not_allowed`, com uma mensagem genérica. A página só traduz três casos (recusado, cancelado no Google, falha), nunca mostra o valor da URL e não informa o motivo.
6. A sessão fica em cookie `httpOnly`, `SameSite=Lax`, e `Secure` com prefixo `__Secure-` sempre que a URL base é `https`. Dura **12 h fixas a partir do login e nunca é prorrogada** (`disableSessionRefresh`), o que limita a 12 h o uso de um cookie roubado. Desde a US-005, a allowlist e o `email_verified` também são conferidos **a cada requisição** pelo `requireUser()` (ver abaixo): um e-mail retirado da lista perde o acesso na requisição seguinte. Não há *cookie cache*: toda requisição confere a sessão no banco, então apagar a linha de `session` revoga na hora.
7. Eventos registrados em JSON: `auth.login` (com `userId`), `auth.login_denied` (com motivo e, se houver, `userId`), `auth.logout` e `auth.session_revoked` (com `userId` e motivo). Nunca e-mail, nome ou token.

## Sessão, saída e rotas protegidas (US-005)

- **`requireUser()`** (`src/server/auth/session.ts`) é o guarda único de páginas, layouts, Server Actions e Route Handlers. Lê a sessão no banco (`auth.api.getSession`), confere de novo a allowlist e o `email_verified` e devolve `{ id, name, email, image }`. Sem sessão válida, redireciona para `/login`, o que também interrompe uma Server Action. Se o e-mail saiu da lista, a sessão é apagada (`auth.session_revoked`). A foto do Google só é aceita com URL `https:`.
- **`findSessionUser()`** faz a mesma leitura sem redirecionar; só a página de login a usa, para mandar quem já entrou para a biblioteca.
- **Proxy** (`src/proxy.ts`): antes do roteamento do next-intl, quem não tem o cookie de sessão é mandado para `/login?next=<página>`. É só atalho de UX: o proxy não abre a sessão, e um cookie forjado ou vencido passa por ele e é recusado pelo `requireUser()`. As rotas `/api/*` ficam fora do proxy e se protegem sozinhas.
- **Retorno à página original:** `next` passa por `safeNextPath` (`src/lib/routes.ts`), que só aceita caminho deste site (recusa outra origem, `//`, `\`, caracteres de controle, a própria página de login e `/api`). O valor validado vira o `callbackURL` do login com Google; o Better Auth ainda confere o `callbackURL` contra as origens confiáveis.
- **Layout autenticado:** o grupo de rotas `src/app/[locale]/(app)/` chama `requireUser()` no layout e em cada página (layouts não rodam de novo na navegação pelo cliente). O menu do usuário mostra nome e foto (ou iniciais) e a ação "Sair".
- **Sair:** a Server Action `signOut` (`src/server/actions/auth.ts`) chama `requireUser()`, apaga a sessão com `auth.api.signOut` (o plugin `nextCookies`, último da lista, limpa o cookie na resposta da action), registra `auth.logout` e redireciona para `/login`. Não recebe entrada; o Next confere a `Origin` de toda Server Action.
- A biblioteca ainda é `/` (constante `LIBRARY_PATH`); a página própria chega na US-008.

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
- `NEXT_PUBLIC_BETTER_AUTH_URL`, `PUBLIC_BETTER_AUTH_URL`, `NUXT_PUBLIC_BETTER_AUTH_URL`, `NUXT_PUBLIC_AUTH_URL` e `BASE_URL` são **recusadas** se definidas: o Better Auth as usaria como URL base sem passar pela validação. A URL base vem só de `BETTER_AUTH_URL`; sem ela (Preview), dos cabeçalhos da Vercel.
- **Para tirar alguém na hora:** remover o e-mail de `AUTH_ALLOWED_EMAILS` e refazer o deploy. Desde a US-005, a próxima requisição dessa pessoa é recusada e a sessão é apagada. Para revogar sem mudar a lista (cookie roubado, por exemplo), apagar as sessões do usuário (`DELETE FROM session WHERE user_id = …`, com o papel `app`).
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

## Limites conhecidos

- **Rate limit:** o embutido do Better Auth guarda contadores na memória de cada instância serverless, então não protege de fato na Vercel. O limite real fica para a US-028 (Vercel Firewall).
- **Datas sem fuso:** as tabelas geradas pelo CLI usam `timestamp` sem fuso. O Better Auth grava instantes em UTC e o driver converte, então o risco prático é baixo. Mudar para `timestamptz` exige migração própria e regenerar o schema com o tipo aceito pelo CLI; fica registrado como exceção à convenção.
- **Tabela `"user"`:** nome reservado no Postgres. O SQL gerado sempre usa aspas, e qualquer SQL manual também precisa delas.

## Testes

- **Unitários:** `allowlist.test.ts`, `env.test.ts`, mapeamento de erros e botão de login; na US-005, `routes.test.ts` (redirecionamento seguro), `proxy.test.ts`, `session.test.ts` (`requireUser()`) e o menu do usuário.
- **Integração** (`tests/integration/auth.test.ts`): roda o fluxo OAuth real do Better Auth contra o banco de teste, simulando só o endpoint de token do Google. Cobre `state` e PKCE, criação e reaproveitamento do usuário, cookies, recusas sem gravar nada e `state` forjado.
- **Integração da saída** (`tests/integration/sign-out-action.test.ts`): chama a Server Action direto, sem proxy nem página, e confirma a recusa sem cookie e com cookie forjado, a revogação da própria sessão e a de quem saiu da allowlist.
- **E2E** (`tests/e2e/session.spec.ts`, US-005): visitante barrado e retorno à página original, cookie forjado recusado, layout autenticado (também em tela de celular), login aberto por quem já entrou e saída.
- **E2E** (`tests/e2e/login.spec.ts`): página em pt-BR, início do fluxo (o Google é interceptado), mensagens de erro e sessão semeada pelo plugin `testUtils` do Better Auth. O plugin só é carregado por `tests/e2e/auth-helpers.ts`; um teste garante que ele nunca aparece em `src/`.
- As contas semeadas são `E2E_ACCOUNTS` (`tests/e2e/identity.ts`), uma por arquivo de teste, com domínio `.test`. Como o `requireUser()` confere a allowlist a cada requisição, o `playwright.config.ts` passa ao servidor que ele inicia `AUTH_ALLOWED_EMAILS` só com essas contas. Com `reuseExistingServer`, um servidor já aberto na porta 3000 não recebe essa lista e os testes com sessão falham.
- Rodar o E2E localmente exige essas variáveis no processo, com um banco migrado. O CI usa um Postgres descartável, segredo gerado por execução e credenciais do Google fictícias.

## Regenerar o schema

Depois de mudar plugins ou campos do usuário:

```bash
pnpm dlx auth@1.6.23 generate --config src/server/auth/cli.ts --output src/db/auth-schema.ts --yes
```

Em seguida, `pnpm db:generate --name <nome>` para a migração (regra de migrações: só aditiva).
