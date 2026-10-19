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

## Adendo (US-006, 2026-10-19) — resultado do spike de RLS

Itens 1, 3, 4 e 5 implementados como fundação: `ownedBy` e o repositório de exemplo (`sessions`), que obtém o próprio cliente; as regras de lint que restringem o acesso ao banco (e à instância do Better Auth, cujo adaptador não tem escopo de dono) a `src/server/repositories`, `src/db` e `src/server/auth`; `foundOrNotFound` para o 404; e o utilitário de dois leitores. Guia: [data-access.md](../architecture/data-access.md).

**Spike do item 6** (`tests/integration/rls-spike.test.ts`, substituído na US-033 por `rls.test.ts`; Postgres 17 local, papel `app`, `pg` `Pool` com uma única conexão para simular a reutilização do pool):

| Pergunta | Resultado |
|---|---|
| O `app` contorna RLS? | Não: `rolbypassrls = false` (imposto pelo `roles.sql`); não pode `DISABLE ROW LEVEL SECURITY` (não é dono) e `row_security = off` vira erro, não acesso. |
| Política `owner_id = current_setting('app.user_id', true)` | Mostra só as linhas do dono mesmo numa consulta **sem** filtro; `update`/`delete` de linhas alheias afetam 0 linhas; `insert` com outro dono e mudança de dono são recusados (`WITH CHECK`). |
| Sem dono definido | Nenhuma linha visível e `insert` recusado: falha fechada. |
| `set_config('app.user_id', id, true)` dentro de `db.transaction` | Vale só na transação; depois do `COMMIT` ou do `ROLLBACK`, a mesma conexão do pool não vê mais nada. |
| `set_config(..., false)` (de sessão) | **Vaza** para a próxima requisição na mesma conexão. Proibido. |
| Pooler do Neon (PgBouncer em modo transação) | Pela documentação do Neon (Context7, `/websites/neon`), `SET`/`RESET` de sessão não são suportados, mas o que é local à transação funciona; o padrão acima é o compatível. Não testado contra o Neon (os testes de integração só rodam em host local). |
| Limite | RLS protege contra um filtro de dono esquecido, não contra um servidor comprometido: o `app` define o dono que quiser. O `userId` continua vindo só do `requireUser()`. |

**Cuidados se adotado:** views criadas pelo `migrator` ignoram o RLS para o `app`, a menos que usem `security_invoker = true`, e funções `SECURITY DEFINER` também; ambas ficam proibidas nas tabelas de conteúdo sem revisão. A falha fechada depende de `owner_id` ser `text`, como o `user.id` do Better Auth: com uma coluna `uuid`, a política precisaria de `nullif(current_setting('app.user_id', true), '')::uuid`, para que o valor vazio não vire erro de conversão.

**Custos:** cada operação de repositório passa a rodar numa transação com um `set_config` (mais três idas ao banco: `BEGIN`, `set_config`, `COMMIT`), o que pesa com a latência até o Neon; políticas em todas as tabelas de conteúdo; o `migrator` (dono das tabelas) ignora RLS, a menos que se use `FORCE ROW LEVEL SECURITY`; as tabelas do Better Auth ficam fora, porque o adaptador dele não define o dono.

**Recomendação:** viável e compatível com a stack; adotar nas tabelas de conteúdo (`book`, `book_node`, `note`) como **história própria**, com um helper `withOwner(userId, fn)` em `src/server/repositories` que todo repositório use, e as políticas criadas por migração. **Decisão (D-14, 2026-10-19):** adotar, na **US-033**, antes da US-007, de modo que `book` já nasça com RLS. Até lá, o isolamento continua garantido pelos itens 1 a 5.

## Adendo (US-033, 2026-10-19) — RLS adotado

Item 6 implementado como segunda barreira, junto com os itens 1 a 5 (nada deles foi removido):

- **Helper:** `withOwner(userId, fn, db)` em `src/server/repositories/with-owner.ts`: transação + `set_config('app.user_id', userId, true)`; recusa `userId` vazio. Todo repositório de tabela de conteúdo roda por ele **e** filtra com `ownedBy`. Só repositórios o importam e nenhum outro código define `app.user_id` (`owner-setting.test.ts`).
- **Convenção de migração:** `ownerPolicy()` em `src/db/rls.ts`, declarado no `pgTable`; o drizzle-kit gera `ENABLE ROW LEVEL SECURITY` e a política `owner_only` (`FOR ALL TO app`, `USING` e `WITH CHECK` em `owner_id = current_setting('app.user_id', true)`). Guia: [database.md](../architecture/database.md#rls-nas-tabelas-de-conteúdo).
- **Catálogo:** `tests/integration/rls-catalog.test.ts` falha se uma tabela com `owner_id` estiver sem RLS, sem a política do `app` ou com outra política permissiva que o alcance, e se houver view sem `security_invoker`, view materializada ou função `SECURITY DEFINER` fora dos schemas do sistema (mais restrito que "alcança tabela de conteúdo", de propósito).
- **Comportamento** (`tests/integration/rls.test.ts`, tabela de prova criada pelo SQL que o drizzle-kit gera para a convenção): só as linhas do dono numa consulta sem filtro; sem `withOwner`, nada e `insert` recusado; o dono não sobrevive a `COMMIT`, a erro da aplicação nem a erro de consulta na mesma conexão do pool; mudar o dono e criar linha para outro leitor são recusados.

**Pooler do Neon e custo** (`scripts/check-rls-pooler.ts`: 1000 transações em 5 conexões, latência de `select 1` sozinho e embrulhado como no `withOwner`, 100 amostras após aquecimento):

| Ambiente | Dono vazou para a transação seguinte? | `select 1` (mediana / p95) | Com `withOwner` (mediana / p95) | Custo a mais (mediana) |
|---|---|---|---|---|
| Local (Postgres 17 em contêiner, conexão direta) | Não (0 de 1000) | 0,08 / 0,12 ms | 0,31 / 0,60 ms | +0,23 ms |
| Preview (branch `preview`, host `-pooler`) | *a medir pelo responsável* | — | — | — |

O custo a mais vem das três idas ao banco (`BEGIN`, `set_config`, `COMMIT`); contra o Neon, cada uma custa uma volta de rede da função até o banco. Consultas de uma mesma operação devem ficar dentro de um único `withOwner`.
