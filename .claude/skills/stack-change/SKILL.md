---
name: stack-change
description: Procedimento obrigatório para adicionar, atualizar ou remover dependência, ou criar/alterar configuração da stack (Next.js, shadcn, Tailwind, Drizzle, Better Auth, next-intl, Tiptap, Vitest, Playwright, CI etc.) consultando o Context7 antes de qualquer comando ou edição. Use sempre que a tarefa mexer em package.json, instalar pacotes, rodar CLIs de scaffolding ou editar arquivos de configuração.
argument-hint: "<biblioteca(s) ou mudança, ex.: add next-intl>"
---

# Mudança de stack com Context7

Política: `docs/architecture/stack-docs-policy.md` (ADR-0013). Um hook bloqueia o passo 4 se os passos 1 a 3 não tiverem sido feitos na sessão.

## Passos

0. **Versão aprovada:** abra `docs/architecture/stack-versions.md` e a tabela “Versões fixadas” da história. Use exatamente aquela versão (sem `^`/`~`). Se for “Linha (patch a fechar)”, descubra o patch no Context7 e registre na tabela; se for “Decisão”, pare e pergunte; se a biblioteca não estiver na tabela, proponha incluí-la.
1. **Listar as bibliotecas envolvidas** (a pedida e as que ela exige: peer deps, plugins, CLIs, tipos).
2. **Resolver:** para cada uma, `mcp__Context7__resolve-library-id` (nome + objetivo). Escolha o ID mais aderente (fonte oficial, versão compatível, boa cobertura).
3. **Consultar:** `mcp__Context7__query-docs` com o ID (e a versão quando existir) e perguntas específicas:
   - versão atual/estável e requisitos (Node, peer dependencies);
   - instalação e configuração recomendadas para o caso de uso do projeto;
   - breaking changes recentes, APIs descontinuadas, guia de migração se for upgrade;
   - segurança: opções de configuração relevantes ao Zero Trust (cookies, CSP, validação).
4. **Executar** o comando/edição a partir do que foi retornado. **Prefira sempre a CLI oficial** da ferramenta (`create-next-app`, `shadcn init/add`, `drizzle-kit`, `husky init`, `pnpm init`) com as flags confirmadas no Context7; só depois ajuste ao padrão do projeto (`src/`, versões exatas, estrutura). Nunca escreva à mão o que a CLI gera (`components.json`, `src/components/ui`, migrações do `drizzle-kit`, lockfile); em conflito na raiz, gere em pasta temporária e traga os arquivos sem sobrescrever `README.md`, `CLAUDE.md`, `docs/` e `.claude/`. Para dependências: fixar a versão confirmada, usar o gerenciador (`pnpm`) e deixar o lockfile ser atualizado por ele. Nunca editar o lockfile à mão.
5. **Verificar:** rodar `typecheck`, `lint`, `test` e `build` aplicáveis. Se a documentação indicar passo adicional (migração de config, codemod), executar.
6. **Registrar:** adicionar à descrição do PR/resumo da história a tabela “Documentação consultada”:

   | Biblioteca | ID Context7 | Versão adotada | Observações |
   |---|---|---|---|

7. Se o Context7 não tiver a biblioteca ou estiver indisponível: **pare** e informe o usuário. Não prossiga pela memória e não altere `.claude/context7-exceptions.json` sem aprovação.

## Nunca

- Instalar pré-release (`rc`, `beta`, `alpha`, `canary`, `next`, `nightly`, `dev`, `x.y.z-sufixo`): só versões estáveis.

- Fixar versão sem confirmar no Context7.
- Usar dependência “porque já conheço” sem consultar nesta sessão.
- Contornar o hook (comando alternativo, script indireto, edição do lockfile).
