# ADR-0009 — Modelo em árvore e progresso ponderado

- **Status:** Proposto — decisões D-02 (páginas) e D-03 (só concluídas contam) resolvidas em 2026-10-15; ver [open-decisions.md](../plan/open-decisions.md)
- **Data:** 2026-10-15

## Contexto

O livro é uma hierarquia **parte → capítulo → tópico (opcional)**. Cada nó tem título, resumo, meta estimada (páginas, minutos ou peso), estado (não iniciado / em andamento / concluído) e datas. Regras do PRD:

- Um nó com subnós passa a “concluído” quando **todos** os subnós estão concluídos (RF-003).
- O progresso geral é **ponderado**: concluir uma parte que representa 40% do livro avança o progresso em 40% (§6.2, RF-008).

## Decisão

**Armazenamento:** tabela única `book_node` com lista de adjacência (`parent_id`), `kind` (`part | chapter | topic`), `position` (ordem entre irmãos), `owner_id`, `book_id`. Profundidade máxima pequena e fixa (3 níveis), o que dispensa closure table/ltree. Árvore montada em memória por livro (livros têm centenas de nós, no máximo).

**Domínio puro** (`src/domain/progress`), sem I/O:

- `resolveStatus(node)`: o estado de um nó pai é derivado dos filhos (todos concluídos ⇒ concluído; algum iniciado/concluído ⇒ em andamento; senão não iniciado). O estado de **folhas** é armazenado; o de **pais é derivado**, nunca gravado — elimina inconsistência.
- `computeProgress(tree)`: progresso de uma folha é **1 se concluída e 0 caso contrário** (D-03: só concluídas contam; “em andamento” não soma); o de um pai é a média dos filhos **ponderada pelo peso**; o do livro é o do nó raiz. Pesos de irmãos são normalizados entre si, então só a proporção importa.
- **Peso efetivo:** vem da meta estimada do nó. A unidade da meta é **sempre páginas** (D-02), para todos os livros, o que torna os pesos comparáveis sem configuração por livro. Nó sem meta recebe peso igual ao dos irmãos sem meta (fallback documentado e testado).
- Funções puras cobertas por testes unitários com tabelas de casos, incluindo o exemplo do PRD (parte de 40% ⇒ +40%).

**Datas:** `started_at` é registrada na primeira transição para “em andamento”; `completed_at` na transição para “concluído”; voltar atrás limpa a data correspondente.

**Ordenação:** `position` inteiro com reindexação dos irmãos em transação ao reordenar/mover.

## Alternativas consideradas

- **Closure table / ltree / CTE recursiva:** necessárias para árvores profundas; excessivas para 3 níveis.
- **Gravar progresso agregado nos pais:** rápido de ler, mas gera inconsistência; calcular sob demanda é suficiente para o volume.
- **JSON único com a árvore inteira:** simples, mas impede consultas (ex.: capítulos concluídos por semana — RF-013) e anotações ancoradas por `node_id`.

## Consequências

- O cálculo roda no servidor a cada visualização (barato nesse volume).
- D-02 estreita o RF-002 do PRD no MVP (só páginas); minutos e peso abstrato ficam como evolução.
