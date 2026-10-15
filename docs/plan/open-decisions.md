# Decisões em aberto

Itens que **dependem de você** ou que o PRD deixou sem resposta. Cada um indica qual história bloqueia e uma proposta padrão (usada se você apenas aprovar o plano sem comentar).

| ID | Decisão | Bloqueia | Proposta padrão | Status |
|---|---|---|---|---|
| D-01 | **Objetivos e métricas de sucesso** (PRD §4 está `[PENDENTE]`). | Nada técnico; afeta a definição de “MVP bem-sucedido” e eventual instrumentação | Seguir sem métricas; revisitar após M6. Sem analytics no MVP | Aberta |
| D-02 | **Unidade da meta (RF-002):** o PRD diz “páginas, minutos ou peso”. Misturar unidades entre nós de um mesmo livro torna o peso incomparável (ver ADR-0009). | US-011, US-016 | **Uma unidade por livro**, escolhida ao criar o livro (páginas, minutos ou peso abstrato), alterável com aviso | Aberta |
| D-03 | **Como “em andamento” entra no progresso ponderado (RF-008).** | US-016 | Folha em andamento vale **50%** do seu peso; não iniciada 0%; concluída 100%. Alternativa: só concluídas contam (0%/100%) | Aberta |
| D-04 | **Credenciais e contas externas:** projeto no Google Cloud (OAuth client), conta Vercel, integração Neon, repositório GitHub conectado à Vercel, domínio (opcional). | US-003, US-004 | Eu guio o passo a passo na US-003/US-004; você cria as credenciais e as cadastra nas variáveis da Vercel | Aberta |
| D-05 | **Responsável/autor do PRD** (PRD cabeçalho `[PENDENTE]`). | Nada técnico | Preencher o cabeçalho quando você definir | Aberta |
| D-06 | **Livro sem partes:** muitos livros têm só capítulos. O PRD fala em “partes, capítulos e, opcionalmente, tópicos”. | US-010 | **Partes são opcionais**: capítulos podem ficar direto no livro. Tópicos só sob capítulos | Aberta |
| D-07 | **Estado de um nó pai (RF-003):** o PRD define só “todos concluídos ⇒ concluído”. Assumido que pais são derivados dos filhos, sem marcação manual. | US-014 | Pai derivado dos filhos; marcar um pai como concluído conclui todos os descendentes (com confirmação) | Aberta |
| D-08 | **Campos extras de livro** (autor, capa, total de páginas): o PRD só exige “cadastrar um livro”. | US-007 | Título obrigatório; autor opcional; sem capa no MVP | Aberta |
| D-09 | **Exclusão de dados e conta:** não consta no PRD, mas há conteúdo protegido por direitos autorais. | US-009 | Excluir livro apaga em cascata estrutura e anotações (com confirmação). Exclusão de conta fica fora do MVP | Aberta |
| D-10 | **Quem pode entrar (Zero Trust, acesso negado por padrão):** hoje há um único usuário (PRD §8). | US-004 | **Allowlist de e-mails Google** em variável de ambiente; abrir cadastro a qualquer conta Google exige nova decisão e revisão de segurança | Aberta |
| D-11 | **Base do shadcn/ui:** Base UI (padrão atual da CLI 4.21.0) ou Radix (assumido no ADR-0002). | US-001 | — | **Resolvida (2026-10-15):** usar o **padrão do shadcn = Base UI** (`@base-ui/react`), sem `-b radix`. ADR-0002 ajustado |
| D-12 | **Drizzle:** 1.0 em release candidate (`@rc`) ou versão estável. | US-003 | — | **Resolvida (2026-10-15):** **estável** — drizzle-orm 0.44.7 + drizzle-kit 0.31.5; sem RC |
| D-13 | **pnpm:** 11.28.5 (exato) ou linha 12. | US-001 | — | **Resolvida (2026-10-15):** **pnpm 12** (linha estável corrente); patch gravado por `pnpm init` na US-001 |

### Regra permanente (2026-10-15)

**Sempre optar por versões estáveis.** Nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly`, `dev` nem versões com sufixo de pré-release. Exceção só com aprovação do responsável (`prereleaseApproved` em `.claude/context7-exceptions.json`). Registrada em ADR-0013 e na política de stack.

## Como fechar

Responda pelo ID (“D-02: ok”, “D-03: só concluídas contam”). Cada resposta será registrada aqui, com data, e refletida nos ADRs/histórias afetados. Decisões não fechadas ao chegar à história bloqueada serão apresentadas a você antes de eu começar.
