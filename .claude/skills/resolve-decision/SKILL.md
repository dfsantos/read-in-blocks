---
name: resolve-decision
description: Registra a resposta do usuário a uma decisão em aberto (D-XX) em docs/plan/open-decisions.md e propaga o efeito para ADRs, histórias, progress.md e rastreabilidade. Use quando o usuário responder algo como "D-03: só concluídas contam".
argument-hint: "D-XX <resposta>"
---

# Resolver decisão em aberto

1. Ler a linha da decisão em `docs/plan/open-decisions.md` e todas as histórias/ADRs que a citam (`Bloqueios`, texto).
2. Marcar `Status: Resolvida (AAAA-MM-DD)` e registrar a resposta literal do usuário (ou "proposta padrão aceita").
3. Propagar:
   - ajustar critérios de aceite das histórias afetadas;
   - atualizar ADRs impactados (ex.: D-02/D-03 ⇒ ADR-0009; D-10 ⇒ ADR-0005);
   - remover o D-XX da coluna `Bloqueios` em `docs/plan/progress.md` quando ela deixar de bloquear;
   - se a decisão muda uma decisão técnica já aceita, criar ADR substituto (skill `new-adr`).
4. Se a resposta for ambígua, conflitar com o PRD ou ampliar o escopo, **pergunte antes de aplicar**.
5. Commit: `docs(plan): resolve D-XX <resumo>`.
