# E4 — Visualização do progresso

Cobre RF-004, RF-008 e RF-011. Persona: **Leitor**.

---

### US-015 — Sumário interativo
**Como** leitor, **quero** ver a estrutura do livro como uma lista aninhada dobrável com o progresso de cada seção, **para** localizar rapidamente onde estou.
**Cobre:** RF-004 · **Tamanho:** M · **Depende de:** US-014

**Critérios de aceite**
- [ ] Árvore dobrável/expansível (expandir/recolher um nó, todos), acessível por teclado e leitor de tela (semântica de `tree`).
- [ ] Cada nó mostra título, estado e indicador de progresso da seção.
- [ ] Alterar o estado de uma folha no sumário atualiza o estado dos ancestrais imediatamente.
- [ ] Clicar em um nó abre seus detalhes (resumo, meta, estado; e, depois da US-018, o caderno).
- [ ] Estado de expansão preservado durante a sessão.
- [ ] Funciona em telas pequenas.

---

### US-016 — Painel de progresso ponderado
**Como** leitor, **quero** ver o progresso geral do livro considerando o peso de cada parte, **para** saber o quanto realmente avancei.
**Cobre:** RF-008, regra §6.2 · **Tamanho:** G · **Depende de:** US-011, US-014 · **Bloqueios:** D-02, D-03

**Critérios de aceite**
- [ ] Domínio puro `computeProgress` implementado com testes em tabela, incluindo o exemplo do PRD: concluir uma parte de peso 40% avança o progresso geral em 40%.
- [ ] Painel na página do livro: progresso geral (%) e progresso por parte/capítulo.
- [ ] Contagem simples complementar (ex.: “7 de 20 capítulos concluídos”), claramente distinta do percentual ponderado.
- [ ] Nós sem meta recebem peso padrão conforme ADR-0009, com aviso discreto quando isso afeta o resultado.
- [ ] Contribuição de nós “em andamento” conforme a decisão D-03.
- [ ] Porcentagem formatada via i18n; barra de progresso acessível (`role=progressbar`, valores).
- [ ] Livro sem estrutura mostra estado vazio com orientação.

---

### US-017 — Visão em blocos
**Como** leitor, **quero** ver a estrutura como cartões organizados por parte, **para** ter uma visão mais visual do livro.
**Cobre:** RF-011 (Desejável) · **Tamanho:** M · **Depende de:** US-016

**Critérios de aceite**
- [ ] Alternância entre sumário e blocos na página do livro (preferência lembrada).
- [ ] Um grupo por parte; cada capítulo é um cartão (shadcn Card) com estado, progresso e meta.
- [ ] Cartão leva aos detalhes/caderno do nó.
- [ ] Responsivo (grade que se adapta a mobile).

**Fora desta história:** mapa/grafo interativo avançado (fora de escopo do PRD).
