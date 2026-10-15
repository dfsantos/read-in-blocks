# ADR-0006 — Internacionalização com next-intl

- **Status:** Proposto
- **Data:** 2026-10-15

## Contexto

O idioma da aplicação é **português (pt-BR)**, mas ela deve estar **preparada para internacionalização**. O custo de adaptar uma base com textos fixos é alto; o de nascer preparada é baixo.

## Decisão

- **next-intl** integrado ao App Router.
- **Locale único ativo: `pt-BR`** (também o `defaultLocale`). Estrutura de rotas `app/[locale]/…` e catálogos em `messages/pt-BR.json` desde o primeiro dia; adicionar `en` depois é criar um catálogo e registrar o locale.
- **Regra:** nenhum texto de interface escrito diretamente em componentes, ações ou validações. Isso inclui `aria-label`, `placeholder`, `title`, mensagens de erro do Zod, toasts e metadados da página. Chaves em inglês, valores em português (`books.create.title`).
- **Formatação** de datas, números e porcentagens via API de formatação do next-intl (`Intl`), nunca com strings manuais.
- **Pluralização** usando ICU MessageFormat (ex.: “1 capítulo” / “3 capítulos”).
- **Conteúdo do usuário** (títulos de livros, anotações) não é traduzido e não passa por i18n.
- **Verificação automática:** lint/teste que falha se houver literal em português em `src/` fora de `messages/` e checagem de chaves ausentes entre catálogos (configurada na US-002).
- URL com prefixo de locale: com um único locale ativo, `localePrefix: 'as-needed'` mantém URLs limpas (`/livros`, sem `/pt-BR`).

## Alternativas consideradas

- **react-i18next:** maduro, mas sem integração tão direta com Server Components.
- **Sem biblioteca, apenas um arquivo de constantes:** barato agora, caro na hora de traduzir; sem plural/formatação.

## Consequências

- Todo desenvolvimento de UI inclui criar as chaves de mensagem — faz parte do Definition of Done.
- Slugs de rota ficam em inglês no código; traduzir pathnames é opcional e adiado até haver um segundo idioma.
