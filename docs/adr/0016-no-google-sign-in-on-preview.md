# ADR-0016 — Sem login com Google nos Preview Deployments

- **Status:** Proposto
- **Data:** 2026-10-18

## Contexto

O [ADR-0005](0005-authentication-better-auth-google.md) adota o Better Auth com o provedor Google e deixa para a US-004 uma limitação conhecida: os Preview Deployments da Vercel têm URL diferente a cada branch (`read-in-blocks-<hash>-<time>.vercel.app`), e o Google só aceita redirect URIs cadastrados um a um, sem curinga. Sem uma solução, o login real não funciona no Preview.

O app tem um único usuário (o responsável), o Preview já é protegido pela *Deployment Protection* da Vercel (só o dono acessa; [zero-trust.md](../security/zero-trust.md), regra 2.5) e o fluxo de login é coberto por teste E2E com sessão semeada, sem depender do Google (critério da US-004).

## Decisão

- O login com Google funciona **somente em local (`http://localhost:3000`) e em produção (`https://read-in-blocks.vercel.app`)**. Só essas duas origens e seus callbacks (`/api/auth/callback/google`) ficam cadastrados no cliente OAuth do Google.
- O ambiente **Preview não recebe `GOOGLE_CLIENT_ID` nem `GOOGLE_CLIENT_SECRET`**. O app sobe normalmente no Preview e a tela de login informa que o login não está disponível nesse ambiente, sem tentar o fluxo.
- O Preview mantém o próprio `BETTER_AUTH_SECRET` (diferente do de produção) e o banco `preview` (ADR-0014), sem nenhum dado de produção.
- O fluxo é verificado em CI pelo E2E com sessão semeada e manualmente, na validação de cada história, em local e em produção.
- Decisão do responsável em 2026-10-17, ao planejar a US-004.

## Alternativas consideradas

- **Plugin `oAuthProxy` do Better Auth via produção:** a produção recebe o callback do Google e repassa ao Preview o perfil cifrado com um segredo compartilhado (`OAUTH_PROXY_SECRET`). Daria login real em qualquer Preview, mas exige o mesmo segredo em todos os ambientes (um vazamento em Preview atinge a produção), `trustedOrigins` com curinga de `*.vercel.app` restrito ao time e um endpoint da produção que encaminha sessões para outros hosts. Mais superfície, mais um segredo e uma revisão de segurança própria, para um benefício pequeno com um único usuário.
- **Domínio fixo de preview:** atribuir na Vercel um domínio estável a uma branch Git (ex.: `preview`) e cadastrá-lo como redirect URI. Simples, mas só funciona nessa branch: as previews de cada PR continuariam sem login, e o domínio a mais precisa ser mantido.
- **Cadastrar a URL de cada preview no Google:** inviável (URL nova a cada deploy) e deixaria redirect URIs antigos sobrando no cliente OAuth.

## Consequências

- Menos superfície e menos segredos: as credenciais do Google existem só em produção e no `.env.local` do responsável, e nenhum host de Preview é confiável para o OAuth.
- No Preview não dá para validar manualmente telas que exigem login. Até a US-005, isso afeta só a tela de login; depois, as telas autenticadas são validadas em local (com o banco local) ou em produção, e o CI cobre o fluxo com sessão semeada.
- O código precisa funcionar sem as credenciais do Google no Preview (configuração condicional e mensagem de indisponibilidade na tela de login), com teste.
- Se o app ganhar mais usuários ou a validação em Preview se tornar necessária, reavaliar o `oAuthProxy` em um novo ADR que substitua este.
