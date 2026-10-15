# Versões da stack

**Status:** Proposta para validação · **Consultado no Context7 em:** 2026-10-15

Fonte única das versões que o projeto adota. Cada história de stack (US-001, 002, 003, 004, 007, 019, 022) traz a sua parte desta tabela em **"Versões fixadas"**. O agente instala **exatamente** estas versões e, se uma divergir, para e pergunta (política: [stack-docs-policy.md](stack-docs-policy.md), [ADR-0013](../adr/0013-context7-docs-first.md)).

## Legenda

| Status | Significado |
|---|---|
| ✅ **Fixada** | Versão exata, vinda de tag/arquivo indexado no Context7, com requisitos de compatibilidade conferidos. |
| 🟡 **Linha (patch a fechar)** | Major/minor confirmados no Context7, mas o número exato do patch não está indexado. Fecha na história correspondente consultando o Context7; se não houver, o responsável decide. |
| 🔶 **Decisão** | Há duas opções válidas; depende de você (ver [open-decisions.md](../plan/open-decisions.md)). |

> **Limite do Context7:** ele indexa documentação por tags. A "maior tag indexada" nem sempre é a última publicada (ex.: RHF e lucide só têm uma tag). Por isso "Fixada" significa *o que o Context7 comprova*, e não uma garantia de ser o último patch no npm.


## Runtime e gerenciador

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `Node.js` | **24 (LTS)** | 🟡 Linha (patch a fechar) | `/nodejs/node` | CHANGELOG: v24 é LTS até 2028-04 (v22 até 2027-04; v26 é Current). Atende todos os mínimos abaixo. Patch não indexado: usar `24` em `.nvmrc` e `engines`. |
| `pnpm` | **ver D-13 (11.28.5 ou 12.x)** | 🔶 Decisão | `/pnpm/pnpm` | Tag indexada mais alta: v11.28.5 (exige Node ≥22.13). Docs de `main` indicam pnpm 12 como `latest` (aceita Node 24). Sem tag 12.x para fixar o patch. |
| `typescript` | **6.0.2** | ✅ Fixada | `/microsoft/typescript; /typescript-eslint/typescript-eslint` | Existem v6.0.2 e v7.0.2 (compilador nativo). typescript-eslint suporta `>=4.8.4 <6.1.0` e **falha ao importar com TS 7**. Next exige TS ≥5.1.0. Logo: 6.0.2. |

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
| `shadcn (CLI)` | **4.21.0** | ✅ Fixada | `/shadcn-ui/ui` | Tag `shadcn@4.21.0`. `init -t next`. Atenção: o padrão de base passou a ser **Base UI** (changelog 2026-07); Radix exige `-b radix` (D-11). |
| `radix-ui, class-variance-authority, lucide-react, tw-animate-css, sonner` | **definidas pela CLI shadcn 4.21.0** | 🟡 Linha (patch a fechar) | `/shadcn-ui/ui` | O estilo `new-york-v4` declara essas dependências; a CLI as instala. As versões resultantes são registradas na tabela do PR e comparadas com esta. |

## Qualidade e testes

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `eslint` | **10.5.0** | ✅ Fixada | `/eslint/eslint; /typescript-eslint/typescript-eslint` | Tag v10.5.0. typescript-eslint declara peer ^8.57, ^9 ou ^10. Requer `eslint-config-next` ≥16.4.0. |
| `typescript-eslint` | **8.70.x** | 🟡 Linha (patch a fechar) | `/typescript-eslint/typescript-eslint` | Guard do código-fonte cita 8.70 (bloqueia TS ≥7). Patch a fechar na US-001. |
| `prettier` | **3.8.3** | ✅ Fixada | `/prettier/prettier` | Maior tag indexada (3.6.2, 3.8.3). |
| `vitest` | **5.0.3** | ✅ Fixada | `/vitest-dev/vitest` | Tag v5.0.3. Exige Node ≥22.12 (ok com 24) e Vite ≥6.4. Vitest 4 (v4.1.6) é a alternativa se o Vite ficar em 5. |
| `vite` | **^6.4, ^7 ou ^8 (peer do Vitest)** | 🟡 Linha (patch a fechar) | `/vitest-dev/vitest` | Versão exata não indexada; fechar na US-001. |
| `@testing-library/react, jest-dom, user-event, jsdom` | **a fechar na US-001** | 🟡 Linha (patch a fechar) | `/testing-library/react-testing-library` | Context7 só lista tag antiga (v11_0_2) para o RTL; precisa de versão compatível com React 19. |
| `@playwright/test` | **1.63.0** | ✅ Fixada | `/microsoft/playwright` | Maior tag indexada (também 1.61.x, 1.59.0). Node ≥20; `webServer` e `playwright install --with-deps` no CI. |
| `@commitlint/cli, @commitlint/config-conventional` | **21.2.3 (alinhar o config à mesma versão)** | ✅ Fixada | `/conventional-changelog/commitlint` | `package.json` do `@commitlint/cli` na documentação indica 21.2.3; exige Node ≥22.12 (ok com 24). `scope-enum` e CI `--from/--to`. |
| `husky` | **9.1.7** | ✅ Fixada | `/typicode/husky` | Tag v9.1.7; `husky init` + hook `commit-msg`. |

## i18n, dados e autenticação

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `next-intl` | **4.14.7** | ✅ Fixada | `/amannn/next-intl` | Tag v4.14.7. `localePrefix: 'as-needed'` documentado. Com Next <16.3 é preciso habilitar `experimental.rootParams`. |
| `drizzle-orm / drizzle-kit` | **ver D-12 (estável 0.44.7 + kit 0.31.5, ou 1.0 RC)** | 🔶 Decisão | `/drizzle-team/drizzle-orm-docs` | Docs atuais mandam instalar `@rc` (v1.0 em release candidate). Estável referenciada: drizzle-orm 0.44.7; tag `drizzle-kit_0.31.5`. Sem número exato do RC. |
| `@neondatabase/serverless` | **a fechar na US-003** | 🟡 Linha (patch a fechar) | `/neondatabase/serverless` | Context7 não informa versão. Drizzle usa `neon-http` (não interativo) ou `neon-serverless` (WebSocket, transações interativas). |
| `better-auth` | **1.6.23** | ✅ Fixada | `/better-auth/better-auth` | Tag v1.6.23. Provedor Google via `socialProviders.google`; `emailAndPassword` desabilitável; CLI `npx auth generate --adapter drizzle`. |
| `@better-auth/drizzle-adapter` | **alinhar a 1.6.23 (confirmar)** | 🟡 Linha (patch a fechar) | `/better-auth/better-auth` | Desde a 1.5 os adapters são pacotes separados; a documentação v1.6.23 manda instalar este pacote. |

## Formulários e editor

| Pacote | Versão | Status | Fonte (Context7) | Evidência / compatibilidade |
|---|---|---|---|---|
| `zod` | **4.6.5** | ✅ Fixada | `/colinhacks/zod` | Maior tag indexada (3.24.2, 4.0.x, 4.3.6, 4.6.5). |
| `react-hook-form` | **7.66.0** | ✅ Fixada | `/react-hook-form/react-hook-form` | Única tag indexada; pode haver patch mais novo. Confirmar na US-007. |
| `@hookform/resolvers` | **a fechar na US-007** | 🟡 Linha (patch a fechar) | `/react-hook-form/resolvers` | `zodResolver` detecta Zod v3/v4 automaticamente. Versão exata não indexada. |
| `@tiptap/react, @tiptap/pm, @tiptap/starter-kit, @tiptap/extension-code-block-lowlight` | **3.x (a fechar na US-019)** | 🟡 Linha (patch a fechar) | `/ueberdosis/tiptap-docs` | Docs v3 (guia de upgrade v2→v3). Next.js: `immediatelyRender: false`. Patch não indexado. |
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
3. **shadcn v4 usa Base UI por padrão** desde 2026-07; o [ADR-0002](../adr/0002-ui-shadcn-tailwind.md) assumiu Radix. Ver **D-11**.
4. **Drizzle 1.0 está em RC** e a documentação já aponta para `@rc`. Ver **D-12**.
5. **pnpm 12 é o `latest`**, mas só há tags 11.x indexadas. Ver **D-13**.
6. **Better Auth** exige instalar o adapter do Drizzle como pacote separado.
7. **Next.js 16 removeu `next lint`:** os scripts de lint usam a CLI do ESLint.
8. **Suporte a Node 24 na Vercel não foi verificado** (fora do Context7); conferir na US-003 antes de fixar `engines`.

## Como esta tabela é mantida

- Mudou uma versão ⇒ nova consulta ao Context7, atualização aqui **e** na tabela da história, no mesmo commit (`docs(docs): ...` ou `build(deps): ...`).
- Atualização de dependência (Dependabot) exige consulta ao Context7 e revisão desta tabela.
- Pesquisa feita em 2026-10-15; versões envelhecem. A cada marco (M1, M2, ...) reconsultar antes de instalar algo novo.
