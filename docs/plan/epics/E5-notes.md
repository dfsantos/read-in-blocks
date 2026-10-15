# E5 — Anotações e retomada

Cobre RF-005, RF-006, RF-007 e RF-009 (retomada). Persona: **Leitor**.

---

### US-018 — Caderno por capítulo
**Como** leitor, **quero** um espaço de anotações em cada nó, **para** guardar o que quero reter ancorado ao trecho do livro.
**Cobre:** RF-005 · **Tamanho:** M · **Depende de:** US-015

**Critérios de aceite**
- [ ] Cada nó (parte, capítulo ou tópico) tem seu caderno, acessível a partir do sumário e da visão de detalhes.
- [ ] Criar, editar e excluir anotações (texto simples nesta história) com confirmação na exclusão.
- [ ] Anotações listadas por nó em ordem cronológica, com data de criação/edição.
- [ ] Indicador de “possui anotações” (contagem) no sumário.
- [ ] Migração `note` incluída; `owner_id`, `book_id` e `node_id` presentes; excluir um nó/livro remove suas anotações.
- [ ] Testes de isolamento para todas as operações.

**Notas técnicas:** ADR-0007 (modelo de anotação), ADR-0008.

---

### US-019 — Formatação rica e blocos de código
**Como** leitor, **quero** formatar minhas anotações e incluir blocos de código, **para** registrar conteúdo técnico e estruturado.
**Cobre:** RF-007 · **Tamanho:** G · **Depende de:** US-018

**Critérios de aceite**
- [ ] Editor Tiptap com negrito, itálico, títulos, listas, citação, link e **bloco de código com realce de sintaxe**.
- [ ] Barra de ferramentas com componentes shadcn, textos em pt-BR via i18n, atalhos de teclado padrão.
- [ ] Conteúdo salvo como JSON do ProseMirror; renderização somente leitura com o mesmo schema (sem HTML bruto).
- [ ] Salvamento automático com indicação de estado (“salvando…” / “salvo”) e proteção contra perda ao sair.
- [ ] Editor carregado sob demanda (lazy); telas de leitura não pagam o custo.
- [ ] Anotações da US-018 (texto simples) continuam legíveis (migração de dados, se necessária).
- [ ] Conteúdo malicioso colado (ex.: HTML/script) é neutralizado.
- [ ] **Zero Trust:** o servidor valida o JSON do editor contra o schema permitido e um limite de tamanho antes de gravar (o cliente não é confiável); links só com protocolos `http(s)`/`mailto`; teste com payloads XSS conhecidos.

**Notas técnicas:** ADR-0007.

---

### US-020 — Tipos de anotação
**Como** leitor, **quero** classificar minhas anotações como conceito-chave, citação ou ação/dúvida, **para** reencontrar o que importa por categoria.
**Cobre:** RF-006 · **Tamanho:** M · **Depende de:** US-019

**Critérios de aceite**
- [ ] Ao criar uma anotação, escolher o tipo: conceito-chave, citação ou ação/dúvida.
- [ ] Citação exige/permite **referência** de página ou posição (campo próprio, validado).
- [ ] Caderno do nó agrupa ou filtra por tipo, com identificação visual de cada tipo (ícone + rótulo, não só cor).
- [ ] Tipo pode ser alterado depois; “ação/dúvida” pode ser marcada como resolvida *(inferido; remover se não desejado)*.
- [ ] Testes de validação (citação sem referência, tipos inválidos).

---

### US-021 — Retomar a leitura de onde parou
**Como** leitor, **quero** ver na biblioteca o progresso de cada livro e retomar de onde parei, **para** voltar à leitura sem procurar.
**Cobre:** RF-009 · cenário “iniciar ou retomar uma leitura” · **Tamanho:** M · **Depende de:** US-016, US-018

**Critérios de aceite**
- [ ] Cada livro na biblioteca mostra progresso ponderado e o próximo/atual nó (primeiro “em andamento”; se não houver, o primeiro “não iniciado”).
- [ ] Ação “Retomar” leva direto a esse nó, com seu caderno aberto.
- [ ] Livros concluídos são identificados como tal; livros sem estrutura orientam o usuário.
- [ ] Atalho para revisitar anotações de um capítulo específico em livros já lidos *(cenário inferido do PRD §2)*.
- [ ] Teste E2E do fluxo completo: login → abrir biblioteca → retomar → anotar → marcar concluído.
