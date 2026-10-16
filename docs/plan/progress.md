# Acompanhamento

Atualizado a cada história. **Status:** `Pendente` · `Pronta` · `Em desenvolvimento` · `Em validação` · `Aprovada` · `Descartada`.

Só uma história fica em *Em desenvolvimento* ou *Em validação* por vez.

| Marco | ID | História | RF | Tam. | Depende de | Bloqueios | Status | Aprovada em |
|---|---|---|---|---|---|---|---|---|
| M0 | [US-000](epics/E0-foundation.md) | Aprovar PRD, stack e plano | — | P | — | — | Aprovada | 2026-10-15 |
| M1 | [US-001](epics/E0-foundation.md) | Projeto base com qualidade automatizada | — | M | US-000 | — | Aprovada | 2026-10-16 |
| M1 | [US-002](epics/E0-foundation.md) | Internacionalização preparada (pt-BR) | — | M | US-001 | — | Aprovada | 2026-10-15 |
| M1 | [US-003](epics/E0-foundation.md) | Banco de dados e deploy na Vercel | — | G | US-002 | — | Aprovada | 2026-10-16 |
| M1 | [US-029](epics/E0-foundation.md) | Endurecimento do banco, das migrações e do gate do Context7 | — | G | US-003 | — | Aprovada | 2026-10-16 |
| M1 | [US-030](epics/E0-foundation.md) | Endurecimento restante do gate do Context7 | — | M | US-029 | — | Aprovada | 2026-10-16 |
| M1 | [US-031](epics/E0-foundation.md) | Proteção do próprio gate do Context7 e da configuração do gerenciador de pacotes | — | M | US-030 | — | Em desenvolvimento | |
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

- 32 histórias (1 de aprovação, 30 de entrega, 1 de lançamento); 4 delas Desejáveis opcionais (US-017, US-022, US-023, US-024).
- **Próxima ação:** US-031 (proteção do próprio gate e da configuração do gerenciador) **em desenvolvimento** desde 2026-10-16, na branch `story/US-031-gate-self-protection` (a partir da `story/US-030-context7-gate-hardening`, aprovada e sem PR). Opção C escolhida pelo responsável: `deny` no `.claude/settings.json` + bloqueio no hook. Depois, `/start-story US-004` (pré-requisito D-04: cliente OAuth do Google e allowlist de e-mails).

## Registro de aprovações

| Data | História | Observações |
|---|---|---|
| 2026-10-15 | US-000 | Aprovada pelo responsável: PRD, stack e versões, ADR-0001 a 0013 aceitos, roadmap e decisões D-01 a D-13. Nenhum código foi iniciado; o desenvolvimento começa em outra sessão. |
| 2026-10-16 | US-001 | Aprovada pelo responsável, mantendo os pontos de atenção: patches de versão fechados no npm, ESLint 10 com avisos de peers, ignore do GHSA-vfj7-8cjw-p6xm, minimumReleaseAgeExclude e texto literal até a US-002. PR ainda não aberto. |
| 2026-10-15 | US-002 | Aprovada pelo responsável, mantendo os pontos de atenção: exceção permanente de `next-intl` em `context7-exceptions.json` (hook não reconhece o servidor Context7 da sessão; reavaliar), `allowBuilds` falso para `@swc/core` e `@parcel/watcher`, detector de literais heurístico. PR ainda não aberto. |
| 2026-10-16 | US-003 | Aprovada pelo responsável (PR #13 mesclado). Produção: `https://read-in-blocks.vercel.app/api/health` → `{"status":"ok"}`; Preview protegido (302 sem login). ADR-0014 aceito. Pontos de atenção: `MIGRATOR_DATABASE_URL` visível no runtime (risco aceito); GHSA-67mh-4wv8-2f99 (moderada, `esbuild` 0.18.20 via `drizzle-kit`, só dev server, fora do runtime); endurecimentos apontados pelas revisões ainda abertos: papéis pré-existentes sem checagem de atributos/filiação no `roles.sql`, Git Fork Protection a confirmar, corrida de migração e ordem do journal na branch `preview` compartilhada, `REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`, testes de integração restritos a host local, gate do Context7 aceitando qualquer `*__query-docs`, rate limit de `/api/health`. |
| 2026-10-16 | US-029 | Aprovada pelo responsável. Os pontos de média/baixa da revisão de segurança sobre o gate do Context7 viraram a US-030, autorizada na mesma data. Branch `story/US-029-db-hardening` ainda sem PR. |
| 2026-10-16 | US-030 | Aprovada pelo responsável. Gate do Context7 cobre pacotes só pelo `libraryId`, exige `resolve-library-id` prévio (ou id conhecido) e resposta real, aceita só servidores confiáveis (`trustedServers`) e reconhece variações de comando e escritas por Bash; 172 testes do hook. Pontos abertos para decisão futura: o gate não protege os próprios arquivos (`.claude/context7-exceptions.json`, hook, `settings.json`); `pnpm-workspace.yaml`, `.npmrc`, `.yarnrc*` e `bunfig.toml` fora de `CONFIG_FILES`; pré-release com faixa, `--tag beta` e alias `npm:` não detectados. Branch ainda sem PR. |
