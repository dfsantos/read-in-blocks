# E0 — Fundação

Infraestrutura mínima para entregar fatias verticais com segurança. Persona: **Desenvolvedor** (histórias técnicas, sem valor direto ao leitor).

---

### US-000 — Aprovar PRD, stack e plano
**Como** responsável pelo produto, **quero** revisar e aprovar o PRD, a stack e este plano, **para** autorizar o início do desenvolvimento.
**Cobre:** — · **Tamanho:** P · **Depende de:** — · **Bloqueios:** —

> **O que é esta história:** é o *portão de aprovação* do planejamento, sem código. "Em validação" significa que o pacote de documentos está entregue e aguarda o seu aceite. Nada de desenvolvimento começa antes dela ser **Aprovada**.

**O que revisar**
| Item | Onde |
|---|---|
| Produto (PRD, com autor e decisões D-01, D-02 aplicadas) | [prd-read-in-blocks.md](../../prd/prd-read-in-blocks.md) |
| Stack e versões fixadas (13 itens exatos, o restante como linha) | [tech-stack.md](../../architecture/tech-stack.md), [stack-versions.md](../../architecture/stack-versions.md) |
| Decisões técnicas (ADR-0001 a 0013, hoje "Proposto") | [adr/](../../adr/README.md) |
| Segurança Zero Trust, commits e política do Context7 | [zero-trust.md](../../security/zero-trust.md), [git-workflow.md](../../architecture/git-workflow.md), [stack-docs-policy.md](../../architecture/stack-docs-policy.md) |
| Histórias, ordem e marcos | [epics/](.), [roadmap.md](../roadmap.md), [progress.md](../progress.md) |
| Decisões D-01 a D-13 (todas resolvidas) | [open-decisions.md](../open-decisions.md) |

**Critérios de aceite**
- [x] PRD anexado em `docs/prd/` revisado.
- [x] ADRs 0001–0013 aceitos (status muda de *Proposto* para *Aceito*) ou ajustados.
- [x] Stack e versões fixadas revisadas.
- [x] Ordem do roadmap aprovada.
- [x] Decisões abertas respondidas (D-01 a D-13, em 2026-10-15).

**Aprovada em 2026-10-15.** Como foi aprovada: diga "aprovo a US-000" (ou liste os ajustes). Ao aprovar, o agente marcou a US-000 como *Aprovada* em `progress.md` com a data, muda os ADRs para *Aceito* e libera a `/start-story US-001`.

**Fora desta história:** qualquer código.

---

### US-001 — Projeto base com qualidade automatizada
**Como** desenvolvedor, **quero** um projeto Next.js com shadcn/ui, lint, testes e CI configurados, **para** que toda história seguinte nasça com verificação automática.
**Cobre:** exigências 2 e 4 · **Tamanho:** M · **Depende de:** US-000

**Critérios de aceite**
- [x] Projeto Next.js (App Router) + TypeScript estrito criado com pnpm e versões fixadas.
- [x] Tailwind e shadcn/ui inicializados; ao menos `Button` e `Card` instalados e usados na página inicial.
- [x] ESLint, Prettier e `tsc --noEmit` configurados; scripts `lint`, `typecheck`, `test`, `build` funcionam.
- [x] Vitest roda um teste de exemplo; Playwright configurado com um teste de fumaça.
- [x] GitHub Actions executa lint, typecheck, testes e build em PRs.
- [x] `.env.example` e README de desenvolvimento local.
- [x] Estrutura de pastas conforme [conventions.md](../../architecture/conventions.md).
- [x] **Conventional Commits:** `commitlint` com `scope-enum` de [git-workflow.md](../../architecture/git-workflow.md), hook `commit-msg` local e job no CI validando commits e título do PR.
- [x] **Segurança da cadeia de suprimentos:** lockfile com `--frozen-lockfile`, Dependabot, `pnpm audit` e secret scanning no CI; GitHub Actions fixadas por SHA; `permissions` mínimas no workflow.
- [x] Template de PR com o checklist de segurança Zero Trust, a lista de critérios de aceite e a seção **“Documentação consultada”** (biblioteca, ID Context7, versão adotada).
- [x] **Scaffolding pelas CLIs oficiais:** projeto gerado com `create-next-app` (versão fixada da tabela) e shadcn via `shadcn init -t next` (Base UI, padrão da CLI), com as flags confirmadas no Context7. Depois, ajustes ao padrão do projeto (`src/`, versões exatas, estrutura de pastas das convenções). Nenhum arquivo gerado por CLI escrito à mão; em caso de conflito na raiz, gerar em pasta temporária e trazer os arquivos sem sobrescrever `README.md`, `CLAUDE.md`, `docs/` e `.claude/`.
- [x] **Context7 primeiro:** versões de Next.js, Tailwind, shadcn, ESLint, Vitest, Playwright e demais pacotes foram escolhidas após consulta ao Context7 (ADR-0013), não de memória.

**Notas técnicas:** ADR-0001, 0002, 0010, 0013. Versões estáveis vigentes na data da implementação, confirmadas no Context7.

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `Node.js` | **24 (LTS)** | 🟡 Linha (patch a fechar) | `/nodejs/node` |
| `pnpm` | **12.x (linha estável corrente)** | 🟡 Linha (patch a fechar) | `/pnpm/pnpm` |
| `typescript` | **6.0.3** | ✅ Fixada | `/microsoft/typescript; /typescript-eslint/typescript-eslint` |
| `next` | **16.4.0 ou superior da linha 16** | 🟡 Linha (patch a fechar) | `/vercel/next.js` |
| `eslint-config-next` | **mesma versão do `next`** | 🟡 Linha (patch a fechar) | `/vercel/next.js` |
| `react / react-dom` | **19.x** | 🟡 Linha (patch a fechar) | `/websites/react_dev; /vercel/next.js` |
| `@types/react / @types/react-dom` | **19.x (versões atuais)** | 🟡 Linha (patch a fechar) | `/vercel/next.js` |
| `tailwindcss` | **4.3.3** | ✅ Fixada | `/tailwindlabs/tailwindcss.com` |
| `@tailwindcss/postcss` | **4.3.x (alinhar ao tailwindcss)** | 🟡 Linha (patch a fechar) | `/websites/tailwindcss` |
| `postcss` | **a fechar na US-001** | 🟡 Linha (patch a fechar) | `/websites/tailwindcss` |
| `shadcn (CLI)` | **4.21.4** | ✅ Fixada | `/shadcn-ui/ui` |
| `@base-ui/react, class-variance-authority, lucide-react, tw-animate-css, sonner` | **definidas pela CLI shadcn 4.21.0** | 🟡 Linha (patch a fechar) | `/shadcn-ui/ui` |
| `actions/checkout (GitHub Action)` | **v7.0.1 — SHA 3d3c42e5aac5ba805825da76410c181273ba90b1** | ✅ Fixada | `/pnpm/pnpm` |
| `pnpm/setup (GitHub Action)` | **v3.1.1 — SHA a0881977cd8ea73b1ed212236c99ca10dcc80cf4** | ✅ Fixada | `/pnpm/pnpm` |
| `eslint` | **10.12.0** | ✅ Fixada | `/eslint/eslint; /typescript-eslint/typescript-eslint` |
| `typescript-eslint` | **8.71.2** | ✅ Fixada | `/typescript-eslint/typescript-eslint` |
| `prettier` | **3.9.10** | ✅ Fixada | `/prettier/prettier` |
| `vitest` | **5.0.3** | ✅ Fixada | `/vitest-dev/vitest` |
| `vite` | **^6.4 || ^7 || ^8 (peer do Vitest)** | 🟡 Linha (patch a fechar) | `/vitest-dev/vitest` |
| `@testing-library/react, jest-dom, user-event, jsdom` | **a fechar na US-001** | 🟡 Linha (patch a fechar) | `/testing-library/react-testing-library` |
| `@playwright/test` | **1.63.0** | ✅ Fixada | `/microsoft/playwright` |
| `@commitlint/cli, @commitlint/config-conventional` | **21.2.3 (alinhar o config à mesma versão)** | ✅ Fixada | `/conventional-changelog/commitlint` |
| `husky` | **9.1.7** | ✅ Fixada | `/typicode/husky` |

- [x] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. **Somente versões estáveis:** nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly` ou versões com sufixo `-x.y` (o hook bloqueia).

_Patches fechados na implementação: ver "Versões fechadas na implementação" em [stack-versions.md](../../architecture/stack-versions.md)._

---

### US-002 — Internacionalização preparada (pt-BR)
**Como** desenvolvedor, **quero** a infraestrutura de i18n funcionando com pt-BR, **para** que nenhum texto seja escrito direto em componentes.
**Cobre:** exigência 5 · **Tamanho:** M · **Depende de:** US-001

**Critérios de aceite**
- [x] next-intl configurado com `pt-BR` como único locale e padrão; rotas em `app/[locale]`, URLs sem prefixo.
- [x] Página inicial e layout raiz usam apenas chaves de `messages/pt-BR.json` (incluindo `<html lang="pt-BR">` e metadados).
- [x] Datas, números e porcentagens exibidos por formatadores do next-intl (exemplo na página inicial).
- [x] Verificação automática no CI falha ao encontrar literal de interface em `src/` fora do catálogo.
- [x] Teste/script que garante que todos os locales registrados têm as mesmas chaves (passa com um só locale; falha ao adicionar um incompleto).
- [x] Documentado em README como adicionar um novo idioma.

**Notas técnicas:** ADR-0006.
**Fora desta história:** seletor de idioma na UI; segundo idioma.

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `next-intl` | **4.14.7** | ✅ Fixada | `/amannn/next-intl` |

- [x] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. **Somente versões estáveis:** nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly` ou versões com sufixo `-x.y` (o hook bloqueia).

---

### US-003 — Banco de dados e deploy na Vercel
**Como** desenvolvedor, **quero** o banco Postgres, as migrações e o deploy contínuo na Vercel funcionando, **para** validar o ambiente real desde o começo.
**Cobre:** exigência 1 · **Tamanho:** G · **Depende de:** US-002

**Critérios de aceite**
- [x] Projeto Vercel conectado ao repositório: Preview Deployment por PR e produção a partir de `main`.
- [x] Postgres (Neon) provisionado pela integração da Vercel; estratégia de banco para preview definida e documentada. *(Depois da aprovação, a integração foi desconectada do projeto porque sua ação de deploy contrariava o ADR-0014; o banco e as variáveis manuais continuam.)*
- [x] Drizzle configurado com a primeira migração (tabela técnica mínima) aplicada de forma automatizada no deploy.
- [x] Postgres local reproduzível (ex.: Docker Compose) para desenvolvimento e testes de integração; CI com Postgres de serviço.
- [x] Página de saúde simples confirma conexão com o banco no ambiente publicado (sem expor dados).
- [x] Variáveis de ambiente documentadas; nenhum segredo no repositório.
- [x] **Zero Trust:** papéis de banco separados (`app` sem DDL; `migrator` só no deploy), credenciais distintas por ambiente; Preview Deployments com *Deployment Protection* da Vercel; Preview sem segredos de produção.

**Pré-requisitos do responsável (D-04):** conta Vercel com o repositório GitHub conectado e integração Neon (Marketplace). O agente guia o passo a passo; o responsável cria as contas e cadastra as variáveis na Vercel.

**Notas técnicas:** ADR-0001, 0003, 0004, 0010.
**Fora desta história:** modelos de domínio.

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `drizzle-orm / drizzle-kit` | **0.45.4 / 0.31.11 (estáveis)** | ✅ Fixada | `/drizzle-team/drizzle-orm-docs; /drizzle-team/drizzle-orm` |
| `pg` / `@types/pg` | **8.23.1 / 8.23.1** | ✅ Fixada (substitui `@neondatabase/serverless`, ADR-0014) | `/brianc/node-postgres` |
| `@vercel/functions` | **3.10.1** | ✅ Fixada | `/websites/vercel` |

- [x] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. **Somente versões estáveis:** nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly` ou versões com sufixo `-x.y` (o hook bloqueia).

---

### US-029 — Endurecimento do banco, das migrações e do gate do Context7
**Como** desenvolvedor, **quero** fechar os pontos abertos pelas revisões de segurança e de migração da US-003, **para** que a base de dados, o deploy e as salvaguardas do agente sigam o Zero Trust antes de existir qualquer dado de usuário.
**Cobre:** ADR-0011, ADR-0013, ADR-0014 · **Tamanho:** G · **Depende de:** US-003 · **Bloqueios:** —

> O ID é um identificador, não a ordem: esta história entra no marco M1, logo após a US-003 e antes da US-004. Origem: pontos de atenção da aprovação da US-003 em [progress.md](../progress.md).

**Critérios de aceite**

*Papéis de banco (`src/db/bootstrap/roles.sql`)*
- [x] Papéis `app` e `migrator` pré-existentes são verificados: o script garante `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` (altera quando o dono pode, aborta quando não pode) e **aborta** se algum dos dois for membro de qualquer papel (`pg_auth_members.member`).
- [x] `tests/integration/db-roles.test.ts` verifica `rolsuper`, `rolcreaterole`, `rolcreatedb`, `rolreplication` e `rolbypassrls` falsos e nenhuma linha em `pg_auth_members` com `app` ou `migrator` como membro.
- [x] O responsável reexecuta `scripts/setup-database.sh` (idempotente) nas branches `main` e `preview` do Neon e confirma que passou.

*Privilégios padrão (nova migração custom; `0000`/`0001` não são editadas)*
- [x] Migração `drizzle-kit generate --custom` (`0002`) revogando de `PUBLIC` o `EXECUTE` padrão nas funções do `migrator`: `ALTER DEFAULT PRIVILEGES FOR ROLE migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`. *Global, não `IN SCHEMA public`: o teste mostrou que privilégios padrão por schema só somam aos globais, então o `REVOKE … IN SCHEMA` proposto não tinha efeito.*
- [x] Teste de integração: função criada pelo `migrator` não é executável por `app`; `app` consegue inserir em tabela `serial`/`identity` criada pelo `migrator` (uso da sequência).

*Migrações concorrentes e ordem do journal*
- [x] Migrações do deploy rodam sob `pg_advisory_lock`, para que dois builds de preview na branch `preview` compartilhada não apliquem migrações ao mesmo tempo (`src/db/migrate.ts` com `migrate()` de `drizzle-orm/node-postgres/migrator`, chamado por `pnpm db:migrate` no `vercel.json`), com teste de integração da exclusão mútua.
- [x] Verificação no CI: os valores `when` de `src/db/migrations/meta/_journal.json` são estritamente crescentes e as entradas de `origin/main` são prefixo inalterado do journal da branch (pega rebase que reordena ou reescreve migrações).
- [x] `docs/architecture/database.md` e `.claude/rules/migrations.md` documentam: `SET lock_timeout` (e `statement_timeout`) em migrações que pegam lock, regra *somente aditiva* com expandir → migrar → contrair entre deploys (código antigo e novo convivem com o schema novo), e o que fazer quando o journal conflita após rebase (regerar a migração).

*Testes de integração*
- [x] `tests/integration/db-env.ts` recusa URL cujo host não seja `localhost`, `127.0.0.1` ou `::1` (o CI usa `localhost`), sem ecoar a URL, com teste (`tests/integration/db-env.test.ts`).

*Deploy e superfície pública (documentação)*
- [x] ADR-0014 registra a Git Fork Protection da Vercel (**confirmada pelo responsável** no painel em 2026-10-16) e o risco de credencial no build de preview (o build roda código da branch com `MIGRATOR_DATABASE_URL` de preview).
- [x] `/api/health` registrado como exceção explícita ao `requireUser()` em [zero-trust.md](../../security/zero-trust.md) (público, só `ok`/`error`, sem dados); rate limit planejado na US-028 (Vercel Firewall).

*Gate do Context7 (`.claude/hooks/require-context7.py`)*
- [x] Só conta como consulta uma chamada `mcp__*__query-docs` com `libraryId` no formato Context7 (`/org/projeto`, opcionalmente `/versão`) **e resultado sem erro**, cujo `libraryId` ou pergunta cubra o pacote; demais servidores `*__query-docs` não liberam nada. Testes novos em `.claude/hooks/tests`. Também corrigido: redirecionamentos como `2>&1` eram lidos como nome de pacote.
- [x] Exceção de `next-intl` em `.claude/context7-exceptions.json`: já tinha sido removida (lista `exceptions` vazia); nada a fazer.

*Opcional (incluído pelo responsável em 2026-10-16)*
- [x] `scripts/setup-database.sh` envia ao Postgres verificadores SCRAM-SHA-256 calculados localmente, não a senha em texto.
- [x] ~~Vercel CLI fixada como `devDependency` exata em vez de `pnpm dlx vercel@…`~~ **Não adotado:** `vercel@64.3.1` como `devDependency` trouxe 15 alertas *high* e 1 *critical* ao `pnpm audit --audit-level=high` (quebraria o CI). Mantido `pnpm dlx vercel@64.3.1`, versão exata e fora do lockfile da aplicação; registrado em database.md. Aceito pelo responsável.

**Notas técnicas:** ADR-0011, 0013, 0014. Nenhuma dependência nova. `migrate()` e `pg` já estavam na stack; Context7 consultado antes do primeiro uso. O `vercel.json` não mudou (`pnpm db:migrate` passou a executar `src/db/migrate.ts`).
**Fora desta história:** regras de firewall/rate limit em si (US-028); RLS (US-006); promover o ADR-0014 a *Aceito* (decisão do responsável, pode ocorrer junto).

---

### US-030 — Endurecimento restante do gate do Context7
**Como** desenvolvedor, **quero** que o hook `require-context7.py` só libere uma mudança de stack quando houver consulta real ao Context7 sobre aquele pacote, **para** que a garantia do ADR-0013 não possa ser satisfeita por acidente ou contornada por variações de comando.
**Cobre:** ADR-0011, ADR-0013 · **Tamanho:** M · **Depende de:** US-029 · **Bloqueios:** —

> O ID é um identificador, não a ordem: proposta para o marco M1, logo após a US-029 e antes da US-004. Origem: pontos de média/baixa severidade da revisão de segurança da US-029, deixados fora do escopo aprovado. Só mexe em ferramentas do agente (`.claude/`) e na documentação; nenhuma mudança na aplicação, no banco ou na stack.

**Critérios de aceite**

*Cobertura pelo `libraryId`, não pelo texto livre*
- [x] Um pacote só conta como consultado quando o **`libraryId`** da chamada `query-docs` corresponde a ele: pelo próprio caminho (`/org/projeto`) ou por um mapa explícito pacote → IDs Context7 conhecidos (evolução do `ALIASES`). O texto livre de `query` deixa de cobrir pacotes: uma única consulta citando vários nomes na pergunta não libera nenhum deles.
- [x] Pacote sem ID mapeado e cujo nome não aparece no caminho do `libraryId` continua bloqueado, com mensagem dizendo qual ID foi consultado e como registrar o mapeamento.

*Consulta "bem-sucedida" de verdade*
- [x] Um `query-docs` só conta se houver, **na mesma sessão e antes dele**, um `resolve-library-id` bem-sucedido que tenha retornado aquele `libraryId` (ou, se o mapa do item anterior já fixa o ID, o resultado do `query-docs` não for uma resposta de "não encontrado").
- [x] Resultados com texto de biblioteca/documentação não encontrada (ex.: "No library found", "not found", resultado vazio) não cobrem nada, mesmo sem `is_error`. Os padrões ficam numa lista no hook, com teste.

*Somente o servidor Context7*
- [x] Só contam ferramentas `mcp__Context7__query-docs`/`resolve-library-id` e as de conectores com ID listado explicitamente (ex.: `mcp__<uuid>__…` do Claude Desktop) numa lista de servidores permitidos versionada em `.claude/` (alteração da lista só com aprovação do responsável, como as demais exceções). Qualquer outro `mcp__*__query-docs` é ignorado, mesmo com `libraryId` bem formado.

*Parser de Bash*
- [x] Detecta instalação com flags globais antes do subcomando: `pnpm -w add zod`, `pnpm -C . add zod`, `pnpm --filter web add zod`, `npm --prefix . install zod` e equivalentes de `yarn`/`bun`.
- [x] Detecta o gerenciador por caminho absoluto ou relativo (`/usr/bin/pnpm`, `./node_modules/.bin/pnpm`), via `corepack pnpm …`, `npx pnpm …`/`pnpm dlx pnpm …`, e dentro de `bash -c '…'`/`sh -c "…"`, subshells `( … )`, blocos `{ …; }`, `$( … )` e após `env VAR=… `, `sudo`, `time`, `nice`.
- [x] Edição de `package.json` ou de arquivo de configuração da stack (`CONFIG_FILES`) feita por Bash é tratada como edição: `sed -i`/`perl -i`, redirecionamento (`>`, `>>`, `tee`) para o arquivo, `cp`/`mv`/`ln` sobre ele, `git checkout|restore -- package.json`, `git apply`/`patch`. Na dúvida (comando que cita o arquivo e não é só leitura), bloquear com mensagem pedindo a consulta ou o uso de `Edit`.
- [x] Comandos só de leitura que citam esses arquivos (`cat`, `grep`, `jq`, `git diff`, `git log`) continuam liberados.

*Testes e documentação*
- [x] Um caso em `.claude/hooks/tests/test_require_context7.py` para cada item acima (bloqueio e liberação), e toda a suíte de `.claude/hooks/tests/` passando.
- [x] [stack-docs-policy.md](../../architecture/stack-docs-policy.md) atualizado: o que conta como consulta (servidor, `resolve` + `query`, `libraryId`), onde fica o mapa pacote → ID e a lista de servidores, e o que o parser cobre e o que **não** cobre (limite assumido de uma análise estática).

**Implementação:** a lista `trustedServers` nasce com o conector do Context7 desta instalação do Claude Desktop (`ccffa570-…`), incluído dentro do escopo autorizado; ids novos dependem do responsável. Pacotes cujo id do Context7 não tem o nome do pacote como projeto ficam em `LIBRARY_IDS` no hook (ids de [stack-versions.md](../../architecture/stack-versions.md)). Por conservadorismo, comandos desconhecidos que citam `package.json` (ex.: `python3 -m json.tool package.json`) são bloqueados. A revisão de segurança da história apontou desvios dentro do escopo, já corrigidos: palavras reservadas do shell, script enviado ao `sh` pela entrada padrão, continuação de linha, falha fechada em erro interno, `npm pkg set`, `Edit` que troca só a versão no `package.json`, apelidos do npm e flags globais desconhecidas, comandos de leitura com flag de escrita e bloqueios indevidos de `git restore --staged`/`git reset`. Os pontos fora do escopo estão em [progress.md](../progress.md).
**Notas técnicas:** ADR-0011 (verificar explicitamente, menor privilégio) e ADR-0013. Nenhuma dependência nova (Python da biblioteca padrão). O hook continua *fail-closed* para mudança de stack e *fail-open* para comandos que não a tocam. Nenhum ADR novo previsto; se a regra de "consulta" mudar o que o ADR-0013 diz, atualizar o ADR na própria história.
**Fora desta história:** garantir o conteúdo da consulta (se a pergunta foi pertinente); bloquear scripts arbitrários que editem arquivos por linguagem própria (`node -e`, `python -c`), registrado como limite conhecido na política; verificação no CI (o hook é proteção do agente, não do repositório).

---

### US-031 — Proteção do próprio gate do Context7 e da configuração do gerenciador de pacotes
**Como** responsável pelo projeto, **quero** que o agente não consiga afrouxar o gate do Context7 nem os controles da cadeia de suprimentos sem a minha ação, **para** que as garantias do ADR-0011 e do ADR-0013 não dependam só da disciplina do agente.
**Cobre:** ADR-0011, ADR-0013, ADR-0015 · **Tamanho:** M · **Depende de:** US-030 · **Bloqueios:** —

> O ID é um identificador, não a ordem: proposta para o marco M1, antes da US-004. Origem: pontos abertos da revisão de segurança da US-030, registrados em [progress.md](../progress.md). Só mexe em ferramentas do agente (`.claude/`) e na documentação.

**Decisão (resolvida em 2026-10-16: opção C, escolhida pelo responsável, que autorizou também a alteração do `.claude/settings.json` pelo agente nesta história)**

Como o gate passa a proteger os próprios arquivos (`.claude/context7-exceptions.json`, `.claude/hooks/**`, `.claude/settings.json`, `.claude/rules/stack-docs.md`) sem impedir o responsável de mantê-los:
- **Opção A — regras `deny` no `.claude/settings.json`** (`Edit`/`Write` nesses caminhos). Mais simples, mas não cobre escrita por Bash. O responsável edita fora do agente ou desliga a regra temporariamente.
- **Opção B — bloqueio no próprio hook** (`Edit`/`Write`/`MultiEdit` e escrita por Bash, com o mesmo detector de escrita da US-030). A mensagem pede ao responsável que faça a mudança. Uma história que precise alterar o hook (como esta) roda com o hook ativo da `main`, que só protege depois do merge.
- **Opção C — A + B** (recomendada): `deny` como primeira barreira e o hook para cobrir o Bash.
- Em qualquer opção, o agente pode **propor** a mudança (diff no PR ou texto para o responsável aplicar), mas não aplicá-la.

**Critérios de aceite**

*Arquivos do gate protegidos (conforme a decisão)*
- [x] `Edit`/`Write`/`MultiEdit` em `.claude/context7-exceptions.json`, `.claude/hooks/**`, `.claude/settings.json` e `.claude/rules/stack-docs.md` são bloqueados, com mensagem pedindo a ação do responsável.
- [x] Escrita por Bash nesses arquivos (redirecionamento, `tee`, `sed -i`, `cp`/`mv`/`ln`, `git checkout|restore`, `git apply`/`patch`) também é bloqueada (opções B/C). Leitura (`cat`, `grep`, `jq`, `git diff|log`) continua livre.
- [x] Escrita por Bash no transcript da sessão (`transcript_path`, `~/.claude/projects/**`) é bloqueada, fechando a forja de consulta registrada como limite na US-030.
- [x] A política documenta o procedimento do responsável para alterar esses arquivos.

*Configuração do gerenciador de pacotes*
- [x] `pnpm-workspace.yaml`, `.npmrc`, `.yarnrc`, `.yarnrc.yml` e `bunfig.toml` (raiz e subpastas) entram em `CONFIG_FILES`, editados por ferramenta ou por Bash.
- [x] Mudança nos controles de cadeia de suprimentos do `pnpm-workspace.yaml` (`allowBuilds`, `minimumReleaseAgeExclude`, `minimumReleaseAge`, `audit.ignore`, `overrides`, `catalog`/`catalogs`, `onlyBuiltDependencies`, `neverBuiltDependencies`) e qualquer `registry`/`@escopo:registry` no `.npmrc` exigem consulta ao Context7 do pnpm (`/pnpm/pnpm`), com cada pacote novo citado coberto como dependência.
- [x] `registry` diferente de `https://registry.npmjs.org/` em `.npmrc` é bloqueado sempre, com mensagem pedindo aprovação do responsável.

*Pré-releases e aliases*
- [x] Pré-release com faixa é detectada em comando e em `package.json`: `zod@^4.0.0-beta.1`, `zod@~4.0.0-rc.1`, `>=4.0.0-alpha`, `4.0.0-beta.1 - 4.0.0`.
- [x] `--tag <pré-release>` (`npm install zod --tag beta`, `pnpm add zod --tag next`) é bloqueado como pré-release.
- [x] Alias `npm:` (`pnpm add zod@npm:outro@1.0.0`, `"zod": "npm:outro@1"` no `package.json`, `overrides` com `npm:`) exige a cobertura do pacote **real** (`outro`) e, por padrão, é bloqueado com mensagem pedindo aprovação do responsável (o nome declarado engana a revisão).

*Testes e documentação*
- [x] Casos novos em `.claude/hooks/tests/test_require_context7.py` para cada item (bloqueio e liberação), e toda a suíte de `.claude/hooks/tests/` passando.
- [x] [stack-docs-policy.md](../../architecture/stack-docs-policy.md) atualizado (arquivos protegidos, procedimento do responsável, configuração do gerenciador, pré-releases e aliases); os limites que deixarem de existir saem da lista.

**Implementação:** além dos critérios, a revisão de segurança levou a proteger `.mcp.json` e `~/.claude.json` (registram servidores MCP), tratar especificações `github:`/git/URL como o alias `npm:`, verificar as chaves do pnpm dentro do `package.json`, bloquear `dangerouslyAllowAllBuilds: true` e falhar fechado após 20 s de análise. Ficam como proposta ao responsável (arquivo protegido): `python3 -I` e `onFailure: "block"` no hook em `.claude/settings.json`.
**Notas técnicas:** ADR-0011 e ADR-0013. Nenhuma dependência nova (Python da biblioteca padrão). Leitura de YAML sem biblioteca: o hook compara as chaves de nível superior por texto, de forma conservadora (na dúvida, exige a consulta). Se a decisão escolher a opção A ou C, a mudança no `.claude/settings.json` é feita pelo responsável, ou pelo agente com aprovação explícita registrada na história.
**Fora desta história:** verificação equivalente no CI (o hook protege o agente, não o repositório); conteúdo de scripts executados (`bash script.sh`, `node -e`); globs e expansões do shell.

---

### US-032 — Falsos positivos do gate do Context7 em comandos de leitura
**Como** responsável pelo projeto, **quero** que o gate do Context7 só bloqueie comandos que realmente escrevem nos próprios arquivos, **para** que leituras e execuções de teste do hook não travem o agente nem estimulem contornos.
**Cobre:** ADR-0013, ADR-0015 · **Tamanho:** P · **Depende de:** US-031 · **Bloqueios:** —

> Origem: falsos positivos observados em 2026-10-17, depois da US-031. Com o hook em `python3 -I` e `onFailure: "block"` (proposta do ADR-0015), a detecção precisa ser precisa. Só mexe em ferramentas do agente (`.claude/`) e na documentação.

**Causas encontradas**
- A divisão do comando em segmentos ignora aspas: `(`, `)`, `{`, `}`, `|` e `;` **dentro** de strings (`grep -E "^(import|from) " hooks/*.py`) criam segmentos falsos, e um "comando desconhecido" que cita arquivo protegido é tratado como escrita.
- A isenção "`python3 <script>` executa o script, não o escreve" só vale quando o script é o primeiro argumento; `python3 -I <script>` (e outras flags do interpretador) cai no bloqueio.

**Critérios de aceite**
- [x] Separadores de comando (`&&`, `||`, `;`, `|`, `&`, quebra de linha, `(`, `)`, `{`, `}`) dentro de aspas simples ou duplas não dividem o comando; `$(…)` e crases dentro de aspas duplas continuam sendo analisados como comandos. *Desvio: vale só para comandos "simples" (sem `$`, crase, `\`, `#` ou `<<`, aspas balanceadas). Três revisões de segurança acharam divergências com o bash quando o scanner modelava expansões (`case`/comentários em `"$(…)"`, aspas em `"${…}"`, heredocs não reconhecidos); nos demais comandos vale a análise anterior, acrescida do texto com comentários e de redirecionamentos que terminam no separador. Fuzz diferencial contra `origin/main` (90 mil comandos) sem regressão.*
- [x] Liberados: `grep -E "^(import|from) " .claude/hooks/*.py`, `cd .claude && grep -h -E "^(import|from) " hooks/*.py | sort -u`, `echo '{"a":1}' | python3 -I .claude/hooks/require-context7.py`, `python3 -I -B .claude/hooks/tests/test_require_context7.py` e `python3 -W ignore .claude/hooks/tests/…`.
- [x] Continuam bloqueados (sem regressão): escrita por redirecionamento, `tee`, `sed -i`, `cp`/`mv`/`ln`, `git checkout|restore`, `git apply`/`patch` nos arquivos do gate, `echo "$(cp x .claude/settings.json)"`, ``echo "`rm .claude/hooks/x`"``, `python3 -I -c "open('.claude/settings.json','w')"` e código de interpretador por heredoc ou pipe que cite arquivo do gate.
- [x] Código de interpretador que só **cite** um arquivo do gate (ex.: heredoc em Python que edita outro arquivo e menciona `.claude/settings.json` no texto) continua bloqueado por decisão de segurança, porque o hook não segue variáveis; a política indica a alternativa (`Edit`/`Write` no arquivo de destino).
- [x] Casos novos (liberação e bloqueio) em `.claude/hooks/tests/test_require_context7.py`, com toda a suíte de `.claude/hooks/tests/` passando.
- [x] [stack-docs-policy.md](../../architecture/stack-docs-policy.md) atualizado nos limites conhecidos.

**Procedimento (ADR-0015):** os arquivos do gate são protegidos contra o agente. O agente prepara e testa a mudança numa cópia fora de `.claude/` e entrega um patch; o responsável aplica (`git apply`) no próprio terminal; o agente então roda a suíte e faz os commits.
**Notas técnicas:** Python da biblioteca padrão; nenhuma dependência nova.
**Fora desta história:** seguir variáveis e fluxo de dados em código de interpretador; globs e expansões do shell; verificação no CI.
