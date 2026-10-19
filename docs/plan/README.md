# Plano de desenvolvimento

Este plano divide o PRD em **histórias de usuário** pequenas, agrupadas em **épicos**, para que o trabalho avance aos poucos e cada passo seja validado por você antes do próximo.

## Como trabalhamos

### Ciclo de uma história

```
Pronta (DoR) ──▶ Em desenvolvimento ──▶ Em validação ──▶ Aprovada ──▶ (próxima)
                         ▲                    │
                         └── ajustes pedidos ─┘
```

1. **Você escolhe** a próxima história (ou aceito a sugerida pela ordem do [roadmap](roadmap.md)). Só uma história fica em desenvolvimento por vez.
2. **Eu implemento** em uma branch própria (`story/US-XXX-…`), com testes, abrindo um PR somente quando você pedir.
3. **Você valida** pelos critérios de aceite da história (e pelo Preview Deployment da Vercel, quando houver tela).
4. **Você aprova** (ou pede ajustes). Só então a história vira *Aprovada*, o [acompanhamento](progress.md) é atualizado e passamos à seguinte.

Nada além da história corrente é implementado. Se algo fora do escopo for descoberto, vira uma nova história ou uma entrada em [open-decisions.md](open-decisions.md), e não é feito “de carona”.

### Definition of Ready (pode começar)

- Critérios de aceite escritos e sem pendência de decisão que a bloqueie (ver `Bloqueios` da história).
- Dependências anteriores *Aprovadas*.
- Impacto em i18n, dados, privacidade e segurança (superfície de ataque nova) identificado.

### Definition of Done (pode ser aprovada)

- Todos os critérios de aceite atendidos e demonstráveis.
- Testes automatizados da história escritos e passando (unitário/integração; E2E quando listado).
- Lint, typecheck e build passando no CI.
- Todo texto de interface em `messages/pt-BR.json`; código, commits e comentários em inglês.
- Se houver dados do usuário: casos de isolamento entre usuários adicionados à suíte (ADR-0008) e o checklist de revisão "toda consulta tem escopo de dono" de [data-access.md](../architecture/data-access.md#checklist-de-revisão-de-pr) conferido.
- **Mudanças de stack documentadas:** toda dependência/config criada ou atualizada foi precedida de consulta ao Context7, com a tabela “Documentação consultada” (biblioteca, ID Context7, versão) no PR ([política](../architecture/stack-docs-policy.md)).
- **Checklist de segurança Zero Trust** da [política](../security/zero-trust.md) preenchido no PR.
- **Todos os commits em Conventional Commits** ([git-workflow.md](../architecture/git-workflow.md)); `commitlint` passando.
- Se houver mudança de schema: migração versionada incluída.
- Documentação afetada atualizada (este plano, ADRs, `.env.example`).
- Quadro [progress.md](progress.md) atualizado.

### Tamanho das histórias

| Tamanho | Significado |
|---|---|
| **P** | Algumas horas; um fluxo simples |
| **M** | Cerca de um dia; um fluxo completo com testes |
| **G** | Mais de um dia; considerar quebrar se surgirem incertezas |

## Como retomar em uma nova sessão

1. Abrir a sessão neste repositório (o agente lê o `CLAUDE.md` automaticamente) com o servidor MCP **Context7** conectado e `python3` disponível (os hooks em `.claude/hooks/` dependem dele).
2. Conferir [progress.md](progress.md): nenhuma história em andamento; US-000 aprovada.
3. Rodar `/start-story US-001`. A skill valida o Definition of Ready, apresenta o plano e só então implementa.
4. Ao terminar, `/finish-story US-001` leva a história a "Em validação"; só você marca "Aprovada".
5. Pré-requisitos do responsável que aparecem adiante: contas Vercel/Neon e repositório conectado (US-003), cliente OAuth do Google e lista de e-mails autorizados (US-004).

## Estrutura do plano

| Documento | Para quê |
|---|---|
| [roadmap.md](roadmap.md) | Marcos (milestones) e ordem de entrega |
| [progress.md](progress.md) | Quadro de status de todas as histórias |
| [epics/](epics/) | Histórias detalhadas, um arquivo por épico |
| [traceability.md](traceability.md) | Cada RF e regra de negócio do PRD → história que o entrega |
| [open-decisions.md](open-decisions.md) | Decisões que dependem de você |

## Formato de uma história

```md
### US-XXX — Título
**Como** <persona>, **quero** <ação>, **para** <benefício>.
**Cobre:** RF-… · **Tamanho:** P/M/G · **Depende de:** US-… · **Bloqueios:** D-…

**Critérios de aceite**
- [ ] …

**Notas técnicas** (decisões já tomadas / ADRs aplicáveis)

**Fora desta história**
```

As histórias de infraestrutura (épico E0) usam o papel de **Desenvolvedor**, pois não entregam valor direto ao leitor, mas são pré-requisito para tudo. O PRD tem uma única persona de produto: o **Leitor**.

## O que o PRD não define

O PRD deixa os objetivos e as métricas de sucesso sem definição (D-01). Decisão de 2026-10-15: o responsável é o primeiro usuário e **avalia pessoalmente** se o MVP foi bem-sucedido; não há métricas formais nem analytics no MVP. Isso não bloqueia o desenvolvimento.
