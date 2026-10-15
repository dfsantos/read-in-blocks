# E0 — Fundação

Infraestrutura mínima para entregar fatias verticais com segurança. Persona: **Desenvolvedor** (histórias técnicas, sem valor direto ao leitor).

---

### US-000 — Aprovar PRD, stack e plano
**Como** responsável pelo produto, **quero** revisar e aprovar o PRD, a stack e este plano, **para** autorizar o início do desenvolvimento.
**Cobre:** — · **Tamanho:** P · **Depende de:** — · **Bloqueios:** D-01…D-09 (apenas as que você quiser fechar agora)

**Critérios de aceite**
- [ ] PRD anexado em `docs/prd/` revisado.
- [ ] ADRs 0001–0010 aceitos (status muda de *Proposto* para *Aceito*) ou ajustados.
- [ ] Ordem do roadmap aprovada.
- [ ] Decisões abertas respondidas ou conscientemente adiadas.

**Fora desta história:** qualquer código.

---

### US-001 — Projeto base com qualidade automatizada
**Como** desenvolvedor, **quero** um projeto Next.js com shadcn/ui, lint, testes e CI configurados, **para** que toda história seguinte nasça com verificação automática.
**Cobre:** exigências 2 e 4 · **Tamanho:** M · **Depende de:** US-000

**Critérios de aceite**
- [ ] Projeto Next.js (App Router) + TypeScript estrito criado com pnpm e versões fixadas.
- [ ] Tailwind e shadcn/ui inicializados; ao menos `Button` e `Card` instalados e usados na página inicial.
- [ ] ESLint, Prettier e `tsc --noEmit` configurados; scripts `lint`, `typecheck`, `test`, `build` funcionam.
- [ ] Vitest roda um teste de exemplo; Playwright configurado com um teste de fumaça.
- [ ] GitHub Actions executa lint, typecheck, testes e build em PRs.
- [ ] `.env.example` e README de desenvolvimento local.
- [ ] Estrutura de pastas conforme [conventions.md](../../architecture/conventions.md).
- [ ] **Conventional Commits:** `commitlint` com `scope-enum` de [git-workflow.md](../../architecture/git-workflow.md), hook `commit-msg` local e job no CI validando commits e título do PR.
- [ ] **Segurança da cadeia de suprimentos:** lockfile com `--frozen-lockfile`, Dependabot, `pnpm audit` e secret scanning no CI; GitHub Actions fixadas por SHA; `permissions` mínimas no workflow.
- [ ] Template de PR com o checklist de segurança Zero Trust, a lista de critérios de aceite e a seção **“Documentação consultada”** (biblioteca, ID Context7, versão adotada).
- [ ] **Context7 primeiro:** versões de Next.js, Tailwind, shadcn, ESLint, Vitest, Playwright e demais pacotes foram escolhidas após consulta ao Context7 (ADR-0013), não de memória.

**Notas técnicas:** ADR-0001, 0002, 0010, 0013. Versões estáveis vigentes na data da implementação, confirmadas no Context7.

---

### US-002 — Internacionalização preparada (pt-BR)
**Como** desenvolvedor, **quero** a infraestrutura de i18n funcionando com pt-BR, **para** que nenhum texto seja escrito direto em componentes.
**Cobre:** exigência 5 · **Tamanho:** M · **Depende de:** US-001

**Critérios de aceite**
- [ ] next-intl configurado com `pt-BR` como único locale e padrão; rotas em `app/[locale]`, URLs sem prefixo.
- [ ] Página inicial e layout raiz usam apenas chaves de `messages/pt-BR.json` (incluindo `<html lang="pt-BR">` e metadados).
- [ ] Datas, números e porcentagens exibidos por formatadores do next-intl (exemplo na página inicial).
- [ ] Verificação automática no CI falha ao encontrar literal de interface em `src/` fora do catálogo.
- [ ] Teste/script que garante que todos os locales registrados têm as mesmas chaves (passa com um só locale; falha ao adicionar um incompleto).
- [ ] Documentado em README como adicionar um novo idioma.

**Notas técnicas:** ADR-0006.
**Fora desta história:** seletor de idioma na UI; segundo idioma.

---

### US-003 — Banco de dados e deploy na Vercel
**Como** desenvolvedor, **quero** o banco Postgres, as migrações e o deploy contínuo na Vercel funcionando, **para** validar o ambiente real desde o começo.
**Cobre:** exigência 1 · **Tamanho:** G · **Depende de:** US-002 · **Bloqueios:** D-04

**Critérios de aceite**
- [ ] Projeto Vercel conectado ao repositório: Preview Deployment por PR e produção a partir de `main`.
- [ ] Postgres (Neon) provisionado pela integração da Vercel; estratégia de banco para preview definida e documentada.
- [ ] Drizzle configurado com a primeira migração (tabela técnica mínima) aplicada de forma automatizada no deploy.
- [ ] Postgres local reproduzível (ex.: Docker Compose) para desenvolvimento e testes de integração; CI com Postgres de serviço.
- [ ] Página de saúde simples confirma conexão com o banco no ambiente publicado (sem expor dados).
- [ ] Variáveis de ambiente documentadas; nenhum segredo no repositório.
- [ ] **Zero Trust:** papéis de banco separados (`app` sem DDL; `migrator` só no deploy), credenciais distintas por ambiente; Preview Deployments com *Deployment Protection* da Vercel; Preview sem segredos de produção.

**Notas técnicas:** ADR-0001, 0003, 0004, 0010.
**Fora desta história:** modelos de domínio.
