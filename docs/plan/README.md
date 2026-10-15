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
- Se houver dados do usuário: casos de isolamento entre usuários adicionados à suíte (ADR-0008).
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

O PRD marca como `[PENDENTE]` os objetivos e as métricas de sucesso. Isso **não bloqueia o MVP técnico**, mas significa que não há critério objetivo para declarar o MVP bem-sucedido. Ver D-01 em [open-decisions.md](open-decisions.md).
