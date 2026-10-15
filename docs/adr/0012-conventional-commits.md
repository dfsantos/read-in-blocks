# ADR-0012 — Conventional Commits

- **Status:** Proposto
- **Data:** 2026-10-15

## Contexto

O projeto avança por histórias aprovadas uma a uma e será desenvolvido em grande parte por agente. Um histórico padronizado torna cada entrega rastreável à história, facilita revisão, reversão e geração futura de changelog/versões, e evita mensagens vagas.

## Decisão

- **Todo commit e título de PR seguem Conventional Commits 1.0.0**, em inglês, com **escopo obrigatório** de uma lista fechada (ver [git-workflow.md](../architecture/git-workflow.md)).
- Rodapé `Refs: US-XXX` liga o commit à história.
- Enforcement em três camadas: instrução permanente ao agente (`CLAUDE.md`), hook local `commit-msg` com `commitlint`, e validação no CI (commits e título do PR).
- Trailers de atribuição da plataforma são permitidos no rodapé.

## Alternativas consideradas

- **Mensagens livres:** sem rastreabilidade nem automação possível.
- **Gitmoji:** menos padronizado para ferramentas.
- **Convenção sem escopo obrigatório:** escopo curto e fechado melhora a leitura do histórico por área, com custo baixo.

## Consequências

- Pequeno atrito ao commitar; compensado por histórico legível.
- Lista de escopos precisa ser mantida junto com a configuração do `commitlint`.
- Abre caminho para versionamento semântico e changelog automáticos, se desejado (fora do MVP).
