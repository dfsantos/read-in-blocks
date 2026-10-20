# Cabeçalhos de segurança e proteção de requisições

História: US-028. Política: [zero-trust.md](zero-trust.md) (itens 1.2, 2.6 e 3.4) e [ADR-0011](../adr/0011-zero-trust-security.md). Estes controles são uma **segunda barreira**: não substituem a autorização no ponto do dado nem a renderização segura do conteúdo, mas limitam o estrago quando outra camada falha.

## Onde cada coisa é definida

| Controle | Onde | Vale para |
|---|---|---|
| CSP com nonce | `src/proxy.ts` → `pageCsp()` em `src/lib/security-headers.ts` | Toda página (inclusive o redirecionamento para `/login`) |
| `Cache-Control: private, no-store` | `src/proxy.ts` | Toda página: todas são renderizadas por leitor |
| HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Permissions-Policy` | `headers()` em `next.config.ts` (`STATIC_SECURITY_HEADERS`) | Todas as respostas |
| CSP `default-src 'none'; frame-ancestors 'none'` | `headers()` em `next.config.ts` (`API_CSP`) | `/api/*`, que não passa pelo proxy |
| Sem `X-Powered-By` | `poweredByHeader: false` em `next.config.ts` | Todas as respostas |
| Origem e tamanho do corpo nas Server Actions | Next.js (checagem de `Origin` × `Host`; `serverActions.bodySizeLimit: "100kb"`) | Toda Server Action |
| Origem e tamanho do corpo nos Route Handlers de escrita | `guardWrite()` em `src/server/request-guard.ts` | `POST /api/auth/*` e todo handler de escrita futuro |
| Lista de endpoints do Better Auth | `ENDPOINTS` em `src/app/api/auth/[...all]/route.ts` | `/api/auth/*`: o resto é 404 antes do Better Auth |
| Rate limit | Regra do Vercel Firewall + `rateLimit` do Better Auth no banco | `/api/auth/*` e `/api/health` |
| Rate limit por leitor das Server Actions de escrita | `consumeWriteQuota()` em `src/server/repositories/write-quota.ts` (tabela `write_quota`) | Toda Server Action que grava (hoje `createBook`) |

## Content Security Policy

A cada requisição de página, o proxy gera um nonce de 128 bits e monta a política:

```
default-src 'self';
script-src 'self' 'nonce-<nonce>' 'strict-dynamic';
style-src 'self' 'nonce-<nonce>';
img-src 'self' blob: data: https://lh3.googleusercontent.com;
font-src 'self';
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
frame-src 'none';
worker-src 'self';
manifest-src 'self';
upgrade-insecure-requests        (só em https)
```

- O proxy põe a política também no **cabeçalho da requisição**: o Next.js lê o nonce dali e o aplica aos próprios scripts; o next-intl repassa os cabeçalhos para a página. O nonce também vai em `x-nonce` (`NONCE_HEADER`), para componentes que precisem dele.
- `'strict-dynamic'` deixa os scripts com nonce carregarem os próprios *chunks*; nenhum outro script roda.
- Sem `'unsafe-eval'` e sem `'unsafe-inline'`. A exceção é o `next dev`, que precisa de `eval` e injeta estilos sem nonce. O build de produção (`next start`, Preview, produção) nunca recebe as duas.
- **Toda página precisa ser renderizada dinamicamente**, porque o nonce só existe por requisição. Hoje todas são (leem a sessão). Página estática ou ISR não recebe o nonce e fica sem JavaScript.
- Fotos de perfil do Google (`lh3.googleusercontent.com`) são a única origem externa. Só esse host: o resto de `googleusercontent.com` serve conteúdo de terceiros, o que daria a um XSS um canal de saída. Foto de outra origem não carrega e o menu mostra as iniciais.

### Como liberar uma nova origem

1. Confirme que a necessidade é real e que não dá para servir o recurso do próprio site (fontes do `next/font` já são auto-hospedadas).
2. Acrescente a origem **mais específica possível** (host completo, sem curinga quando der) à diretiva certa em `pageCsp()` (`src/lib/security-headers.ts`): `img-src` para imagens, `connect-src` para `fetch`/WebSocket, `font-src`, `frame-src` para *iframes*. Nunca em `default-src`.
3. **Scripts de terceiros:** não acrescente host em `script-src`. Carregue com `<Script nonce={nonce}>` do `next/script`, lendo o nonce de `headers().get("x-nonce")` num Server Component; o `'strict-dynamic'` cuida do resto. Script de terceiro é dependência nova: justifique no PR.
4. Nunca acrescente `'unsafe-inline'`, `'unsafe-eval'`, `data:` em `script-src` nem `*`.
5. Atualize `src/lib/security-headers.test.ts`, esta página e rode o E2E `tests/e2e/security-headers.spec.ts`, que falha se o navegador acusar violação de CSP.

## Proteção de requisições

### Server Actions

O Next.js compara a `Origin` com o `Host` (ou `X-Forwarded-Host`) e aborta a action quando diferem. Não configuramos `allowedOrigins`: só o próprio site chama actions. O corpo é limitado a **100 kB** (`serverActions.bodySizeLimit`); a maior entrada de hoje é o cadastro de livro (título e autor, até 200 caracteres cada, US-007), e o limite deve ser revisto quando o editor de anotações chegar (US-019), só o necessário.

As actions continuam validando a entrada com Zod e chamando `requireUser()` (regra `server-actions`): a checagem de origem não autentica ninguém.

### Route Handlers de escrita

O Next.js não protege Route Handlers. Todo handler que muda estado começa com `guardWrite(request)`, que responde antes de ler o corpo:

- **403** se a `Origin` não for a do próprio site, se faltar `Origin` ou se o `Sec-Fetch-Site` disser `same-site` ou `cross-site`. Navegadores mandam `Origin` em todo POST, então a ausência indica requisição forjada fora do navegador.
- **411** sem `Content-Length` válido (um corpo *chunked* poderia ter qualquer tamanho).
- **413** acima de 16 kB (padrão; o segundo parâmetro muda o limite).

O `POST /api/auth/*` usa o guarda antes do Better Auth, que ainda confere a origem por conta própria.

**Provedor com `form_post`:** um callback OAuth com `response_mode=form_post` chega como POST de outro site e seria recusado pelo `guardWrite()`. O Google usa GET, então nada quebra hoje; um provedor novo assim exige exceção específica para o callback dele.

### Endpoints do Better Auth

O handler de `/api/auth/*` só repassa ao Better Auth os endpoints que o app usa: `GET get-session`, `callback/google`, `error` e `ok`, e `POST sign-in/social`. Qualquer outro caminho recebe 404 sem corpo. Motivo (achado da revisão de segurança): o rate limiter do Better Auth grava uma linha em `rate_limit` por caminho **antes** de saber se a rota existe, então caminhos inventados deixariam um cliente encher a tabela (e uma chave enorme estouraria o índice com erro 500). A saída é uma Server Action que chama a API direto, sem HTTP. Usar outro endpoint do Better Auth no navegador exige incluí-lo em `ENDPOINTS`.

## Rate limit

Duas camadas nos Route Handlers, porque nenhuma basta sozinha, e uma terceira nas Server Actions:

1. **Vercel Firewall** (fora do repositório, aplicada pelo responsável): uma regra de rate limit por IP para os caminhos que começam com `/api/auth/` **ou** são iguais a `/api/health`, respondendo 429 acima do limite (100 requisições por minuto, janela fixa). No plano Hobby cabe uma única regra de rate limit por projeto, com janela de 10 s a 10 min. Para conferir:

   ```bash
   pnpm dlx vercel@64.3.1 firewall rules list
   ```

   As condições ficam em grupos separados (`--or`), senão elas se somam com E e a regra nunca dispara; o operador de prefixo é `pre` (`eq` compara o texto literal, sem curinga).

2. **Better Auth** (`rateLimit` em `src/server/auth/options.ts`): contadores na tabela `rate_limit`, compartilhados entre as instâncias serverless (o padrão em memória zeraria a cada instância). Limites: 60 requisições por minuto por IP em `/api/auth/*`, e 10 por minuto em `/sign-in/*` e `/callback/*`. O IP vem de `x-forwarded-for`, que a Vercel sobrescreve. Ligado só em produção (padrão do Better Auth), para não atrasar os testes; o teste de integração `auth-rate-limit.test.ts` o liga explicitamente.

3. **Server Actions de escrita** (US-007): limite por leitor e por ação, em janela fixa, com `consumeWriteQuota(userId, { action, limit, windowSeconds })`. Os contadores ficam na tabela `write_quota` (uma linha por leitor e ação, com `owner_id` e a política de dono do RLS, acessada por `withOwner`), então valem entre as instâncias serverless. Um único `INSERT … ON CONFLICT DO UPDATE` conta e decide, com o relógio do banco (`now()`): chamadas simultâneas não passam do limite juntas. Chamadas acima do limite também contam, então um cliente insistente continua bloqueado até a janela acabar. A action chama a cota depois do Zod e do `requireUser()` e antes do repositório, e responde `errorKey: "rateLimited"`. Limite atual: `books.create`, 20 por minuto. Toda Server Action de escrita nova declara a sua cota.

## Limites conhecidos

- **IP na tabela `rate_limit`:** a chave guarda IP e caminho, um dado pessoal. O Better Auth 1.6.23 apaga as linhas mais antigas que a maior janela (60 s) sempre que alguma chave reinicia a janela, então com tráfego a retenção é de minutos; sem tráfego, as últimas linhas ficam até a próxima requisição. A política de retenção é conferida na auditoria da US-026.
- **IP não resolvido:** se o `x-forwarded-for` vier vazio ou com mais de um valor, o Better Auth conta todos os clientes num único balde (`no-trusted-ip`), e 10 tentativas por minuto do mundo inteiro bloqueariam o login de todos. Na Vercel o cabeçalho tem um único valor; conferir no Preview que a chave gravada traz o IP real e ficar atento ao aviso "could not determine a client IP" nos logs.
- **Janela fixa das Server Actions:** a cota por leitor (`write_quota`) zera de uma vez no fim da janela, então um leitor pode fazer até o dobro do limite em poucos segundos ao redor da virada (20 no fim de um minuto, 20 no começo do próximo). Com 20 por minuto o efeito é pequeno; janela deslizante só se algum abuso real aparecer.
- **IPv6 por /64:** o Better Auth conta IPv6 por sub-rede /64, o que é o comportamento desejado contra quem troca de endereço dentro da mesma rede.
- **Página 404 de rota inexistente:** a página padrão do Next (`/_not-found`) é estática e não recebe nonce; como não tem interação, o efeito esperado é só o aviso de CSP no console (não verificado no E2E). Um `notFound()` dentro de página dinâmica (o caso de recurso alheio, `foundOrNotFound`) é renderizado na própria requisição e recebe o nonce.
- **HSTS sem `preload`:** o domínio é um subdomínio de `vercel.app`; `preload` só faz sentido com domínio próprio (US-027).

## Testes

- **Unitários:** `src/lib/security-headers.test.ts` (política e cabeçalhos), `src/proxy.test.ts` (CSP com nonce novo por requisição e `no-store` em toda página), `src/server/request-guard.test.ts` e `src/app/api/auth/[...all]/route.test.ts` (o Better Auth não recebe a escrita recusada).
- **Integração:** `tests/integration/auth-rate-limit.test.ts` (limite compartilhado entre duas instâncias, contado por endereço).
- **E2E:** `tests/e2e/security-headers.spec.ts` confere os cabeçalhos em `/login`, no redirecionamento de `/`, numa página autenticada e em `/api/*`; falha se o navegador acusar violação de CSP; e recusa um POST de outra origem em `/api/auth/*`.
