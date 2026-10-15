---
name: isolation-tests
description: Gera testes de integração de isolamento entre dois usuários para um recurso (ler, listar, alterar, excluir, mover), esperando "não encontrado" para recursos alheios. Use sempre que um repositório ou Server Action novo tocar dados do usuário (ADR-0008, regra de privacidade do PRD §6.1).
argument-hint: "<recurso ou arquivo de repositório>"
---

# Testes de isolamento entre usuários

Local: `tests/integration/isolation/<resource>.test.ts` (Vitest + Postgres real). Use o utilitário de dois usuários criado na US-006; se ainda não existir, pare e avise.

Para **cada** operação pública do repositório/action do recurso:

1. Usuário A cria o recurso (e dependentes: livro → nó → anotação).
2. Usuário B tenta, usando o id do recurso de A:
   - **ler por id** ⇒ resultado idêntico ao de id inexistente (404/`null`);
   - **listar** ⇒ não contém itens de A;
   - **alterar / mover / reordenar** ⇒ rejeitado e nada muda (reler como A e comparar);
   - **excluir** ⇒ rejeitado e o recurso de A continua existindo;
   - **criar filho** em recurso de A (ex.: nó em livro de A, anotação em nó de A) ⇒ rejeitado.
3. Tentar **forjar** `ownerId`/`userId` no payload da action ⇒ ignorado; o dono vem da sessão.
4. Sem sessão ⇒ rejeitado antes de qualquer acesso a dados.
5. Verificar que a resposta/mensagem de erro para recurso alheio é **igual** à de recurso inexistente.

Cubra também agregações (contagens, progresso, densidade): devem considerar só dados do próprio usuário.
