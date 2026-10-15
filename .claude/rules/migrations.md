---
paths:
  - "src/db/**"
---

# Schema e migrações (ADR-0003, ADR-0004)

- Mudança de schema só por **migração versionada** (drizzle-kit). Nunca editar migração já aplicada; criar uma nova.
- Toda tabela de conteúdo tem `owner_id` (NOT NULL, indexado) e cascata de exclusão definida explicitamente.
- A história que altera o schema inclui a migração e os testes de integração correspondentes.
- Migrações rodam com o papel `migrator`; a aplicação usa o papel `app` (sem DDL).
- Evitar mudanças destrutivas sem plano de transição (expandir → migrar dados → contrair).
- Atualizar `.env.example` se uma variável nova for necessária; nunca incluir valores reais.
