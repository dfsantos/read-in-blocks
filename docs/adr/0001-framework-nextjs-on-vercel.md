# ADR-0001 — Next.js (App Router) + TypeScript na Vercel

- **Status:** Proposto
- **Data:** 2026-10-15

## Contexto

A aplicação deve ser hospedada na Vercel (exigência). O produto é um app web autenticado, com telas interativas (árvore dobrável, editor rico) e dados privados por usuário. Não há requisito de SEO nem de API pública.

## Decisão

- **Next.js com App Router** e **TypeScript em modo estrito**.
- **Server Components** por padrão; **Server Actions** para mutações; Route Handlers apenas onde necessário (ex.: `/api/auth`).
- **Node.js LTS** e **pnpm**, com versões fixadas (`.nvmrc`/`engines`, `packageManager`).
- Deploy pela integração Git da Vercel: cada PR gera um Preview Deployment; `main` publica em produção.

## Alternativas consideradas

- **SPA (Vite + React) + API separada:** dois artefatos para um app de um único usuário; mais configuração de CORS/sessão sem ganho.
- **Remix / SvelteKit / Astro:** viáveis na Vercel, mas Next.js tem suporte de primeira classe e é o ecossistema onde o shadcn/ui é mais documentado.

## Consequências

- Um único projeto Vercel, zero infraestrutura própria.
- Limites de funções serverless (tempo/região) devem ser considerados; a região da função deve ficar próxima à do banco (ver ADR-0003).
- Acoplamento ao ecossistema Next.js; mitigado mantendo regras de negócio em `src/domain`, independentes do framework.
