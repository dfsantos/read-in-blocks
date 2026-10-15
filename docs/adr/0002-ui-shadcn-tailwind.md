# ADR-0002 — shadcn/ui + Tailwind CSS

- **Status:** Proposto
- **Data:** 2026-10-15

## Contexto

A UI deve ser construída com shadcn (exigência). O shadcn/ui não é uma biblioteca instalada: é um conjunto de componentes copiados para o repositório, baseados em Radix UI e estilizados com Tailwind CSS.

## Decisão

- **shadcn/ui** como base de todos os componentes de interface; componentes ficam em `src/components/ui` (gerados pela CLI) e não recebem lógica de negócio.
- **Tailwind CSS** com tokens de tema em variáveis CSS (cores, raio, tipografia), permitindo tema escuro depois.
- **lucide-react** para ícones.
- **Sonner** (toasts) e demais componentes do shadcn conforme necessidade; evitar outras bibliotecas de componentes.
- Componentes de composição do produto (ex.: `BookTree`, `ProgressBar`) ficam em `src/components/<feature>`.
- Acessibilidade: usar os primitivos Radix sem remover semântica/ARIA; verificação formal na US-025.

## Alternativas consideradas

- **MUI / Chakra / Mantine:** descartadas pela exigência do shadcn.

## Consequências

- Código dos componentes pertence ao projeto: customização total, mas atualizações são manuais (via `shadcn diff`).
- Todo texto visível passa por i18n, inclusive `aria-label` e placeholders (ADR-0006).
