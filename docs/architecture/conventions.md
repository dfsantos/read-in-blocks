# Convenções

## Idioma

| O quê | Idioma |
|---|---|
| Código: identificadores, comentários, mensagens de log, nomes de arquivos | Inglês |
| Commits, branches, títulos de PR | Inglês |
| Chaves de i18n (`books.create.title`) | Inglês |
| Valores nos catálogos (`messages/pt-BR.json`) e toda a UI | Português (pt-BR) |
| Documentação em `docs/` | Português |
| Dados do usuário (títulos, anotações) | O que o usuário escrever; não traduzido |

Vocabulário do domínio em inglês, para uso consistente no código:

| Português (UI) | Inglês (código) |
|---|---|
| Livro | `book` |
| Parte / Capítulo / Tópico | `part` / `chapter` / `topic` (todos são `node`) |
| Estado de leitura | `status`: `not_started`, `in_progress`, `completed` |
| Meta estimada | `goal` (`goalUnit`: `pages`, `minutes`, `weight`; `goalValue`) |
| Anotação / Caderno | `note` / `notebook` |
| Conceito-chave / Citação / Ação ou dúvida | `key_concept` / `quote` / `action_or_question` |
| Biblioteca | `library` |
| Progresso ponderado | `weightedProgress` |

## i18n (ver [ADR-0006](../adr/0006-internationalization-next-intl.md))

- Proibido literal de texto de interface em componentes, actions ou schemas Zod.
- Toda chave nova entra no catálogo na mesma história que a usa.
- Datas, números e porcentagens: sempre via formatadores do next-intl.
- Plural com ICU, nunca `count === 1 ? … : …`.

## Estrutura de pastas (alvo)

```
src/
├── app/[locale]/             # rotas, layouts, páginas
├── components/
│   ├── ui/                   # shadcn (gerado)
│   └── <feature>/            # componentes de produto
├── domain/                   # regras puras (sem I/O, sem React)
├── server/
│   ├── auth/                 # Better Auth
│   ├── actions/              # Server Actions (finas: validam, chamam repositório/domínio)
│   └── repositories/         # único acesso ao banco; userId obrigatório
├── db/                       # schema Drizzle e migrações
├── i18n/                     # configuração do next-intl
└── lib/                      # utilitários genéricos
messages/
└── pt-BR.json
tests/
├── e2e/                      # Playwright
└── integration/              # Vitest + Postgres
```

## Código

- TypeScript estrito; sem `any` implícito; sem `@ts-ignore` sem justificativa em comentário.
- Server Actions: validar entrada com Zod → `requireUser()` → repositório → `revalidatePath/Tag`. Retornam um resultado tipado (`{ ok: true, data } | { ok: false, errorKey }`), onde `errorKey` é uma chave de i18n.
- Regra de negócio nova vai para `src/domain` com teste unitário antes de ir para qualquer tela.
- Nada de consultas ao banco fora de `src/server/repositories`.
- Segredos só em variáveis de ambiente; `.env.example` atualizado a cada variável nova.

## Git

- Uma branch e um PR por história: `story/US-013-leaf-reading-status`.
- Commits no formato Conventional Commits, em inglês: `feat(library): add book creation form`.
- O PR referencia a história (`US-013`) e lista os critérios de aceite atendidos.
