# Política de segurança — Zero Trust

Decisão: [ADR-0011](../adr/0011-zero-trust-security.md). Princípio: **nunca confiar, sempre verificar; menor privilégio; assumir violação.**

## Ativos e ameaças principais

| Ativo | Ameaça | Controle principal |
|---|---|---|
| Livros, estruturas e anotações do usuário (direitos autorais) | Leitura/alteração por outro usuário (IDOR) | Repositórios com `userId`; 404 em recurso alheio; testes de dois usuários; RLS avaliada |
| Sessão / conta Google | Roubo de sessão, CSRF, login indevido | Cookies httpOnly/secure/SameSite, sessão curta e revogável, OAuth com PKCE/state, allowlist |
| Conteúdo rico do editor | XSS armazenado | JSON (não HTML), sanitização, CSP, Mermaid em modo estrito |
| Segredos (OAuth, DB, auth secret) | Vazamento em código, logs, cliente, preview | Variáveis por ambiente, sem `NEXT_PUBLIC_` sensível, secret scanning |
| Cadeia de suprimentos | Dependência ou Action comprometida | Lockfile, versões fixadas, Actions por SHA, Dependabot, mínimo de dependências |
| Banco de dados | Credencial com poder excessivo, injeção | Papéis separados, consultas parametrizadas (Drizzle), Zod |

## Regras de projeto

### 1. Verificar explicitamente

1. **Autorização no ponto do dado.** O middleware/redirecionamentos são conveniência de UX, **não** controle de segurança. Toda página, Server Action e Route Handler chama `requireUser()` e usa repositórios que exigem `userId`.
   - **Exceções explícitas** (públicas por design, sem dados de usuário). Toda nova exceção entra nesta lista com justificativa:

     | Rota | Por que é pública | Salvaguardas |
     |---|---|---|
     | `GET /api/health` (US-003) | Verificação de disponibilidade do deploy e do banco | Só `{"status":"ok"}`/`{"status":"error"}`, `Cache-Control: no-store`, consulta fixa (uma linha de `app_meta`, tabela técnica sem dados de usuário) com o papel `app`, erro só no log (código do Postgres). Rate limit planejado na US-028 (Vercel Firewall), já que cada chamada abre conexão com o banco. |
     | `GET/POST /api/auth/*` (US-004) | Endpoints do Better Auth: é aqui que a sessão nasce (início do login, callback do Google, leitura da sessão, logout) | O Better Auth valida a própria entrada e confere `Origin`/CSRF; allowlist e `email_verified` nos *database hooks* (recusa sem gravar nada); `state` e PKCE (S256); cookie `httpOnly`/`SameSite=Lax`/`Secure` em https; erros só como código genérico em `?error=`; login com e-mail/senha desabilitado. O rate limit embutido do Better Auth é por instância serverless; o limite real fica para a US-028. Ver [authentication.md](../architecture/authentication.md). |
     | Página `/login` (US-004) | Tela de entrada para quem ainda não tem sessão | Não lê dados de usuário; só sabe se o Google está configurado no ambiente. O `?error=` vira uma de três mensagens fixas e nunca é exibido. |
2. **Server Actions são endpoints públicos.** Validam entrada (Zod), autenticam, autorizam e verificam origem (proteção CSRF padrão do Next + checagem de `Origin`).
3. **Identidade só do servidor.** `userId`, `ownerId`, papéis e preços/pesos nunca vêm de parâmetros, cookies não assinados ou campos de formulário.
4. **Recurso alheio = inexistente.** Resposta 404 idêntica à de recurso que não existe (sem diferença de mensagem nem de tempo perceptível).
5. **Entrada nunca é confiável.** Validar tipo, formato, tamanho e enum de tudo (IDs como UUID, textos com limite, JSON do editor com schema e limite de tamanho).
6. **Reautenticação em ações destrutivas** (excluir livro): confirmação explícita; reavaliar exigir sessão recente (US-009).
7. **Login: acesso negado por padrão.** Somente contas Google na allowlist (D-10) criam conta; `email_verified` obrigatório; OAuth com `state` e PKCE; redirect URIs mínimos.

### 2. Menor privilégio

1. **Banco:** dois papéis — `app` (DML apenas, sem DDL/DROP, sem superuser) e `migrator` (DDL, usado só no deploy). Credenciais distintas por ambiente (produção, preview, local). Nenhum dos dois tem atributo elevado (`SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`) nem pertence a outro papel; `roles.sql` impõe isso (US-029). Funções novas não são executáveis por `PUBLIC`.
2. **Segredos:** definidos só na Vercel por ambiente; Preview não recebe segredos de produção. Rotacionar em caso de suspeita. `NEXT_PUBLIC_*` nunca contém segredo.
3. **CI/CD:** `GITHUB_TOKEN` com `permissions: contents: read` por padrão, elevando por job; GitHub Actions de terceiros fixadas por SHA; sem segredos expostos a PRs de forks.
4. **Dependências:** adicionar o mínimo necessário; lockfile obrigatório (`pnpm install --frozen-lockfile`); Dependabot/audit no CI.
5. **Previews:** *Deployment Protection* da Vercel ativa (somente o dono acessa).
6. **Cabeçalhos e navegador:** CSP restritiva (sem `unsafe-eval`; `unsafe-inline` evitado via nonce), `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima. Respostas autenticadas com `Cache-Control: private, no-store`.

### 3. Assumir violação

1. **Raio de impacto pequeno:** `owner_id` em toda tabela de conteúdo; RLS do Postgres como segunda barreira (spike na US-006).
2. **Sessões:** curtas, com rotação e revogação no servidor; logout invalida a sessão.
3. **Logs/auditoria:** registrar eventos de segurança (login, falha, exclusão, negação de acesso) com `userId` e carimbo de tempo, **nunca** conteúdo de livros/anotações, tokens ou e-mails em claro além do necessário.
4. **Rate limiting** em login e ações de escrita (Vercel Firewall/WAF); limites de tamanho de payload.
5. **Dados:** criptografia em trânsito (TLS) e em repouso (provedor); backups e restauração testados antes do go-live (US-027).
6. **Contas administrativas:** MFA obrigatório nas contas do dono em Google, GitHub, Vercel e Neon (verificado na US-027).

## Checklist de segurança por história (parte do Definition of Done)

Marcar no PR; “N/A” precisa de justificativa de uma linha.

- [ ] Todo ponto de acesso a dados autentica via `requireUser()` e usa repositório com `userId`.
- [ ] Nenhum `id` de recurso é aceito sem verificação de dono; teste negativo com segundo usuário incluído.
- [ ] Toda entrada validada no servidor com Zod (tipos, tamanhos, enums).
- [ ] Nenhum segredo/dado sensível em código, cliente, logs ou mensagens de erro.
- [ ] Conteúdo de usuário renderizado sem HTML bruto; sanitização aplicada quando houver HTML.
- [ ] Respostas de erro não revelam existência de recursos de terceiros nem detalhes internos.
- [ ] Novas dependências justificadas (necessidade, manutenção, licença) e com lockfile atualizado.
- [ ] Mudanças de schema: coluna `owner_id` presente e coberta pelos testes de isolamento.
- [ ] `.env.example` atualizado, sem valores reais.

## Revisão

A política é revisada na US-026 (auditoria) e sempre que uma ameaça nova for identificada. Mudanças geram novo ADR.
