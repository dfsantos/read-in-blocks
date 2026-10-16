# Versões da stack

**Status:** Aprovada (2026-10-15) · **Consultado no Context7 em:** 2026-10-15

Fonte única das versões que o projeto adota. Cada história de stack (US-001, 002, 003, 004, 007, 019, 022) traz a sua parte desta tabela em **"Versões fixadas"**. O agente instala **exatamente** estas versões e, se uma divergir, para e pergunta (política: [stack-docs-policy.md](stack-docs-policy.md), [ADR-0013](../adr/0013-context7-docs-first.md)).

## Legenda

| Status | Significado |
|---|---|
| ✅ **Fixada** | Versão exata, vinda de tag/arquivo indexado no Context7, com requisitos de compatibilidade conferidos. |
| 🟡 **Linha (patch a fechar)** | Major/minor confirmados no Context7, mas o número exato do patch não está indexado. Fecha na história correspondente consultando o Context7; se não houver, o responsável decide. |
| 🔶 **Decisão** | Há duas opções válidas; depende de você (ver [open-decisions.md](../plan/open-decisions.md)). Nenhuma pendente hoje. |

> **Somente versões estáveis.** O projeto não usa `rc`, `beta`, `alpha`, `canary`, `next`, `nightly`, `dev` nem versões com sufixo de pré-release (`1.0.0-beta.2`). O hook `require-context7.py` bloqueia instalação e edição de `package.json` com pré-release; só passa com aprovação do responsável registrada em `.claude/context7-exceptions.json` (`prereleaseApproved`).

> **Limite do Context7:** ele indexa documentação por tags. A "maior tag indexada" nem sempre é a última publicada (ex.: RHF e lucide só têm uma tag). Por isso "Fixada" significa *o que o Context7 comprova*, e não uma garantia de ser o último patch no npm.


## Runtime e gerenciador

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `Node.js` | **24 (LTS)** | 🟡 Linha (patch a fechar) | `/nodejs/node` | CHANGELOG: v24 é LTS até 2028-04 (v22 até 2027-04; v26 é Current). Atende todos os mínimos abaixo. Patch não indexado: usar `24` em `.nvmrc` e `engines`. |
| `pnpm` | **12.x (linha estável corrente)** | 🟡 Linha (patch a fechar) | `/pnpm/pnpm` | Docs: a tag `latest` do npm aponta para o pnpm 12 (aceita Node 18 a 26). Sem tag 12.x indexada: o patch é resolvido por `pnpm init` na US-001 e gravado em `packageManager` (exato) e `devEngines.packageManager` (`>=12.0.0 <13.0.0`). Decisão D-13. |
| `typescript` | **6.0.3** | ✅ Fixada | `/microsoft/typescript; /typescript-eslint/typescript-eslint` | Existem v6.0.2 e v7.0.2 (compilador nativo). typescript-eslint suporta `>=4.8.4 <6.1.0` e **falha ao importar com TS 7**. Next exige TS ≥5.1.0. Logo: 6.0.2. |

## CI (GitHub Actions)

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `actions/checkout (GitHub Action)` | **v7.0.1 — SHA 3d3c42e5aac5ba805825da76410c181273ba90b1** | ✅ Fixada | `/pnpm/pnpm` | Exemplo oficial de CI do pnpm usa `actions/checkout@v6`. O SHA do commit é resolvido na US-001. |
| `pnpm/setup (GitHub Action)` | **v3.1.1 — SHA a0881977cd8ea73b1ed212236c99ca10dcc80cf4** | ✅ Fixada | `/pnpm/pnpm` | Exemplo oficial de CI do pnpm. Instala pnpm e Node (`runtime: node@24`) e lê a versão de `packageManager`/`devEngines`. |

## Framework

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `next` | **16.4.0 ou superior da linha 16** | 🟡 Linha (patch a fechar) | `/vercel/next.js` | Node ≥20.9.0. `eslint-config-next@16.4.0+` é o que suporta ESLint 10. Docs do next-intl citam Next 16.3. Sem tag versionada: o patch exato é fechado na US-001. |
| `eslint-config-next` | **mesma versão do `next`** | 🟡 Linha (patch a fechar) | `/vercel/next.js` | Next 16 remove `next lint`; usar ESLint CLI. `eslint-config-next@16` exige ESLint ≥9; ≥16.4.0 suporta ESLint 10. |
| `react / react-dom` | **19.x** | 🟡 Linha (patch a fechar) | `/websites/react_dev; /vercel/next.js` | Next ≥15 exige React 19 como mínimo. Patch não indexado. |
| `@types/react / @types/react-dom` | **19.x (versões atuais)** | 🟡 Linha (patch a fechar) | `/vercel/next.js` | Guia do Next: atualizar `@types/react*` junto com React 19. |

## UI

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `tailwindcss` | **4.3.3** | ✅ Fixada | `/tailwindlabs/tailwindcss.com` | Lockfile do repositório oficial fixa 4.3.3 (maior versão encontrada); site é `v4.tailwindcss.com`. Navegadores: Chrome 111, Safari 16.4, Firefox 128. |
| `@tailwindcss/postcss` | **4.3.x (alinhar ao tailwindcss)** | 🟡 Linha (patch a fechar) | `/websites/tailwindcss` | Plugin PostCSS é o caminho de integração com Next.js. Patch a confirmar na US-001. |
| `postcss` | **a fechar na US-001** | 🟡 Linha (patch a fechar) | `/websites/tailwindcss` | Requisito do plugin `@tailwindcss/postcss`; Context7 não informa versão. |
| `shadcn (CLI)` | **4.21.4** | ✅ Fixada | `/shadcn-ui/ui` | Tag `shadcn@4.21.0`. `init -t next` com o **padrão da CLI: Base UI** (changelog 2026-07; D-11). Sem `-b radix`. |
| `@base-ui/react, class-variance-authority, lucide-react, tw-animate-css, sonner` | **definidas pela CLI shadcn 4.21.0** | 🟡 Linha (patch a fechar) | `/shadcn-ui/ui` | Base `base` mapeia para `@base-ui/react` (Radix usaria `radix-ui`). Diferenças de API: `render` no lugar de `asChild`, presença via `data-open`/`data-closed`. Versões resultantes são registradas no PR e comparadas com esta tabela. |

## Qualidade e testes

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `eslint` | **10.12.0** | ✅ Fixada | `/eslint/eslint; /typescript-eslint/typescript-eslint` | Tag v10.5.0. typescript-eslint declara peer `^8.57 || ^9 || ^10`. Requer `eslint-config-next` ≥16.4.0. |
| `typescript-eslint` | **8.71.2** | ✅ Fixada | `/typescript-eslint/typescript-eslint` | Guard do código-fonte cita 8.70 (bloqueia TS ≥7). Patch a fechar na US-001. |
| `prettier` | **3.9.10** | ✅ Fixada | `/prettier/prettier` | Maior tag indexada (3.6.2, 3.8.3). |
| `vitest` | **5.0.3** | ✅ Fixada | `/vitest-dev/vitest` | Tag v5.0.3. Exige Node ≥22.12 (ok com 24) e Vite ≥6.4. Vitest 4 (v4.1.6) é a alternativa se o Vite ficar em 5. |
| `vite` | **^6.4 || ^7 || ^8 (peer do Vitest)** | 🟡 Linha (patch a fechar) | `/vitest-dev/vitest` | Versão exata não indexada; fechar na US-001. |
| `@testing-library/react, jest-dom, user-event, jsdom` | **a fechar na US-001** | 🟡 Linha (patch a fechar) | `/testing-library/react-testing-library` | Context7 só lista tag antiga (v11_0_2) para o RTL; precisa de versão compatível com React 19. |
| `@playwright/test` | **1.63.0** | ✅ Fixada | `/microsoft/playwright` | Maior tag indexada (também 1.61.x, 1.59.0). Node ≥20; `webServer` e `playwright install --with-deps` no CI. |
| `@commitlint/cli, @commitlint/config-conventional` | **21.2.3 (alinhar o config à mesma versão)** | ✅ Fixada | `/conventional-changelog/commitlint` | `package.json` do `@commitlint/cli` na documentação indica 21.2.3; exige Node ≥22.12 (ok com 24). `scope-enum` e CI `--from/--to`. |
| `husky` | **9.1.7** | ✅ Fixada | `/typicode/husky` | Tag v9.1.7; `husky init` + hook `commit-msg`. |

## i18n, dados e autenticação

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `next-intl` | **4.14.7** | ✅ Fixada | `/amannn/next-intl` | Tag v4.14.7. `localePrefix: 'as-needed'` documentado. Com Next <16.3 é preciso habilitar `experimental.rootParams`. |
| `drizzle-orm / drizzle-kit` | **0.45.4 / 0.31.11 (estáveis)** | ✅ Fixada | `/drizzle-team/drizzle-orm-docs; /drizzle-team/drizzle-orm` | Decisão D-12: estável, sem `@rc`. Na US-003 (2026-10-15) a tag `latest` do npm era 0.45.4 / 0.31.11, mais nova que a 0.44.7 / 0.31.5 citada no Context7; atualização aprovada pelo responsável. |
| ~~`@neondatabase/serverless`~~ | **não usado** | ⛔ Removido (ADR-0014) | `/neondatabase/serverless` | O modo HTTP não conecta num Postgres comum (local/CI) nem tem transações interativas. Substituído por `pg`. |
| `pg` / `@types/pg` | **8.23.1 / 8.23.1** | ✅ Fixada | `/brianc/node-postgres` | Driver em todos os ambientes (ADR-0014), via `drizzle-orm/node-postgres`. Patch da tag `latest` do npm (Context7 não indexa versões). |
| `@vercel/functions` | **3.10.1** | ✅ Fixada | `/websites/vercel` | `attachDatabasePool(pool)` para Fluid compute. Patch da tag `latest` do npm. |
| `better-auth` | **1.6.23** | ✅ Fixada | `/better-auth/better-auth` | Tag v1.6.23. Provedor Google via `socialProviders.google`; `emailAndPassword` desabilitável; CLI `npx auth generate --adapter drizzle`. |
| `@better-auth/drizzle-adapter` | **alinhar a 1.6.23 (confirmar)** | 🟡 Linha (patch a fechar) | `/better-auth/better-auth` | Desde a 1.5 os adapters são pacotes separados; a documentação v1.6.23 manda instalar este pacote. |

## Formulários e editor

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `zod` | **4.6.5** | ✅ Fixada | `/colinhacks/zod` | Maior tag indexada (3.24.2, 4.0.x, 4.3.6, 4.6.5). |
| `react-hook-form` | **7.66.0** | ✅ Fixada | `/react-hook-form/react-hook-form` | Única tag indexada; pode haver patch mais novo. Confirmar na US-007. |
| `@hookform/resolvers` | **a fechar na US-007** | 🟡 Linha (patch a fechar) | `/react-hook-form/resolvers` | `zodResolver` detecta Zod v3/v4 automaticamente. Versão exata não indexada. |
| `@tiptap/react, @tiptap/pm, @tiptap/starter-kit, @tiptap/extension-code-block-lowlight` | **3.x (a fechar na US-019)** | 🟡 Linha (patch a fechar) | `/ueberdosis/tiptap-docs` | Docs v3 estável (guia de upgrade v2→v3); evitar `3.0.0-next.*`. Next.js: `immediatelyRender: false`. Patch não indexado. |
| `lowlight` | **a fechar na US-019** | 🟡 Linha (patch a fechar) | `/wooorm/lowlight` | Peer da extensão CodeBlockLowlight (versão controlada pelo app). |
| `mermaid` | **11.x (a fechar na US-022)** | 🟡 Linha (patch a fechar) | `/mermaid-js/mermaid` | Docs `develop`; tag indexada só `v11_0_0`. `securityLevel: 'strict'`. |

## Matriz de compatibilidade (o que foi verificado)

| Combinação | Resultado | Fonte |
|---|---|---|
| Node 24 × Next 16 | OK (mínimo 20.9) | `/vercel/next.js` |
| Node 24 × Vitest 5.0.3 | OK (`^22.12 \|\| ^24 \|\| >=26`) | `/vitest-dev/vitest` |
| Node 24 × pnpm 11 / 12 | OK (11 exige ≥22.13; 12 aceita 18–26) | `/pnpm/pnpm` |
| Node 24 × commitlint 21 | OK (≥22.12) | `/conventional-changelog/commitlint` |
| Node 24 × Playwright 1.63 | OK (≥20) | `/microsoft/playwright` |
| TypeScript 6.0.2 × typescript-eslint | OK (`>=4.8.4 <6.1.0`) | `/typescript-eslint/typescript-eslint` |
| TypeScript 7.0.x × typescript-eslint | **Incompatível hoje** (erro ao importar) | idem |
| ESLint 10.5.0 × typescript-eslint | OK (peer inclui ^10) | idem |
| ESLint 10 × eslint-config-next | Exige `eslint-config-next` ≥16.4.0 (logo, Next ≥16.4.0) | `/vercel/next.js` |
| React 19 × Next 16 | OK (React 19 é o mínimo desde o Next 15) | `/vercel/next.js` |
| Zod 4 × @hookform/resolvers | OK (detecção automática v3/v4) | `/react-hook-form/resolvers` |
| Vitest 5 × Vite | Vite `^6.4 \|\| ^7 \|\| ^8` (Vite 5 não suportado) | `/vitest-dev/vitest` |
| Tailwind 4.3 × navegadores | Chrome 111+, Safari 16.4+, Firefox 128+ | `/websites/tailwindcss` |
| Better Auth 1.6.23 × Drizzle | Pacote separado `@better-auth/drizzle-adapter` | `/better-auth/better-auth` |

## Descobertas que mudam o plano

1. **TypeScript 6, não 7.** O TS 7 (compilador nativo) existe, mas o typescript-eslint ainda não o suporta; fixar 6.0.2 mantém o lint funcionando.
2. **Next.js ≥ 16.4.0** se quisermos ESLint 10; caso contrário seria preciso ficar no ESLint 9.
3. **shadcn v4 usa Base UI por padrão** (D-11, resolvida: padrão da CLI). O [ADR-0002](../adr/0002-ui-shadcn-tailwind.md) foi ajustado; dependência de primitivos: `@base-ui/react`.
4. **Drizzle 1.0 ainda é RC:** adotamos a estável 0.44.7 + drizzle-kit 0.31.5 (D-12, resolvida).
5. **pnpm 12** é a linha corrente (D-13, resolvida); o patch é gravado por `pnpm init` na US-001.
6. **Better Auth** exige instalar o adapter do Drizzle como pacote separado.
7. **Next.js 16 removeu `next lint`:** os scripts de lint usam a CLI do ESLint.
8. **Node 24 na Vercel:** verificado na US-003 (`/websites/vercel`): 24.x é o padrão; `engines.node` fixado em `24.x`.

### Versões fechadas na implementação (2026-10-16)

Patches das linhas "a fechar", resolvidos no registro npm dentro das linhas confirmadas no Context7 (o Context7 não indexa esses patches; **sujeito à sua revisão**).

| Pacote | Versão instalada | Observação |
|---|---|---|
| `pnpm` | 12.11.2 | tag `latest` do npm; 12.12–12.14 existem, mas não são a tag estável |
| `next` / `eslint-config-next` | 16.4.2 | `create-next-app@16.4.2` |
| `react` / `react-dom` | 19.3.0 | do scaffold |
| `@types/react`, `@types/react-dom`, `@types/node` | 19.3.0, 19.3.0, 24.19.2 | `@types/node` na linha do Node 24 |
| `@tailwindcss/postcss` / `postcss` | 4.3.3 / 8.5.30 | plugin PostCSS (o scaffold usa `@tailwindcss/turbopack`; mantido o aprovado) |
| `typescript-eslint` | 8.70.1 | |
| `vite` | 8.3.4 | `@vitejs/plugin-react` 6.1.2 exige Vite 8 |
| `@testing-library/react`, `dom`, `jest-dom`, `user-event`, `jsdom` | 16.3.3, 10.4.2, 7.0.1, 14.6.8, 30.1.3 | |
| `eslint-config-prettier` | 10.1.8 | |
| shadcn (Base UI `base-nova`) | `shadcn` 4.21.0, `@base-ui/react` 1.9.0, `class-variance-authority` 0.7.1, `cn` 0.4.0, `lucide-react` 1.57.0, `tw-animate-css` 1.4.0 | `cn` é publicado pelo mantenedor do shadcn |
| `actions/checkout` | SHA `d23441a4…` (v6.1.0) | `gitleaks/gitleaks-action` fixada por SHA `e0c47f4f…` (v3.0.0) |

Atualizações do Dependabot (2026-10-16, PRs #3 a #9, revisadas no Context7 e nas notas de release): `typescript` 6.0.3, `eslint` 10.12.0, `prettier` 3.9.10, `typescript-eslint` 8.71.2, `actions/checkout` v7.0.1 (SHA `3d3c42e5…`), `pnpm/setup` v3.1.1 (SHA `a0881977…`) e `shadcn` 4.21.4 (a 4.21.5 existe; o Context7 não traz notas das 4.21.x). As linhas das tabelas acima refletem essas versões.

Pontos de atenção: (1) `eslint-plugin-react`, `-import` e `-jsx-a11y` (via `eslint-config-next`) declaram peer até ESLint 9; o lint roda com ESLint 10, mas `pnpm peers check` avisa. (2) O pnpm 12 gravou `minimumReleaseAgeExclude` para `next@16.4.2` e `jsdom@30.1.3` (versões recentes demais). (3) `pnpm audit` acusa `GHSA-vfj7-8cjw-p6xm` (`braces`, sem correção), ignorado em `pnpm-workspace.yaml` com justificativa.

## Como esta tabela é mantida

- Mudou uma versão ⇒ nova consulta ao Context7, atualização aqui **e** na tabela da história, no mesmo commit (`docs(docs): ...` ou `build(deps): ...`).
- Atualização de dependência (Dependabot) exige consulta ao Context7 e revisão desta tabela.
- Pesquisa feita em 2026-10-15; versões envelhecem. A cada marco (M1, M2, ...) reconsultar antes de instalar algo novo.

### Versões fechadas na US-003 (2026-10-15)

| Item | Versão | Observação |
|---|---|---|
| `drizzle-orm` / `drizzle-kit` | 0.45.4 / 0.31.11 | tag `latest` do npm; aprovadas pelo responsável |
| `pg` / `@types/pg` | 8.23.1 / 8.23.1 | tag `latest` do npm |
| `@vercel/functions` | 3.10.1 | tag `latest` do npm |
| Postgres (local e CI) | `postgres:17-alpine` (17.11), digest `sha256:b0f9560a…` | imagem oficial fixada por digest em `compose.yaml` e no CI |
| `esbuild` (via `drizzle-kit`) | — | `allowBuilds: false` em `pnpm-workspace.yaml`; o binário vem das dependências opcionais por plataforma |
