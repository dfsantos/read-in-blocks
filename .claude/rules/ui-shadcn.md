---
paths:
  - "src/components/**"
  - "src/app/**/*.tsx"
---

# UI com shadcn/ui (ADR-0002)

- Usar componentes shadcn existentes antes de criar algo novo; instalar pela CLI (`shadcn add`), não copiar à mão.
- `src/components/ui/` contém apenas componentes gerados pelo shadcn, **sem lógica de negócio**. Composições do produto ficam em `src/components/<feature>/`.
- Server Components por padrão; `"use client"` apenas onde há interação (árvore dobrável, editor).
- Acessibilidade: preservar a semântica/ARIA dos primitivos Radix, foco visível, navegação por teclado; estado nunca comunicado só por cor.
- Responsivo desde o início (mobile first).
- Todo texto visível passa por i18n (ver regra `i18n`).
- Conteúdo do usuário nunca é renderizado como HTML bruto (`dangerouslySetInnerHTML` é proibido salvo sanitização aprovada em ADR).
