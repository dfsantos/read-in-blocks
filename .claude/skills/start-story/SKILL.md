---
name: start-story
description: Inicia o desenvolvimento de uma história de usuário (ex.: /start-story US-013). Verifica Definition of Ready, dependências aprovadas, decisões bloqueantes e se há outra história em andamento; depois cria a branch e propõe o plano de implementação. Use sempre que o usuário pedir para começar, iniciar ou retomar uma história.
argument-hint: "US-XXX"
---

# Iniciar história

Argumento: o ID da história (ex.: `US-013`). Se ausente, pergunte qual.

## Passos

1. **Localizar a história** em `docs/plan/epics/*.md` e a linha dela em `docs/plan/progress.md`. Ler a história inteira, as ADRs citadas e `docs/security/zero-trust.md`.
2. **Verificar Definition of Ready** (`docs/plan/README.md`). **Pare e informe o usuário** se qualquer item falhar:
   - todas as histórias em `Depende de` estão com status **Aprovada**;
   - cada decisão em `Bloqueios` (D-XX) está resolvida em `docs/plan/open-decisions.md`; se não estiver, apresente a pendência e a proposta padrão e peça a decisão (não assuma);
   - nenhuma outra história está em *Em desenvolvimento* ou *Em validação*;
   - o usuário autorizou esta história.
3. **Atualizar** o status da história para *Em desenvolvimento* em `progress.md`.
4. **Branch:** `story/US-XXX-short-name` (inglês). Se a plataforma designou uma branch para a sessão, use a designada.
5. **Plano de implementação** (curto, mostrado ao usuário antes de codar):
   - critérios de aceite, um a um, e como cada um será verificado;
   - arquivos/camadas afetados (domínio, repositório, action, UI, migração, catálogo i18n);
   - testes a escrever (unitário, integração com isolamento, E2E se listado);
   - riscos de segurança (superfície nova, entradas, dados do usuário).
6. Implemente **somente** esta história. O que for descoberto fora do escopo vira nova história ou entrada em `open-decisions.md`.

## Lembretes

- Commits: Conventional Commits em inglês, com `Refs: US-XXX` (ver `CLAUDE.md`).
- Não criar PR a menos que o usuário peça.
