# ADR-0005 — Better Auth com login social Google

- **Status:** Proposto
- **Data:** 2026-10-15

## Contexto

O app precisa de login social, **apenas Google por ora**, e de sessão segura para identificar o dono de cada dado (RF-010). Não haverá cadastro por e-mail/senha.

## Decisão

- **Better Auth** com o provedor **Google (OAuth 2.0 / OIDC)**, adapter Drizzle e sessões em banco com cookie httpOnly.
- Apenas o provedor Google é habilitado; a configuração é feita em um único módulo (`src/server/auth`) de modo que adicionar provedores seja só configuração.
- E-mail/senha **desabilitado** explicitamente.
- **Zero Trust:** acesso negado por padrão — só contas Google em **allowlist** (D-10, aprovada) criam/usam conta; `email_verified` exigido; OAuth com `state` e PKCE; sessões curtas, com rotação e revogação no servidor ([ADR-0011](0011-zero-trust-security.md)).
- O `userId` da sessão é a única fonte de identidade usada pelos repositórios (ADR-0008).
- Segredos (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) vivem em variáveis de ambiente da Vercel; nunca no repositório. Um `.env.example` documenta os nomes.
- Redirect URIs do Google cadastrados para: localhost, produção e Preview Deployments (limitação conhecida: previews com URL dinâmica exigem domínio de preview estável ou proxy de OAuth — resolvido na US-004).

## Alternativas consideradas

- **Auth.js (NextAuth v5):** muito usado, mas a manutenção migrou para o projeto Better Auth; iniciar nele evita migração futura.
- **Clerk / Auth0:** serviços gerenciados e pagos por escala, com dependência externa desnecessária para um único usuário.
- **Supabase Auth:** exigiria adotar Supabase como banco (ADR-0003).

## Consequências

- Pré-requisito externo: o responsável precisa criar um projeto/credencial OAuth no Google Cloud Console (ver [open-decisions.md](../plan/open-decisions.md), D-04).
- Biblioteca relativamente recente: o fluxo de login é coberto por teste E2E (US-004/US-005) para proteger contra regressões em upgrades.
