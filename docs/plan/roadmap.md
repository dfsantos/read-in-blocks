# Roadmap

A ordem busca **entregar valor ponta a ponta o mais cedo possível** (um leitor logado cadastra um livro e marca progresso) e deixar o que é desejável (RF-011 a RF-014) para depois do MVP essencial.

## Marcos

| Marco | Resultado verificável | Histórias |
|---|---|---|
| **M0 — Aprovação do plano** | PRD, stack e plano aceitos | US-000 |
| **M1 — Esqueleto no ar** | App vazio em pt-BR, com banco, CI e deploy na Vercel funcionando | US-001 a US-003 |
| **M2 — Acesso privado** | Login com Google (allowlist), rotas protegidas, isolamento de dados, cabeçalhos de segurança | US-004 a US-006, US-028 |
| **M3 — Biblioteca e estrutura** | Cadastrar livros e montar a hierarquia (RF-001, RF-002, RF-009 parcial) | US-007 a US-012 |
| **M4 — Acompanhar leitura** | Estados, datas, sumário interativo, painel ponderado (RF-003, 004, 008) | US-013 a US-016 |
| **M5 — Anotações** | Caderno por capítulo com formatação rica e tipos (RF-005, 006, 007) | US-018 a US-020 |
| **M6 — MVP essencial completo** | Retomada de leitura (RF-009 completo) e visão em blocos | US-017, US-021 |
| **M7 — Desejáveis** | Diagramas, ritmo/previsão, densidade de anotações (RF-012 a 014) | US-022 a US-024 |
| **M8 — Lançamento** | Polimento de UX/acessibilidade, auditoria de privacidade, produção | US-025 a US-027 |

> M6 fecha todos os RFs **Essenciais** (RF-001 a RF-010) mais a visão em blocos (RF-011, Desejável, barata de entregar em seguida ao sumário). Os demais Desejáveis (M7) são opcionais: você pode lançar (M8) sem eles.

## Caminho crítico

```
US-000 → US-001 → US-002 → US-003 → US-004 → US-005 → US-006
   → US-007 → US-010 → US-011 → US-013 → US-014 → US-016
                                   └→ US-018 → US-019 → US-020
```

## Princípios de ordenação

1. **Fundação antes de recurso:** i18n e isolamento de dados entram antes de qualquer tela de conteúdo, pois são caros de retrofitar.
2. **Fatias verticais:** cada história atravessa UI, ação, domínio e banco; nunca “só o banco” ou “só as telas”.
3. **Segurança desde o início (Zero Trust):** o checklist de segurança vale em toda história; as camadas de base (allowlist, isolamento, RLS, CSP) entram em M2, antes de qualquer conteúdo.
4. **Regras críticas cedo e isoladas:** o cálculo de progresso ponderado é domínio puro com testes (US-014/US-016), antes de qualquer visual elaborado.
5. **Decisões abertas travam só as histórias que dependem delas** (coluna `Bloqueios`).
