# ADR-0010 — Qualidade, testes e CI

- **Status:** Proposto
- **Data:** 2026-10-15

## Contexto

O projeto será entregue em histórias pequenas, cada uma aprovada por você antes da seguinte. Precisamos de verificação automática barata que prove que cada entrega funciona e que nada anterior quebrou.

## Decisão

- **Validação:** Zod em toda entrada de Server Action/Route Handler; React Hook Form + componentes de formulário do shadcn nas telas. Mensagens de erro via i18n (ADR-0006).
- **Testes:**
  - **Vitest** para domínio puro e utilitários (alto volume, rápido).
  - **Vitest + Postgres real** para repositórios e isolamento de dados (ADR-0008).
  - **Testing Library** para componentes com lógica relevante.
  - **Playwright** para fluxos E2E críticos (login, criar livro, marcar progresso, anotar, isolamento entre usuários). Login Google nos testes usa uma sessão semeada diretamente no banco/cookie de teste, nunca o Google real.
- **Qualidade estática:** ESLint (config do Next + regras de i18n) e Prettier; `tsc --noEmit`; hooks de pré-commit leves (lint-staged) opcionais.
- **CI (GitHub Actions)** em todo PR: install, lint, typecheck, testes unitários/integração, build. E2E roda no CI contra um Postgres de serviço.
- **CD:** integração Git da Vercel (Preview por PR, produção em `main`). Migrações de banco aplicadas por passo explícito no deploy (definido na US-003).
- **Convenções de Git:** branch por história (`story/US-XXX-short-name`), PR por história, commits em inglês no formato Conventional Commits.

## Alternativas consideradas

- **Jest:** funciona, mas Vitest é mais rápido e nativo a ESM/TS.
- **Biome em vez de ESLint+Prettier:** mais rápido; porém as regras do Next e de i18n estão no ecossistema ESLint.
- **Sem E2E:** barato, mas login/isolamento são justamente o que não pode regredir.

## Consequências

- Cada história entrega código **e** testes; “pronto” inclui CI verde.
- E2E adiciona tempo de CI; mantido enxuto (poucos fluxos longos, não muitos curtos).
