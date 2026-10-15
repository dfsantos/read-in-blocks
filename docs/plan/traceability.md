# Rastreabilidade

Cada requisito do [PRD](../prd/prd-read-in-blocks.md) mapeado para as histórias que o entregam. Nenhum RF fica sem história.

## Requisitos funcionais

| RF | Nome | Classe | Histórias |
|---|---|---|---|
| RF-001 | Estrutura do livro | Essencial | US-007, US-009, US-010, US-012 |
| RF-002 | Descrição dos nós | Essencial | US-011 |
| RF-003 | Estado de leitura | Essencial | US-013, US-014 |
| RF-004 | Sumário interativo | Essencial | US-015 |
| RF-005 | Caderno por capítulo | Essencial | US-018 |
| RF-006 | Tipos de anotação | Essencial | US-020 |
| RF-007 | Formatação rica | Essencial | US-019 |
| RF-008 | Progresso ponderado | Essencial | US-016 |
| RF-009 | Biblioteca pessoal | Essencial | US-008 (lista), US-021 (retomada) |
| RF-010 | Conteúdo privado | Essencial | US-004, US-005, US-006, US-028 e casos de isolamento em cada história; auditoria na US-026 |
| RF-011 | Visão em blocos | Desejável | US-017 |
| RF-012 | Diagramas nas anotações | Desejável | US-022 |
| RF-013 | Ritmo e previsão | Desejável | US-023 |
| RF-014 | Densidade de anotações | Desejável | US-024 |

## Regras de negócio

| Regra | Onde é garantida |
|---|---|
| §6.1 Privacidade do conteúdo | ADR-0008; US-006 (arcabouço), testes de isolamento em cada história, US-026 (auditoria) |
| §6.2 Progresso ponderado | ADR-0009; US-011 (peso), US-016 (cálculo e painel) |
| RF-003: pai concluído ⇔ todos os filhos concluídos | US-014 |
| RF-008: parte de 40% avança o progresso em 40% | Teste unitário explícito na US-016 |
| RF-010: não há como ver/acessar conteúdo de outro leitor | US-006, US-026 |

## Diretrizes transversais

| Diretriz | Onde é garantida |
|---|---|
| Zero Trust ([ADR-0011](../adr/0011-zero-trust-security.md)) | Política em `docs/security/zero-trust.md`; checklist no Definition of Done de toda história; US-004 (allowlist), US-006 (RLS), US-028 (cabeçalhos), US-019/022 (conteúdo), US-026 (auditoria) |
| Conventional Commits ([ADR-0012](../adr/0012-conventional-commits.md)) | `CLAUDE.md` (agente), `commitlint` + CI (US-001) |
| Stack atualizada via Context7 ([ADR-0013](../adr/0013-context7-docs-first.md)) | `CLAUDE.md`, regra `stack-docs`, skill `stack-change`, hook `require-context7.py`; seção “Documentação consultada” no PR (US-001) |
| Código em inglês / UI em pt-BR | [conventions.md](../architecture/conventions.md); US-002 (verificação automática) |

## Escopo

| Item | Tratamento |
|---|---|
| Itens “Incluso (MVP)” do PRD §5 | Todos cobertos: cadastro manual (US-010), sumário e blocos (US-015, US-017), estado de leitura (US-013/014), anotações ricas (US-018/019), painel (US-016), acesso individual (E1) |
| Itens “Fora de Escopo” | Não planejados: importação automática, grafo avançado, exportação, gamificação/streaks, recursos sociais |
| Risco §9 (cadastro manual trabalhoso) | Mitigação no MVP: cadastro em lote por lista de títulos (US-010). Importação automática continua pós-MVP, conforme o PRD |

## Itens inferidos por este plano (não estão no PRD)

Marcados para você aceitar ou cortar:

- Reordenar/mover nós (US-012).
- Marcar “ação/dúvida” como resolvida (US-020).
- Edição manual das datas de leitura (US-013).
- Cadastro em lote de capítulos (US-010).
- Campo “autor” do livro (US-007, D-08).
- Exclusão de livro em cascata (US-009, D-09).
