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
| Rate limit | Regra do Vercel Firewall + `rateLimit` do Better Auth no banco | `/api/auth/*` e `/api/health` |

## Content Security Policy

A cada requisição de página, o proxy gera um nonce de 128 bits e monta a política:

```
default-src 'self';
script-src 'self' 'nonce-<nonce>' 'strict-dynamic';
style-src 'self' 'nonce-<nonce>';
img-src 'self' blob: data: https://*.googleusercontent.com;
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
- Fotos de perfil do Google (`*.googleusercontent.com`) são a única origem externa. Foto de outra origem não carrega e o menu mostra as iniciais.

### Como liberar uma nova origem

1. Confirme que a necessidade é real e que não dá para servir o recurso do próprio site (fontes do `next/font` já são auto-hospedadas).
2. Acrescente a origem **mais específica possível** (host completo, sem curinga quando der) à diretiva certa em `pageCsp()` (`src/lib/security-headers.ts`): `img-src` para imagens, `connect-src` para `fetch`/WebSocket, `font-src`, `frame-src` para *iframes*. Nunca em `default-src`.
3. **Scripts de terceiros:** não acrescente host em `script-src`. Carregue com `<Script nonce={nonce}>` do `next/script`, lendo o nonce de `headers().get("x-nonce")` num Server Component; o `'strict-dynamic'` cuida do resto. Script de terceiro é dependência nova: justifique no PR.
4. Nunca acrescente `'unsafe-inline'`, `'unsafe-eval'`, `data:` em `script-src` nem `*`.
5. Atualize `src/lib/security-headers.test.ts`, esta página e rode o E2E `tests/e2e/security-headers.spec.ts`, que falha se o navegador acusar violação de CSP.

## Proteção de requisições

### Server Actions

O Next.js compara a `Origin` com o `Host` (ou `X-Forwarded-Host`) e aborta a action quando diferem. Não configuramos `allowedOrigins`: só o próprio site chama actions. O corpo é limitado a **100 kB** (`serverActions.bodySizeLimit`); as actions de hoje não recebem entrada, e o limite deve ser revisto quando o editor de anotações chegar (US-019), só o necessário.

As actions continuam validando a entrada com Zod e chamando `requireUser()` (regra `server-actions`): a checagem de origem não autentica ninguém.

### Route Handlers de escrita

O Next.js não protege Route Handlers. Todo handler que muda estado começa com `guardWrite(request)`, que responde antes de ler o corpo:

- **403** se a `Origin` não for a do próprio site, se faltar `Origin` ou se o `Sec-Fetch-Site` disser `same-site` ou `cross-site`. Navegadores mandam `Origin` em todo POST, então a ausência indica requisição forjada fora do navegador.
- **411** sem `Content-Length` válido (um corpo *chunked* poderia ter qualquer tamanho).
- **413** acima de 16 kB (padrão; o segundo parâmetro muda o limite).

O `POST /api/auth/*` usa o guarda antes do Better Auth, que ainda confere a origem por conta própria.

## Rate limit

Duas camadas, porque nenhuma basta sozinha:

1. **Vercel Firewall** (fora do repositório, aplicada pelo responsável): uma regra de rate limit por IP para os caminhos que começam com `/api/auth/` **ou** são iguais a `/api/health`, respondendo 429 acima do limite (100 requisições por minuto, janela fixa). No plano Hobby cabe uma única regra de rate limit por projeto, com janela de 10 s a 10 min. Para conferir:

   ```bash
   pnpm dlx vercel@64.3.1 firewall rules list
   ```

   As condições ficam em grupos separados (`--or`), senão elas se somam com E e a regra nunca dispara; o operador de prefixo é `pre` (`eq` compara o texto literal, sem curinga).

2. **Better Auth** (`rateLimit` em `src/server/auth/options.ts`): contadores na tabela `rate_limit`, compartilhados entre as instâncias serverless (o padrão em memória zeraria a cada instância). Limites: 60 requisições por minuto por IP em `/api/auth/*`, e 10 por minuto em `/sign-in/*` e `/callback/*`. O IP vem de `x-forwarded-for`, que a Vercel sobrescreve. Ligado só em produção (padrão do Better Auth), para não atrasar os testes; o teste de integração `auth-rate-limit.test.ts` o liga explicitamente.

As Server Actions de escrita ainda não têm limite próprio: as que existem não gravam conteúdo. Quando chegarem (US-007 em diante), o limite por leitor entra junto.

## Limites conhecidos

- **IP na tabela `rate_limit`:** a chave guarda IP e caminho, um dado pessoal. As linhas não expiram sozinhas (o Better Auth reaproveita a linha da mesma chave). Limpeza periódica fica para a auditoria da US-026.
- **IPv6 por /64:** o Better Auth conta IPv6 por sub-rede /64, o que é o comportamento desejado contra quem troca de endereço dentro da mesma rede.
- **Página 404 de rota inexistente:** a página padrão do Next (`/_not-found`) é estática e não recebe nonce; como não tem interação, o efeito esperado é só o aviso de CSP no console (não verificado no E2E). Um `notFound()` dentro de página dinâmica (o caso de recurso alheio, `foundOrNotFound`) é renderizado na própria requisição e recebe o nonce.
- **HSTS sem `preload`:** o domínio é um subdomínio de `vercel.app`; `preload` só faz sentido com domínio próprio (US-027).

## Testes

- **Unitários:** `src/lib/security-headers.test.ts` (política e cabeçalhos), `src/proxy.test.ts` (CSP com nonce novo por requisição e `no-store` em toda página), `src/server/request-guard.test.ts` e `src/app/api/auth/[...all]/route.test.ts` (o Better Auth não recebe a escrita recusada).
- **Integração:** `tests/integration/auth-rate-limit.test.ts` (limite compartilhado entre duas instâncias, contado por endereço).
- **E2E:** `tests/e2e/security-headers.spec.ts` confere os cabeçalhos em `/login`, no redirecionamento de `/`, numa página autenticada e em `/api/*`; falha se o navegador acusar violação de CSP; e recusa um POST de outra origem em `/api/auth/*`.
