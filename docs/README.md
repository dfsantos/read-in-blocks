# Documentação — Read in Blocks

## Mapa

```
docs/
├── prd/
│   └── prd-read-in-blocks.md      # PRD (fonte de verdade do produto)
├── architecture/
│   ├── tech-stack.md              # Stack e arquitetura
│   ├── conventions.md             # Convenções de código, i18n e dados
│   ├── git-workflow.md            # Conventional Commits, branches e PRs
│   ├── stack-docs-policy.md       # Mudanças de stack sempre a partir do Context7
│   └── database.md                # Banco, papéis, migrações, Neon e Vercel
├── security/
│   └── zero-trust.md              # Política Zero Trust e checklist por história
├── adr/                           # Architecture Decision Records
│   ├── README.md
│   └── 0001 … 0014
└── plan/
    ├── README.md                  # Processo, Definition of Ready/Done, fluxo de aprovação
    ├── progress.md                # Quadro de acompanhamento (atualizado a cada história)
    ├── roadmap.md                 # Milestones e ordem de entrega
    ├── open-decisions.md          # Pendências de produto/técnicas
    ├── traceability.md            # RF/regra de negócio → história
    └── epics/
        ├── E0-foundation.md
        ├── E1-authentication-and-privacy.md
        ├── E2-library-and-book-structure.md
        ├── E3-reading-state.md
        ├── E4-progress-visualization.md
        ├── E5-notes.md
        ├── E6-desirable-features.md
        └── E7-release.md
```

> Configuração do agente em [`.claude/`](../.claude) (rules, skills, subagents).
>
> Na raiz do repositório, [`CLAUDE.md`](../CLAUDE.md) contém as regras permanentes lidas pelo agente (Conventional Commits, Zero Trust, idioma, processo).

## Por onde começar a validação

1. [`plan/README.md`](plan/README.md) — como vamos trabalhar.
2. [`architecture/tech-stack.md`](architecture/tech-stack.md) — a stack proposta.
3. [`plan/roadmap.md`](plan/roadmap.md) — a ordem das entregas.
4. [`plan/open-decisions.md`](plan/open-decisions.md) — o que preciso que você decida.

## Idioma

- **Documentação de planejamento** (PRD, plano, ADRs): português.
- **Código, commits, nomes de branches, identificadores e comentários**: inglês.
- **Interface da aplicação**: português do Brasil (`pt-BR`), com infraestrutura de i18n pronta para novos idiomas (ver [ADR-0006](adr/0006-internationalization-next-intl.md)).
