# E2 — Biblioteca e estrutura do livro

Cobre RF-001, RF-002 e a primeira parte de RF-009. Persona: **Leitor**.

---

### US-007 — Cadastrar um livro
**Como** leitor, **quero** cadastrar um livro, **para** começar a acompanhar sua leitura.
**Cobre:** RF-001 (livro) · **Tamanho:** M · **Depende de:** US-006, US-033

**Critérios de aceite**
- [x] Formulário (shadcn + RHF + Zod) com **título obrigatório** e autor opcional (D-08). Sem campo de capa. A unidade das metas é sempre **páginas** (D-02), então não há seletor de unidade.
- [x] Validação com mensagens em pt-BR via i18n.
- [x] Livro salvo vinculado ao usuário logado; após salvar, abre a página do livro.
- [x] Migração do schema `book` incluída, com RLS e política de dono (convenção da US-033); o repositório roda por `withOwner`.
- [x] Testes de isolamento: outro usuário não vê nem acessa o livro por URL (404).

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `zod` | **4.6.5** | ✅ Fixada | `/colinhacks/zod` |
| `react-hook-form` | **7.66.0** | ✅ Fixada | `/react-hook-form/react-hook-form` |
| `@hookform/resolvers` | **5.9.1** | ✅ Fixada (2026-10-19; a 5.3.0 do Context7 não existe no npm, escolha do responsável) | `/react-hook-form/resolvers` |

- [x] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. **Somente versões estáveis:** nada de `rc`, `beta`, `alpha`, `canary`, `next`, `nightly` ou versões com sufixo `-x.y` (o hook bloqueia).

---

### US-008 — Biblioteca pessoal
**Como** leitor, **quero** ver a lista dos meus livros, **para** escolher qual abrir.
**Cobre:** RF-009 (listagem) · **Tamanho:** P · **Depende de:** US-007

**Critérios de aceite**
- [x] Página inicial autenticada lista os livros do usuário, ordenados pelo mais recente.
- [x] Estado vazio com chamada para cadastrar o primeiro livro.
- [x] Cada item abre a página do livro.
- [x] Lista exibe apenas livros do próprio usuário (teste de isolamento).

**Fora desta história:** progresso e “retomar de onde parou” (US-021).

---

### US-009 — Editar e excluir livro
**Como** leitor, **quero** editar os dados do livro e excluí-lo, **para** corrigir erros e remover o que não quero mais guardar.
**Cobre:** RF-001, RF-010 · **Tamanho:** M · **Depende de:** US-007

**Critérios de aceite**
- [ ] Edição de título e autor.
- [ ] Exclusão exige confirmação explícita e **apaga em cascata** estrutura e anotações do livro (D-09). Exclusão de conta fica fora do MVP.
- [ ] Ações indisponíveis para livros de terceiros (teste de isolamento).

---

### US-010 — Montar a estrutura do livro
**Como** leitor, **quero** cadastrar partes, capítulos e tópicos de um livro, **para** refletir a organização real da obra.
**Cobre:** RF-001 · **Tamanho:** G · **Depende de:** US-007

**Critérios de aceite**
- [ ] Adicionar parte; adicionar capítulo (dentro de uma parte ou **direto no livro**: partes são opcionais, D-06); adicionar tópico (opcional, só dentro de capítulo).
- [ ] Renomear e excluir nós; excluir nó com filhos pede confirmação e remove a subárvore.
- [ ] A hierarquia é exibida em lista aninhada simples (a versão interativa é a US-015).
- [ ] Cadastro ágil para livros longos: adicionar vários capítulos em sequência sem sair do formulário (ex.: colar uma lista de títulos, um por linha). *Mitiga o risco registrado no PRD §9.*
- [ ] Profundidade máxima respeitada (parte → capítulo → tópico).
- [ ] Domínio da árvore (validação de hierarquia) com testes unitários; migração `book_node` incluída, com RLS e política de dono (US-033).
- [ ] Testes de isolamento para todas as operações de nó.

**Notas técnicas:** ADR-0009. A FK de `book_node` para o livro é composta `(owner_id, book_id)` → `book (owner_id, id)` com `ON DELETE CASCADE` (D-09, US-009); o teste de catálogo "foreign keys to book" exige isso, e a história inclui um teste que exclui o livro e confere que a estrutura sumiu.
**Fora desta história:** importação automática da estrutura (fora de escopo do PRD).

---

### US-011 — Descrição e meta de cada nó
**Como** leitor, **quero** registrar título, resumo da proposta e meta estimada em cada nó, **para** planejar a leitura e dar peso a cada trecho.
**Cobre:** RF-002 · **Tamanho:** M · **Depende de:** US-010

**Critérios de aceite**
- [ ] Edição de título, resumo (texto simples) e meta estimada em **páginas** (número inteiro positivo; unidade única, D-02).
- [ ] Meta opcional; nós sem meta usam peso igual ao dos irmãos sem meta (regra do ADR-0009), com indicação visual de “peso padrão”.
- [ ] Validação: meta positiva, limites razoáveis, mensagens em pt-BR.
- [ ] Testes unitários do cálculo de peso efetivo.

---

### US-012 — Reordenar e mover nós
**Como** leitor, **quero** reordenar e mover capítulos e tópicos, **para** corrigir a estrutura sem recriá-la.
**Cobre:** RF-001 · **Tamanho:** M · **Depende de:** US-010

**Critérios de aceite**
- [ ] Reordenar irmãos (arrastar e soltar **e** alternativa por teclado/botões).
- [ ] Mover capítulo para outra parte, respeitando a hierarquia permitida.
- [ ] Ordem persistida e estável após recarregar; reindexação em transação.
- [ ] Testes unitários/integração para as regras de movimento.

**Notas técnicas (revisão de migração da US-010):** a unicidade `book_node_sibling_position_unique` é imediata e `position >= 0`, então um `UPDATE` que desloca irmãos falha no meio. Reindexar em duas fases na mesma transação (primeiro somar um deslocamento grande às posições afetadas, depois gravar as finais) ou tornar a constraint `DEFERRABLE` em migração nova. O banco não impede ciclos: mover exige conferir, sob o mesmo `FOR UPDATE` do livro, que o novo pai não está na subárvore do nó (CTE recursiva) e reaplicar `canPlace`, com teste. Exclusões deixam buracos em `position`; a reordenação pode renumerar de 0 a n−1.

> *Inferido:* o PRD não pede explicitamente reordenação, mas o cadastro manual de estruturas longas torna corrigir ordem inevitável. Se preferir cortar, remova esta história sem afetar as demais.
