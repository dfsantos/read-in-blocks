# Git e Conventional Commits

Decisão registrada em [ADR-0012](../adr/0012-conventional-commits.md). Vale para humanos e agentes; o agente é instruído no [`CLAUDE.md`](../../CLAUDE.md) da raiz.

## Formato

```
<type>(<scope>): <subject>

<body>

<footer>
```

- Cabeçalho com no máximo 72 caracteres, em inglês, imperativo, minúsculas, sem ponto final.
- Corpo opcional: explica **o quê e por quê** (não o como), com linhas de até 100 caracteres.
- Rodapé opcional: `Refs: US-013`, `BREAKING CHANGE: …`, e os trailers de atribuição da plataforma.

## Types

| Type | Uso |
|---|---|
| `feat` | Nova funcionalidade visível ao leitor |
| `fix` | Correção de defeito |
| `docs` | Somente documentação |
| `style` | Formatação sem mudança de comportamento |
| `refactor` | Mudança de código sem alterar comportamento |
| `perf` | Melhoria de desempenho |
| `test` | Adição/ajuste de testes |
| `build` | Build, dependências, scripts de pacote |
| `ci` | Pipelines (GitHub Actions) e configuração de deploy |
| `chore` | Manutenção que não se encaixa acima |
| `revert` | Reversão de commit anterior (citar o hash no corpo) |

## Scopes (obrigatórios)

| Scope | Área |
|---|---|
| `app` | Layout, rotas e configuração geral da aplicação |
| `ui` | Componentes shadcn e design system |
| `i18n` | Internacionalização e catálogos de mensagens |
| `auth` | Login, sessão, autorização |
| `security` | Cabeçalhos, CSP, endurecimento, auditorias |
| `db` | Schema, migrações, conexão |
| `library` | Livros e biblioteca |
| `structure` | Partes, capítulos e tópicos |
| `reading` | Estado de leitura |
| `progress` | Progresso ponderado, painéis, previsão |
| `notes` | Anotações e editor |
| `domain` | Regras puras em `src/domain` |
| `deps` | Dependências |
| `docs` | Documentação em `docs/` |
| `plan` | Quadro/plano de desenvolvimento |
| `release` | Publicação em produção |
| `agent` | Configuração do agente em `.claude/` (rules, skills, subagents) e `CLAUDE.md` |

Novos escopos exigem atualizar esta tabela, a lista `SCOPES` do hook `.claude/hooks/validate-commit-msg.py` e a configuração do `commitlint` no mesmo commit.

## Exemplos

```
feat(library): add book creation form

Refs: US-007
```

```
fix(progress): ignore nodes without goal when computing total weight

Nodes with no goal were counted as zero, inflating the progress of
siblings that had one.

Refs: US-016
```

```
feat(db)!: rename book_node.order to book_node.position

BREAKING CHANGE: migration 0007 renames the column; clients selecting
`order` must switch to `position`.
```

```
chore(deps): bump drizzle-orm
```

## Exemplos inválidos

| Mensagem | Problema |
|---|---|
| `update stuff` | Sem type/scope, vago |
| `feat: Add Login.` | Sem escopo, maiúscula, ponto final |
| `feat(library): adicionar formulário` | Idioma errado |
| `fix(auth): fixes and other things` | Mistura mudanças; vago |

## Enforcement

1. **Agente:** regra obrigatória no `CLAUDE.md`.
2. **Agente (mecânico):** hook `PreToolUse` em `.claude/hooks/validate-commit-msg.py` (registrado em `.claude/settings.json`) bloqueia `git commit` com mensagem fora do formato, escopo desconhecido ou `--no-verify`. Mantenha a lista `SCOPES` do script sincronizada com a tabela acima.
3. **Local:** hook `commit-msg` com `commitlint` (`@commitlint/config-conventional` + `scope-enum` desta tabela), instalado na US-001.
4. **CI:** job que valida todos os commits do PR e o título do PR (US-001).
5. Merge de PR por *squash* usa o título do PR, que também segue a convenção.

## Branches e PRs

- Uma branch por história: `story/US-013-leaf-reading-status`. Quando a plataforma designar uma branch específica ao agente, ela prevalece.
- Um PR por história, aberto somente quando o responsável pedir. Descrição lista os critérios de aceite atendidos e o checklist de segurança.
- Histórico sem reescrita em branches compartilhadas.

## Exceção: PRs do Dependabot

O Dependabot escreve o assunto com inicial maiúscula (`build(deps): Bump x from a to b`) e isso não é configurável. O `commitlint.config.mjs` ignora **somente** mensagens no formato `(build|ci)(deps): Bump <pacote> from <a> to <b>`; qualquer outra mensagem ou título de PR passa por todas as regras.
