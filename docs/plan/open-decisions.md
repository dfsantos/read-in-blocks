# Decisões em aberto

Itens que **dependem de você** ou que o PRD deixou sem resposta. Cada um indica qual história bloqueia e uma proposta padrão (usada se você apenas aprovar o plano sem comentar).

| ID | Decisão | Bloqueia | Proposta padrão | Status |
|---|---|---|---|---|
| D-01 | **Objetivos e métricas de sucesso** (PRD §4 estava `[PENDENTE]`). | — | — | **Resolvida (2026-10-15):** o responsável será o **primeiro usuário** e avaliará por conta própria se o MVP foi bem-sucedido. **Sem métricas formais nem analytics no MVP**; critério de sucesso = avaliação direta de uso |
| D-02 | **Unidade da meta (RF-002): páginas, minutos ou peso.** | US-007, US-011, US-016 | — | **Resolvida (2026-10-15):** **páginas**, unidade única para todos os livros (sem escolha por livro). Estreita o RF-002 do PRD no MVP; minutos e peso ficam para depois |
| D-03 | **Como “em andamento” entra no progresso ponderado (RF-008).** | US-016 | — | **Resolvida (2026-10-15):** **só concluídas contam** (0% ou 100% por folha); “em andamento” não soma ao progresso |
| D-04 | **Credenciais e contas externas (Google Cloud OAuth, Vercel, Neon, GitHub↔Vercel, domínio).** | US-003, US-004 | — | **Resolvida (2026-10-15):** proposta aceita — o agente guia o passo a passo; o responsável cria as credenciais e as cadastra nas variáveis da Vercel (pré-requisito das US-003/004) |
| D-05 | **Responsável/autor do PRD.** | — | — | **Resolvida (2026-10-15):** **Diego F. dos Santos**; cabeçalho do PRD atualizado |
| D-06 | **Livro sem partes: capítulos direto no livro.** | US-010 | — | **Resolvida (2026-10-15):** **partes são opcionais**; capítulos podem ficar direto no livro; tópicos só sob capítulos |
| D-07 | **Estado de nó pai (RF-003).** | US-014 | — | **Resolvida (2026-10-15):** pai é **derivado** dos filhos; marcar um pai como concluído **conclui todos os descendentes** (com confirmação) |
| D-08 | **Campos extras de livro.** | US-007 | — | **Resolvida (2026-10-15):** **título obrigatório**; autor opcional; sem capa nem total de páginas no MVP (proposta padrão aceita) |
| D-09 | **Exclusão de dados e conta.** | US-009 | — | **Resolvida (2026-10-15):** **excluir o livro apaga em cascata** estrutura e anotações (com confirmação); exclusão de conta fora do MVP |
| D-10 | **Quem pode entrar (Zero Trust).** | US-004 | — | **Resolvida (2026-10-15):** **allowlist de e-mails Google** (variável de ambiente) no MVP; abrir a outras contas exige nova decisão e revisão de segurança |
| D-11 | **Base do shadcn/ui:** Base UI (padrão atual da CLI 4.21.0) ou Radix (assumido no ADR-0002). | US-001 | — | **Resolvida (2026-10-15):** usar o **padrão do shadcn = Base UI** (`@base-ui/react`), sem `-b radix`. ADR-0002 ajustado |
| D-12 | **Drizzle:** 1.0 em release candidate (`@rc`) ou versão estável. | US-003 | — | **Resolvida (2026-10-15):** **estável** — drizzle-orm 0.44.7 + drizzle-kit 0.31.5; sem RC |
| D-13 | **pnpm:** 11.28.5 (exato) ou linha 12. | US-001 | — | **Resolvida (2026-10-15):** **pnpm 12** (linha estável corrente); patch gravado por `pnpm init` na US-001 |
| D-14 | **Adotar RLS do Postgres** como segunda barreira nas tabelas de conteúdo (ADR-0008, item 6), depois do spike da US-006. | Antes da US-026 (idealmente antes da US-007, para nascer com a primeira tabela de conteúdo) | **Adotar**, numa história própria: helper `withOwner(userId, fn)` (transação + `set_config('app.user_id', …, true)`) usado por todo repositório e políticas `owner_id = current_setting(...)` criadas por migração em `book`, `book_node` e `note`. Custo: uma transação por operação. Resultado do spike no [adendo do ADR-0008](../adr/0008-data-isolation-per-user.md) | Aberta |

### Regra permanente (2026-10-15)

**Sempre optar por versões estáveis.** Nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly`, `dev` nem versões com sufixo de pré-release. Exceção só com aprovação do responsável (`prereleaseApproved` em `.claude/context7-exceptions.json`). Registrada em ADR-0013 e na política de stack.

## Como fechar

Responda pelo ID (“D-02: ok”, “D-03: só concluídas contam”). Cada resposta será registrada aqui, com data, e refletida nos ADRs/histórias afetados. Decisões não fechadas ao chegar à história bloqueada serão apresentadas a você antes de eu começar.
