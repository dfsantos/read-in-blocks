# Acompanhamento

Atualizado a cada história. **Status:** `Pendente` · `Pronta` · `Em desenvolvimento` · `Em validação` · `Aprovada` · `Descartada`.

Só uma história fica em *Em desenvolvimento* ou *Em validação* por vez.

| Marco | ID | História | RF | Tam. | Depende de | Bloqueios | Status | Aprovada em |
|---|---|---|---|---|---|---|---|---|
| M0 | [US-000](epics/E0-foundation.md) | Aprovar PRD, stack e plano | — | P | — | — | Aprovada | 2026-10-15 |
| M1 | [US-001](epics/E0-foundation.md) | Projeto base com qualidade automatizada | — | M | US-000 | — | Em validação | |
| M1 | [US-002](epics/E0-foundation.md) | Internacionalização preparada (pt-BR) | — | M | US-001 | — | Pendente | |
| M1 | [US-003](epics/E0-foundation.md) | Banco de dados e deploy na Vercel | — | G | US-002 | — | Pendente | |
| M2 | [US-004](epics/E1-authentication-and-privacy.md) | Entrar com Google | RF-010 | G | US-003 | — | Pendente | |
| M2 | [US-005](epics/E1-authentication-and-privacy.md) | Sessão, sair e rotas protegidas | RF-010 | M | US-004 | — | Pendente | |
| M2 | [US-006](epics/E1-authentication-and-privacy.md) | Fundação do isolamento de dados | RF-010 | M | US-005 | — | Pendente | |
| M2 | [US-028](epics/E1-authentication-and-privacy.md) | Cabeçalhos de segurança e proteção de requisições | RF-010 | M | US-005 | — | Pendente | |
| M3 | [US-007](epics/E2-library-and-book-structure.md) | Cadastrar um livro | RF-001 | M | US-006 | — | Pendente | |
| M3 | [US-008](epics/E2-library-and-book-structure.md) | Biblioteca pessoal | RF-009 | P | US-007 | — | Pendente | |
| M3 | [US-009](epics/E2-library-and-book-structure.md) | Editar e excluir livro | RF-001 | M | US-007 | — | Pendente | |
| M3 | [US-010](epics/E2-library-and-book-structure.md) | Montar a estrutura do livro | RF-001 | G | US-007 | — | Pendente | |
| M3 | [US-011](epics/E2-library-and-book-structure.md) | Descrição e meta de cada nó | RF-002 | M | US-010 | — | Pendente | |
| M3 | [US-012](epics/E2-library-and-book-structure.md) | Reordenar e mover nós | RF-001 | M | US-010 | — | Pendente | |
| M4 | [US-013](epics/E3-reading-state.md) | Marcar o estado de leitura dos nós | RF-003 | M | US-010 | — | Pendente | |
| M4 | [US-014](epics/E3-reading-state.md) | Estado derivado dos nós com filhos | RF-003 | M | US-013 | — | Pendente | |
| M4 | [US-015](epics/E4-progress-visualization.md) | Sumário interativo | RF-004 | M | US-014 | — | Pendente | |
| M4 | [US-016](epics/E4-progress-visualization.md) | Painel de progresso ponderado | RF-008 | G | US-011, US-014 | — | Pendente | |
| M5 | [US-018](epics/E5-notes.md) | Caderno por capítulo | RF-005 | M | US-015 | — | Pendente | |
| M5 | [US-019](epics/E5-notes.md) | Formatação rica e blocos de código | RF-007 | G | US-018 | — | Pendente | |
| M5 | [US-020](epics/E5-notes.md) | Tipos de anotação | RF-006 | M | US-019 | — | Pendente | |
| M6 | [US-017](epics/E4-progress-visualization.md) | Visão em blocos | RF-011 | M | US-016 | — | Pendente | |
| M6 | [US-021](epics/E5-notes.md) | Retomar a leitura de onde parou | RF-009 | M | US-016, US-018 | — | Pendente | |
| M7 | [US-022](epics/E6-desirable-features.md) | Diagramas nas anotações | RF-012 | G | US-019 | — | Pendente | |
| M7 | [US-023](epics/E6-desirable-features.md) | Ritmo e previsão de conclusão | RF-013 | M | US-016 | — | Pendente | |
| M7 | [US-024](epics/E6-desirable-features.md) | Densidade de anotações | RF-014 | P | US-018 | — | Pendente | |
| M8 | [US-025](epics/E7-release.md) | Polimento de UX, responsividade e acessibilidade | — | G | US-021 | — | Pendente | |
| M8 | [US-026](epics/E7-release.md) | Auditoria de privacidade e segurança | RF-010 | M | US-021 | — | Pendente | |
| M8 | [US-027](epics/E7-release.md) | Publicar em produção | — | M | US-026 | — | Pendente | |

## Resumo

- 29 histórias (1 de aprovação, 27 de entrega, 1 de lançamento); 4 delas Desejáveis opcionais (US-017, US-022, US-023, US-024).
- **Em validação:** US-001 (branch `story/US-001-project-base`), aguardando a aprovação do responsável. Nenhuma outra história em andamento.

## Registro de aprovações

| Data | História | Observações |
|---|---|---|
| 2026-10-15 | US-000 | Aprovada pelo responsável: PRD, stack e versões, ADR-0001 a 0013 aceitos, roadmap e decisões D-01 a D-13. Nenhum código foi iniciado; o desenvolvimento começa em outra sessão. |
