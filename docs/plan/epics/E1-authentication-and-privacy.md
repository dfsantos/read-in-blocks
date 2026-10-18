# E1 — Autenticação e privacidade

Cobre RF-010 e a regra crítica de privacidade (PRD §6.1). Persona: **Leitor**.

---

### US-004 — Entrar com Google
**Como** leitor, **quero** entrar com minha conta Google, **para** acessar meus livros sem criar senha.
**Cobre:** exigência 3 · RF-010 (base) · **Tamanho:** G · **Depende de:** US-003

**Critérios de aceite**
- [ ] Tela de login (shadcn) com botão “Entrar com Google”, todos os textos em pt-BR via i18n.
- [ ] Fluxo OAuth completo em local e produção (Preview: abordagem documentada, ver ADR-0005).
- [ ] Primeiro login cria o usuário; logins seguintes reutilizam o mesmo registro.
- [ ] Sessão em cookie httpOnly; segredos apenas em variáveis de ambiente.
- [ ] Nenhum outro método de login disponível (sem e-mail/senha); adicionar provedor futuro é só configuração (documentado).
- [ ] **Zero Trust:** acesso negado por padrão — apenas e-mails na allowlist (D-10, aprovada) conseguem entrar; `email_verified` exigido; `state` e PKCE no OAuth; conta fora da lista recebe mensagem genérica e nada é criado no banco.
- [ ] Sessão curta com rotação e revogação no servidor; eventos de login/falha registrados (sem dados sensíveis).
- [ ] Erros de OAuth (acesso negado, falha) mostram mensagem amigável.
- [ ] Teste E2E do login usando sessão de teste semeada (não o Google real).

**Pré-requisitos do responsável (D-04):** projeto no Google Cloud Console com cliente OAuth (redirect URIs de local, preview e produção) e lista de e-mails autorizados (D-10) em variável de ambiente.

**Notas técnicas:** ADR-0005. Tabelas de usuário/conta/sessão via Drizzle + migração.

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `better-auth` | **1.6.23** | ✅ Fixada | `/better-auth/better-auth` |
| `@better-auth/drizzle-adapter` | **1.6.23** | ✅ Fixada (mesmo grupo de release do `better-auth`, confirmado no Context7 em 2026-10-18) | `/better-auth/better-auth` |

- [ ] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. **Somente versões estáveis:** nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly` ou versões com sufixo `-x.y` (o hook bloqueia).

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
