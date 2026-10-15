# E7 — Lançamento

Endurecimento e entrada em produção. Podem ser executadas assim que M6 estiver aprovado, com ou sem as desejáveis do E6.

---

### US-025 — Polimento de UX, responsividade e acessibilidade
**Como** leitor, **quero** uma interface consistente, acessível e usável no celular, **para** ler e anotar em qualquer dispositivo.
**Cobre:** transversal · **Tamanho:** G · **Depende de:** US-021

**Critérios de aceite**
- [ ] Revisão de todas as telas em mobile, tablet e desktop.
- [ ] Auditoria de acessibilidade (WCAG 2.1 AA): contraste, foco visível, navegação por teclado, rótulos, leitores de tela (ex.: axe nos testes E2E).
- [ ] Estados de carregamento, vazio e erro padronizados; páginas 404 e de erro em pt-BR.
- [ ] Mensagens e textos revisados e consistentes (tom, terminologia), todos no catálogo i18n.
- [ ] Metadados, título de página por rota, favicon.
- [ ] Desempenho verificado (Lighthouse/Speed Insights) nas páginas principais.

---

### US-026 — Auditoria de privacidade e segurança
**Como** responsável pelo produto, **quero** a certeza de que nenhum conteúdo vaza entre usuários, **para** cumprir a regra de direitos autorais do PRD.
**Cobre:** RF-010, regra §6.1 · **Tamanho:** M · **Depende de:** US-021

**Critérios de aceite**
- [ ] Inventário de todas as rotas, Server Actions e repositórios, cada um com verificação de autenticação e escopo de dono.
- [ ] Suíte E2E/integração com dois usuários cobrindo leitura, edição e exclusão de **todos** os tipos de recurso entre contas.
- [ ] Verificação de cabeçalhos de segurança, cookies (httpOnly, secure, SameSite), CSRF das Server Actions e sanitização do conteúdo do editor.
- [ ] Varredura de dependências e segredos (ex.: audit do pnpm, secret scanning) sem pendências críticas.
- [ ] Nenhum dado de usuário em logs; páginas autenticadas sem cache compartilhado.
- [ ] Relatório curto registrado em `docs/` com achados e correções.

---

### US-027 — Publicar em produção
**Como** responsável pelo produto, **quero** o app em produção na Vercel, **para** começar a usá-lo de verdade.
**Cobre:** exigência 1 · **Tamanho:** M · **Depende de:** US-026

**Critérios de aceite**
- [ ] Domínio de produção definido (padrão `*.vercel.app` ou domínio próprio) e OAuth do Google atualizado para ele.
- [ ] Variáveis de ambiente de produção conferidas; migrações aplicadas com sucesso.
- [ ] Checklist de pré-deploy executado e rollback conhecido (promover deploy anterior na Vercel).
- [ ] Backup/restauração do banco conhecido e documentado (plano Neon vigente).
- [ ] Teste de fumaça em produção: login, criar livro, estrutura, estado, anotação.
- [ ] README atualizado para uso e operação.

**Fora desta história:** observabilidade avançada e métricas (depende de D-01).
