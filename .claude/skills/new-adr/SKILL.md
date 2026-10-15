---
name: new-adr
description: Cria um novo ADR (Architecture Decision Record) em docs/adr/ com numeração sequencial, template do projeto e atualização do índice, opcionalmente marcando um ADR anterior como substituído. Use quando uma decisão técnica nova ou mudança de decisão precisar ser registrada.
argument-hint: "<título da decisão>"
---

# Novo ADR

1. Listar `docs/adr/` e calcular o próximo número (4 dígitos). Nome do arquivo: `NNNN-kebab-case-in-english.md`.
2. Ler os ADRs relacionados para não contradizer decisões aceitas. Se a nova decisão **substitui** outra, o ADR antigo recebe `Status: Substituído por ADR-NNNN`.
3. Usar o template de `docs/adr/README.md`: Status, Data (hoje), Contexto, Decisão, Alternativas consideradas, Consequências. Escrever em **português**; termos técnicos em inglês.
4. Registrar de forma honesta as alternativas e os custos reais da decisão, não só os benefícios.
5. Adicionar a linha no índice de `docs/adr/README.md` e, se afetar a stack, em `docs/architecture/tech-stack.md`.
6. Status inicial: **Proposto**. Só o usuário aceita.
7. Commit: `docs(docs): add ADR-NNNN <título>` (Conventional Commits; escopos em `docs/architecture/git-workflow.md`).
