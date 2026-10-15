# ADR-0008 — Isolamento de dados por usuário

- **Status:** Aceito (2026-10-15)
- **Data:** 2026-10-15

## Contexto

Regra crítica do PRD: livros, estruturas e anotações ficam disponíveis **apenas ao usuário que os cadastrou**, por razões de direitos autorais (§6.1, RF-010). Um vazamento entre usuários é o pior defeito possível do produto.

## Decisão

Defesa em camadas:

1. **Repositórios com `userId` obrigatório.** Todo método de `src/server/repositories/*` recebe o `userId` da sessão e o aplica em toda consulta e mutação (`WHERE owner_id = $1`). Não existe função de leitura por id sem escopo de dono.
2. **Posse transitiva.** Nós e anotações carregam `owner_id` próprio (denormalizado) além de `book_id`, de modo que o filtro de dono nunca depende de um join esquecido.
3. **Server Actions e rotas** obtêm o usuário por um helper único (`requireUser()`); sem sessão, a requisição é rejeitada. O `userId` nunca vem de parâmetros do cliente.
4. **Acesso inexistente = recurso inexistente:** recursos de outro usuário respondem 404 (não 403), para não revelar existência.
5. **Testes:** suíte de integração que cria dois usuários e tenta ler/alterar/apagar todos os recursos do outro (US-006 monta o arcabouço; cada história nova adiciona seus casos; US-026 faz a auditoria final).
6. **Row Level Security (RLS) do Postgres como segunda barreira**, em linha com o [ADR-0011](0011-zero-trust-security.md) (assumir violação da camada de aplicação). O driver serverless e o pool dificultam o `SET LOCAL`; por isso a US-006 inclui um **spike** para validar a viabilidade (ex.: transação com `set_config` por requisição e papel `app` sem `BYPASSRLS`). Se viável, RLS entra no MVP; se não, fica registrada a razão e a decisão é reavaliada antes da US-026.

## Alternativas consideradas

- **Somente RLS:** barreira forte, mas operacionalmente mais complexa com o driver serverless.
- **Filtrar nas Server Actions:** espalha a regra; fácil esquecer em uma consulta nova.

## Consequências

- Um pouco mais de código padronizado em repositórios.
- Revisão de PR tem uma regra clara: “consulta fora de repositório ou sem `userId` é bloqueante”.
