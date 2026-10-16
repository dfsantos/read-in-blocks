# ADR-0015 — Autoproteção do gate do Context7 e da configuração do gerenciador de pacotes

- **Status:** Proposto (2026-10-16)
- **Data:** 2026-10-16
- **Complementa:** [ADR-0013](0013-context7-docs-first.md) e [ADR-0011](0011-zero-trust-security.md)

## Contexto

O ADR-0013 garante por hook (`.claude/hooks/require-context7.py`) que toda mudança de stack seja precedida por consulta ao Context7. As US-029 e US-030 endureceram essa verificação, mas a revisão de segurança da US-030 mostrou que o próprio gate continuava aberto:

- uma única edição do agente em `.claude/context7-exceptions.json` (lista `exceptions` ou `trustedServers`), no hook (mapa `LIBRARY_IDS`) ou em `.claude/settings.json` desligava ou afrouxava a verificação. A aprovação do responsável era só regra de processo;
- o transcript da sessão, que serve de prova da consulta, podia ser editado pelo agente;
- `pnpm-workspace.yaml` e `.npmrc` concentram controles da cadeia de suprimentos (`allowBuilds`, `minimumReleaseAgeExclude`, `audit.ignore`, `overrides`, `registry`) e não eram verificados;
- pré-releases dentro de faixas (`^4.0.0-beta.1`), `--tag beta` e aliases `npm:` (`zod@npm:outro`) escapavam da regra de versões estáveis ou enganavam a revisão.

## Decisão

Opção C, escolhida pelo responsável em 2026-10-16 (US-031): **duas barreiras para os arquivos do gate**, mais verificação da configuração do gerenciador.

1. **`deny` no `.claude/settings.json`** para `Edit` e `Write` em `.claude/context7-exceptions.json`, `.claude/hooks/**`, `.claude/settings.json`, `.claude/settings.local.json` e `.claude/rules/stack-docs.md`.
2. **Bloqueio no hook** para os mesmos arquivos, também por Bash (redirecionamento, `tee`, `sed -i`, `cp`/`mv`/`rm`, `git checkout|restore`, `git apply`/`patch`, código inline de interpretador) e para os transcripts de sessão (`~/.claude/projects/**/*.jsonl`). Leitura continua livre.
3. **Procedimento:** o agente só **propõe** mudanças nesses arquivos (diff no PR ou texto); o responsável aplica fora do agente (editor ou terminal próprio). Isso vale também para histórias que mexem no hook: a implementação é feita numa worktree ou branch enquanto o hook ativo é o da `main`, e o novo bloqueio passa a valer depois do merge.
4. **Configuração do gerenciador:** `pnpm-workspace.yaml`, `.npmrc`, `.yarnrc`, `.yarnrc.yml` e `bunfig.toml` são configuração da stack (consulta ao Context7 do gerenciador); pacotes novos citados nas chaves de cadeia de suprimentos exigem a própria consulta; `registry` diferente do npm público é bloqueado; escrita por Bash nesses arquivos é bloqueada (usar `Edit`/`Write`).
5. **Versões e aliases:** pré-release em faixa e `--tag <pré-release>` são tratados como pré-release; alias `npm:` só com aprovação do responsável em `aliasesApproved` e com o pacote real coberto.

## Alternativas consideradas

- **Só `deny` (opção A):** simples, mas não cobre Bash.
- **Só hook (opção B):** cobre Bash, mas depende de um único mecanismo, que é justamente o que está sendo protegido.
- **Verificação no CI:** protegeria o repositório, não só o agente; fica para uma decisão futura.

## Consequências

- O agente não consegue mais afrouxar o gate por conta própria; toda mudança no hook, nos testes do hook, nas exceções ou nas permissões passa pelo responsável.
- Histórias futuras que alterem o hook precisam de worktree/branch (o bloqueio vale para o hook ativo da `main`) e da aplicação final pelo responsável quando o arquivo já estiver protegido no ambiente em uso.
- Alguns comandos legítimos ficam bloqueados por conservadorismo (ex.: `node -e` que lê `package.json`); a política lista os casos e as alternativas.
- Continuam fora do alcance: mudanças indiretas sem citar o arquivo (troca de branch, `git stash pop`, scripts executados) e qualquer ação fora do agente.
