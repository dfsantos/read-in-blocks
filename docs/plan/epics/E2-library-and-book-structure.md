# E2 — Biblioteca e estrutura do livro

Cobre RF-001, RF-002 e a primeira parte de RF-009. Persona: **Leitor**.

---

### US-007 — Cadastrar um livro
**Como** leitor, **quero** cadastrar um livro, **para** começar a acompanhar sua leitura.
**Cobre:** RF-001 (livro) · **Tamanho:** M · **Depende de:** US-006 · **Bloqueios:** D-02, D-08

**Critérios de aceite**
- [ ] Formulário (shadcn + RHF + Zod) com título obrigatório, autor opcional e unidade da meta do livro (conforme D-02).
- [ ] Validação com mensagens em pt-BR via i18n.
- [ ] Livro salvo vinculado ao usuário logado; após salvar, abre a página do livro.
- [ ] Migração do schema `book` incluída.
- [ ] Testes de isolamento: outro usuário não vê nem acessa o livro por URL (404).

**Versões fixadas** — validadas no Context7 em 2026-10-15 (evidências em [stack-versions.md](../../architecture/stack-versions.md))

| Pacote | Versão | Status | Fonte Context7 |
|---|---|---|---|
| `zod` | **4.6.5** | ✅ Fixada | `/colinhacks/zod` |
| `react-hook-form` | **7.66.0** | ✅ Fixada | `/react-hook-form/react-hook-form` |
| `@hookform/resolvers` | **a fechar na US-007** | 🟡 Linha (patch a fechar) | `/react-hook-form/resolvers` |

- [ ] **Versões idênticas à tabela:** `package.json` com versões exatas (sem `^`/`~`) e lockfile coerentes com esta tabela. Para itens "Linha", o patch é fechado consultando o Context7 e **registrado aqui** antes de instalar; se o Context7 não informar, parar e perguntar ao responsável. Itens "Decisão" só instalam após a decisão registrada em [open-decisions.md](../open-decisions.md).

---

### US-008 — Biblioteca pessoal
**Como** leitor, **quero** ver a lista dos meus livros, **para** escolher qual abrir.
**Cobre:** RF-009 (listagem) · **Tamanho:** P · **Depende de:** US-007

**Critérios de aceite**
- [ ] Página inicial autenticada lista os livros do usuário, ordenados pelo mais recente.
- [ ] Estado vazio com chamada para cadastrar o primeiro livro.
- [ ] Cada item abre a página do livro.
- [ ] Lista exibe apenas livros do próprio usuário (teste de isolamento).

**Fora desta história:** progresso e “retomar de onde parou” (US-021).

---

### US-009 — Editar e excluir livro
**Como** leitor, **quero** editar os dados do livro e excluí-lo, **para** corrigir erros e remover o que não quero mais guardar.
**Cobre:** RF-001, RF-010 · **Tamanho:** M · **Depende de:** US-007 · **Bloqueios:** D-09

**Critérios de aceite**
- [ ] Edição de título, autor (e unidade da meta, com aviso se já houver metas — conforme D-02).
- [ ] Exclusão exige confirmação explícita e apaga em cascata estrutura e anotações do livro.
- [ ] Ações indisponíveis para livros de terceiros (teste de isolamento).

---

### US-010 — Montar a estrutura do livro
**Como** leitor, **quero** cadastrar partes, capítulos e tópicos de um livro, **para** refletir a organização real da obra.
**Cobre:** RF-001 · **Tamanho:** G · **Depende de:** US-007 · **Bloqueios:** D-06

**Critérios de aceite**
- [ ] Adicionar parte; adicionar capítulo (dentro de uma parte ou direto no livro, conforme D-06); adicionar tópico (opcional, só dentro de capítulo).
- [ ] Renomear e excluir nós; excluir nó com filhos pede confirmação e remove a subárvore.
- [ ] A hierarquia é exibida em lista aninhada simples (a versão interativa é a US-015).
- [ ] Cadastro ágil para livros longos: adicionar vários capítulos em sequência sem sair do formulário (ex.: colar uma lista de títulos, um por linha). *Mitiga o risco registrado no PRD §9.*
- [ ] Profundidade máxima respeitada (parte → capítulo → tópico).
- [ ] Domínio da árvore (validação de hierarquia) com testes unitários; migração `book_node` incluída.
- [ ] Testes de isolamento para todas as operações de nó.

**Notas técnicas:** ADR-0009.
**Fora desta história:** importação automática da estrutura (fora de escopo do PRD).

---

### US-011 — Descrição e meta de cada nó
**Como** leitor, **quero** registrar título, resumo da proposta e meta estimada em cada nó, **para** planejar a leitura e dar peso a cada trecho.
**Cobre:** RF-002 · **Tamanho:** M · **Depende de:** US-010 · **Bloqueios:** D-02

**Critérios de aceite**
- [ ] Edição de título, resumo (texto simples) e meta estimada (valor numérico na unidade do livro).
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

> *Inferido:* o PRD não pede explicitamente reordenação, mas o cadastro manual de estruturas longas torna corrigir ordem inevitável. Se preferir cortar, remova esta história sem afetar as demais.
