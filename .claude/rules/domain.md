---
paths:
  - "src/domain/**"
---

# Camada de domínio (ADR-0009)

- Funções **puras**: sem I/O, sem banco, sem React, sem `Date.now()`/`Math.random()` implícitos (receber o tempo como parâmetro).
- Regras críticas do PRD vivem aqui: estado derivado de nós pai, progresso ponderado, peso efetivo, ritmo/previsão.
- Cada função nova tem testes unitários **em tabela** (Vitest), incluindo casos de borda e o exemplo do PRD quando aplicável (parte de 40% avança o progresso em 40%).
- O estado de nós pai é sempre derivado dos filhos, nunca gravado.
- Escreva o teste antes de ligar a regra a qualquer tela.
