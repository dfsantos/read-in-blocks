# ADR-0007 — Tiptap para anotações com formatação rica

- **Status:** Proposto
- **Data:** 2026-10-15

## Contexto

RF-006/RF-007 exigem anotações com formatação rica **incluindo blocos de código**, e tipos distintos de anotação (conceito-chave, citação com referência de página/posição, ação/dúvida). RF-012 (desejável) pede diagramas simples.

## Decisão

- **Tiptap** (sobre ProseMirror) com extensões de: títulos, negrito/itálico, listas, citação, link, **bloco de código com realce de sintaxe** (`lowlight`).
- O conteúdo é persistido como **JSON do ProseMirror** (coluna `jsonb`), não HTML — evita injeção por HTML armazenado e facilita migrações de formato.
- Cada anotação é um registro com `type` (`key_concept | quote | action_or_question`), `content` (JSON) e, para citações, `reference` (página ou posição). O editor é o mesmo para os três tipos.
- Salvamento automático com debounce, executado por Server Action.
- Editor carregado de forma lazy (Client Component) para não pesar nas telas de leitura.
- **Diagramas (RF-012, desejável):** **Mermaid** em bloco de código especial renderizado no cliente; confirmado só quando a história US-022 for aprovada.
- Barra de ferramentas e menus do editor usam componentes shadcn e textos via i18n.

## Alternativas consideradas

- **Lexical / Slate / BlockNote:** BlockNote é rápido de integrar, porém menos flexível; Lexical/Slate exigem mais código próprio. Tiptap tem o melhor equilíbrio e extensão de código pronta.
- **Markdown puro com textarea:** não atende “formatação rica” de forma amigável.

## Consequências

- Bundle do cliente maior nas telas de edição (mitigado com lazy loading).
- Renderização somente leitura reaproveita o mesmo schema do editor (sem converter para HTML bruto).
