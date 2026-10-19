# E1 — Autenticação e privacidade

Cobre RF-010 e a regra crítica de privacidade (PRD §6.1). Persona: **Leitor**.

---

### US-004 — Entrar com Google
**Como** leitor, **quero** entrar com minha conta Google, **para** acessar meus livros sem criar senha.
**Cobre:** exigência 3 · RF-010 (base) · **Tamanho:** G · **Depende de:** US-003

**Critérios de aceite**
- [x] Tela de login (shadcn) com botão “Entrar com Google”, todos os textos em pt-BR via i18n.
- [x] Fluxo OAuth completo em local e produção (Preview: abordagem documentada, ver ADR-0005). *Fluxo coberto contra o banco com o endpoint de token do Google simulado (`tests/integration/auth.test.ts`); login com o Google real validado em produção pelo responsável em 2026-10-19. Preview: sem login com Google (ADR-0016, aceito em 2026-10-19).*
- [x] Primeiro login cria o usuário; logins seguintes reutilizam o mesmo registro.
- [x] Sessão em cookie httpOnly; segredos apenas em variáveis de ambiente.
- [x] Nenhum outro método de login disponível (sem e-mail/senha); adicionar provedor futuro é só configuração (documentado).
- [x] **Zero Trust:** acesso negado por padrão — apenas e-mails na allowlist (D-10, aprovada) conseguem entrar; `email_verified` exigido; `state` e PKCE no OAuth; conta fora da lista recebe mensagem genérica e nada é criado no banco.
- [x] Sessão curta com rotação e revogação no servidor; eventos de login/falha registrados (sem dados sensíveis). *Sessão de 12 h fixas a partir do login, nunca prorrogada (a allowlist é conferida a cada login); cada login cria sessão nova; revogação imediata apagando a linha de `session` (sem cookie cache). Desvio de "rotação": o Better Auth não troca o token durante a sessão; a prorrogação foi desligada porque mantinha indefinidamente quem saiu da allowlist (revisão de segurança).*
- [x] Erros de OAuth (acesso negado, falha) mostram mensagem amigável.
- [x] Teste E2E do login usando sessão de teste semeada (não o Google real).

**Pré-requisitos do responsável (D-04):** projeto no Google Cloud Console com cliente OAuth (redirect URIs de local, preview e produção) e lista de e-mails autorizados (D-10) em variável de ambiente.

**Notas técnicas:** ADR-0005. Tabelas de usuário/conta/sessão via Drizzle + migração.

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `better-auth` | **1.6.23** | ✅ Fixada | `/better-auth/better-auth` |
| `@better-auth/drizzle-adapter` | **1.6.23** | ✅ Fixada (mesmo grupo de release do `better-auth`, confirmado no Context7 em 2026-10-18) | `/better-auth/better-auth` |

- [x] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. **Somente versões estáveis:** nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly` ou versões com sufixo `-x.y` (o hook bloqueia).

---

### US-005 — Sessão, sair e rotas protegidas
**Como** leitor, **quero** que o app proteja minhas páginas e me deixe sair, **para** que ninguém acesse minha conta indevidamente.
**Cobre:** RF-010 · **Tamanho:** M · **Depende de:** US-004

**Critérios de aceite**
- [ ] Qualquer rota da aplicação (exceto login e recursos públicos) redireciona visitante anônimo para o login e, depois de entrar, volta ao destino original.
- [ ] Usuário logado que abre o login é redirecionado para a biblioteca.
- [ ] Menu de usuário (nome/foto do Google) com ação “Sair” que encerra a sessão.
- [ ] Helper `requireUser()` único usado por actions e páginas; sem sessão ⇒ rejeição.
- [ ] Layout autenticado básico (cabeçalho, navegação) com shadcn, responsivo.
- [ ] Teste E2E: anônimo é barrado; logado acessa; sair funciona.
- [ ] **Zero Trust:** o controle de acesso **não depende só do middleware** — páginas e actions chamam `requireUser()` por conta própria (teste que chama a action sem passar pelo middleware e é rejeitado).

---

### US-006 — Fundação do isolamento de dados
**Como** leitor, **quero** a garantia técnica de que meus dados só são acessíveis a mim, **para** não infringir direitos autorais nem expor minhas anotações.
**Cobre:** RF-010, regra §6.1 · **Tamanho:** M · **Depende de:** US-005

**Critérios de aceite**
- [ ] Padrão de repositório com `userId` obrigatório implementado e documentado, com um recurso de exemplo.
- [ ] Utilitário de teste que cria dois usuários e verifica que cada operação sobre recurso do outro falha como “não encontrado”.
- [ ] Regra de lint ou teste de arquitetura que impede importar o cliente de banco fora de `src/server/repositories` e `src/db`.
- [ ] Checklist de revisão de PR (“toda consulta tem escopo de dono”) adicionado a [plan/README](../README.md) ou ao template de PR.
- [ ] Respostas a recursos de terceiros são 404, não 403, indistinguíveis das de recurso inexistente.
- [ ] **Spike de RLS** (ADR-0008 item 6): protótipo do Postgres RLS com papel `app` sem `BYPASSRLS` e `set_config` por requisição no driver serverless; resultado documentado (adotar ou justificar não adotar).

**Notas técnicas:** ADR-0008.
**Fora desta história:** adoção definitiva de RLS (decidida a partir do resultado do spike; se adotada, vira história própria).

---

### US-033 — RLS do Postgres nas tabelas de conteúdo
**Como** leitor, **quero** uma segunda barreira no próprio banco, **para** que um filtro de dono esquecido no código não exponha meus livros e anotações.
**Cobre:** RF-010, regra §6.1, ADR-0008 item 6, ADR-0011 (assumir violação) · **Tamanho:** M · **Depende de:** US-006

> O ID é um identificador, não a ordem: esta história entra no marco M2, logo após a US-006 e antes da US-007 (D-14, resolvida em 2026-10-19). Ponto de partida: o spike da US-006 (`tests/integration/rls-spike.test.ts`) e o [adendo do ADR-0008](../../adr/0008-data-isolation-per-user.md).

**Critérios de aceite**
- [ ] Helper `withOwner(userId, fn)` em `src/server/repositories`: abre uma transação, define o dono com `set_config('app.user_id', userId, true)` (local à transação) e recusa `userId` vazio. Todo repositório de tabela de conteúdo roda suas consultas por ele, sem deixar de filtrar por dono com `ownedBy` (as duas barreiras valem juntas).
- [ ] Convenção de migração para tabela de conteúdo documentada ([database.md](../../architecture/database.md), regra `migrations` e skill `vertical-slice`): `ENABLE ROW LEVEL SECURITY` e política de dono para o papel `app`, com `USING` e `WITH CHECK` em `owner_id = current_setting('app.user_id', true)` (com `nullif(..., '')` se a coluna não for `text`).
- [ ] Teste de integração sobre o catálogo do Postgres: toda tabela com coluna `owner_id` tem RLS habilitado e política de dono para o `app`; nenhuma view sem `security_invoker` e nenhuma função `SECURITY DEFINER` alcança tabela de conteúdo. O teste já vale para as tabelas criadas a partir da US-007.
- [ ] Teste de arquitetura: nenhum `set_config(..., false)` nem `SET` sem `LOCAL` de `app.user_id` no código; dono só por `withOwner`.
- [ ] Testes de integração com a tabela de prova: consulta sem filtro dentro de `withOwner` só vê linhas do dono; sem `withOwner`, nada (falha fechada); o dono não sobrevive ao fim da transação, nem a erro, na mesma conexão do pool; mudar `owner_id` para outro leitor é recusado.
- [ ] Validação no **Preview** (pooler do Neon em modo transação) documentada: o dono definido numa transação não aparece na seguinte. Os testes de integração só rodam em host local, então esta é a prova contra o Neon que faltou no spike.
- [ ] Custo medido e registrado (latência a mais por operação, local e Preview) no adendo do ADR-0008.

**Notas técnicas:** ADR-0008 (adendo da US-006), ADR-0014 (papéis e pooler).
**Fora desta história:** as políticas de `book`, `book_node` e `note` entram nas histórias que criam cada tabela (US-007, US-010, US-018), seguindo a convenção e cobertas pelo teste de catálogo; tabelas do Better Auth (o adaptador dele não define o dono; acesso já limitado a `src/server/auth`).

---

### US-028 — Cabeçalhos de segurança e proteção de requisições
**Como** leitor, **quero** que a aplicação se defenda de ataques comuns do navegador, **para** que meu conteúdo continue protegido mesmo se outra camada falhar.
**Cobre:** RF-010, ADR-0011 · **Tamanho:** M · **Depende de:** US-005

> O ID é um identificador, não a ordem: esta história entra no marco M2, logo após a US-005.

**Critérios de aceite**
- [ ] CSP restritiva com nonce (sem `unsafe-eval`; `unsafe-inline` evitado), `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` mínima.
- [ ] Respostas autenticadas com `Cache-Control: private, no-store`.
- [ ] Verificação de `Origin` e proteção CSRF nas Server Actions e Route Handlers de escrita.
- [ ] Rate limiting em login e ações de escrita (Vercel Firewall/WAF) e limite de tamanho de payload.
- [ ] Teste automatizado que verifica a presença dos cabeçalhos nas rotas principais.
- [ ] Documentação da CSP e de como adicionar fontes/scripts permitidos.

**Fora desta história:** sanitização do editor (US-019) e do Mermaid (US-022).
