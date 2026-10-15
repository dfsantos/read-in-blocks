# ADR-0003 — PostgreSQL no Neon (Vercel Marketplace)

- **Status:** Aceito (2026-10-15)
- **Data:** 2026-10-15

## Contexto

O domínio é relacional e hierárquico (usuário → livros → nós em árvore → anotações), com consultas de agregação (progresso ponderado). A Vercel não oferece banco próprio; as opções entram pelo Marketplace.

## Decisão

- **PostgreSQL** gerenciado pelo **Neon**, provisionado pela integração da Vercel (variáveis de ambiente injetadas automaticamente).
- **Um banco/branch por ambiente:** produção, preview (branch de banco por Preview Deployment ou um banco compartilhado de preview — decidido na US-003) e desenvolvimento local.
- Driver serverless do Neon (`@neondatabase/serverless`) compatível com o runtime da Vercel.
- Desenvolvimento local e testes de integração usam um Postgres real (container ou branch Neon), nunca SQLite, para não divergir do comportamento de produção.

## Alternativas consideradas

- **Supabase:** bom, mas traria Auth/RLS/Storage que já cobrimos de outra forma; mais superfície do que o necessário.
- **Vercel KV/Blob/Edge Config:** não adequados a dados relacionais.
- **SQLite/Turso:** viável para um usuário, mas consultas recursivas e crescimento multiusuário favorecem Postgres.

## Consequências

- Plano gratuito do Neon basta para o MVP (único usuário, sem períodos críticos — PRD §8); cold start de compute pode adicionar latência na primeira requisição.
- Backups/PITR dependem do plano; interrupção não é crítica segundo o PRD.
