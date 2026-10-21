# ADR-0007 — Tiptap para anotações com formatação rica

- **Status:** Aceito (2026-10-15)
- **Data:** 2026-10-15

## Contexto

RF-006/RF-007 exigem anotações com formatação rica **incluindo blocos de código**, e tipos distintos de anotação (conceito-chave, citação com referência de página/posição, ação/dúvida). RF-012 (desejável) pede diagramas simples.

## Decisão

- **Tiptap** (sobre ProseMirror) com extensões de: títulos, negrito/itálico, listas, citação, link, **bloco de código com realce de sintaxe** (`lowlight`).
- O conteúdo é persistido como **JSON do ProseMirror** (coluna `jsonb`), não HTML — evita injeção por HTML armazenado e facilita migrações de formato.
- Cada anotação é um registro com `type` (`key_concept | quote | action_or_question`), `content` (JSON) e, para citações, `reference` (página ou posição). O editor é o mesmo para os três tipos.
- Salvamento automático com debounce, executado por Server Action.
- Editor carregado de forma lazy (Client Component) para não pesar nas telas de leitura.
- **Diagramas (RF-012, desejável):** **Mermaid** em bloco de código especial renderizado no cliente; confirmado na US-022 (2026-10-21). O diagrama é um `codeBlock` com `language: "mermaid"` (o texto continua sendo o conteúdo guardado e contado); o Mermaid 11 é carregado sob demanda, com `securityLevel: 'strict'`, rótulos em SVG (sem `foreignObject`) e as opções de segurança travadas em `secure` contra diretivas do próprio diagrama. O SVG gerado nunca entra no DOM da página: vira a origem de um `<img>` (`data:image/svg+xml`), documento isolado em que nenhum script ou handler roda e nada externo é buscado, o que mantém a CSP da US-028 sem `unsafe-inline`. Erro de sintaxe mostra mensagem do catálogo e o texto do diagrama, sem afetar o resto da anotação.
- Barra de ferramentas e menus do editor usam componentes shadcn e textos via i18n.

## Alternativas consideradas

- **Lexical / Slate / BlockNote:** BlockNote é rápido de integrar, porém menos flexível; Lexical/Slate exigem mais código próprio. Tiptap tem o melhor equilíbrio e extensão de código pronta.
- **Markdown puro com textarea:** não atende “formatação rica” de forma amigável.

## Consequências

- Bundle do cliente maior nas telas de edição (mitigado com lazy loading).
- Renderização somente leitura reaproveita o mesmo schema do editor (sem converter para HTML bruto).
