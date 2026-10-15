# E1 — Autenticação e privacidade

Cobre RF-010 e a regra crítica de privacidade (PRD §6.1). Persona: **Leitor**.

---

### US-004 — Entrar com Google
**Como** leitor, **quero** entrar com minha conta Google, **para** acessar meus livros sem criar senha.
**Cobre:** exigência 3 · RF-010 (base) · **Tamanho:** G · **Depende de:** US-003 · **Bloqueios:** D-04

**Critérios de aceite**
- [ ] Tela de login (shadcn) com botão “Entrar com Google”, todos os textos em pt-BR via i18n.
- [ ] Fluxo OAuth completo em local e produção (Preview: abordagem documentada, ver ADR-0005).
- [ ] Primeiro login cria o usuário; logins seguintes reutilizam o mesmo registro.
- [ ] Sessão em cookie httpOnly; segredos apenas em variáveis de ambiente.
- [ ] Nenhum outro método de login disponível (sem e-mail/senha); adicionar provedor futuro é só configuração (documentado).
- [ ] Erros de OAuth (acesso negado, falha) mostram mensagem amigável.
- [ ] Teste E2E do login usando sessão de teste semeada (não o Google real).

**Notas técnicas:** ADR-0005. Tabelas de usuário/conta/sessão via Drizzle + migração.

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

---

### US-006 — Fundação do isolamento de dados
**Como** leitor, **quero** a garantia técnica de que meus dados só são acessíveis a mim, **para** não infringir direitos autorais nem expor minhas anotações.
**Cobre:** RF-010, regra §6.1 · **Tamanho:** M · **Depende de:** US-005

**Critérios de aceite**
- [ ] Padrão de repositório com `userId` obrigatório implementado e documentado, com um recurso de exemplo.
- [ ] Utilitário de teste que cria dois usuários e verifica que cada operação sobre recurso do outro falha como “não encontrado”.
- [ ] Regra de lint ou teste de arquitetura que impede importar o cliente de banco fora de `src/server/repositories` e `src/db`.
- [ ] Checklist de revisão de PR (“toda consulta tem escopo de dono”) adicionado a [plan/README](../README.md) ou ao template de PR.
- [ ] Respostas a recursos de terceiros são 404, não 403.

**Notas técnicas:** ADR-0008.
**Fora desta história:** RLS do Postgres.
