# Política: documentação atual via Context7

Decisão: [ADR-0013](../adr/0013-context7-docs-first.md). Objetivo: **nunca criar ou atualizar a stack com base só na memória do agente.**

## Quando consultar (obrigatório)

| Ação | Exemplos | Cobertura |
|---|---|---|
| Adicionar/atualizar/remover dependência | `pnpm add`, `pnpm update`, `pnpm remove`, `pnpm dlx shadcn add`, `npx create-next-app`, `drizzle-kit generate` | Hook bloqueia |
| Editar `package.json` | incluir ou alterar versão | Hook bloqueia |
| Configuração da stack | `next.config.*`, `drizzle.config.*`, `components.json`, `tailwind`/`postcss`, `eslint`, `vitest`, `playwright`, `commitlint`, `tsconfig.json`, `vercel.json`, `.github/workflows/*` | Hook bloqueia |
| Código que usa API de biblioteca | Server Action com Better Auth, schema Drizzle, extensão Tiptap, config do next-intl | Regra + skill + revisão (sem bloqueio mecânico) |
| Upgrade de versão maior (migração) | Next, Tailwind, Zod etc. | Consultar guia de migração da versão-alvo |

Edição manual do lockfile (`pnpm-lock.yaml`) é proibida: ele só muda por comando do gerenciador de pacotes.

## Como consultar

1. `mcp__Context7__resolve-library-id` com o nome da biblioteca e o objetivo (ex.: “configurar Google OAuth com PKCE”).
2. `mcp__Context7__query-docs` com o `libraryId` escolhido (incluir a versão no ID quando houver) e uma pergunta específica: instalação, configuração, API usada, breaking changes, requisitos de runtime.
3. Fazer as duas etapas **por biblioteca**, antes do comando ou da edição.
4. Basear o comando e o código no que o Context7 retornou. Em divergência com a memória do agente, vale o Context7.
5. Registrar no PR (seção “Documentação consultada”): biblioteca, ID Context7, versão adotada.

Boas práticas:

- Consultas curtas e específicas rendem mais do que perguntas genéricas.
- Para versão fixa, consultar a documentação **daquela versão**; para “latest”, confirmar no Context7 qual é a atual antes de fixar.
- Ao adotar uma versão, conferir requisitos (versão do Node, peer dependencies, mudanças que quebram compatibilidade) no mesmo resultado.

## Como a garantia funciona

`.claude/hooks/require-context7.py` roda antes de `Bash`, `Edit`, `Write` e `MultiEdit`. Ele:

1. Identifica se a ação é de dependência ou de configuração da stack e quais pacotes envolve (ver "O que o parser de Bash reconhece" abaixo).
2. Lê o transcript da sessão e aceita como consulta somente uma chamada `query-docs` que (US-029, US-030):
   - venha de um **servidor confiável**: o servidor `Context7` (`mcp__Context7__…`) ou um conector com id gerado listado em `trustedServers` no `.claude/context7-exceptions.json`. Qualquer outro `mcp__*__query-docs` é ignorado, mesmo com `libraryId` bem formado ou com "context7" no nome;
   - use um `libraryId` no formato do Context7 (`/org/projeto` ou `/org/projeto/versão`) que tenha sido **devolvido antes, na mesma sessão, por um `resolve-library-id` bem-sucedido** de um servidor confiável, ou que já esteja no mapa `LIBRARY_IDS` do hook;
   - tenha resultado sem erro, **não vazio** e que não comece com resposta de "não encontrado" (`not found`, `No documentation found`, `No library found`, `does not exist` etc., procurados nos primeiros 300 caracteres).
3. Considera um pacote coberto somente pelo **`libraryId`**: o segmento do projeto é o nome do pacote, comparado sem sufixos de site de documentação (`next.js` ⇒ `next`, `zod_dev` ⇒ `zod`, `tailwindcss.com` ⇒ `tailwindcss`), ou o id está listado para o pacote (ou para o escopo dele) em `LIBRARY_IDS` (ex.: `drizzle-kit` ⇒ `/drizzle-team/drizzle-orm-docs`; `@tiptap/*` ⇒ `/ueberdosis/tiptap`; `@types/x` exige a cobertura de `x`). O texto livre da pergunta (`query`) **não** cobre nada: uma consulta não libera vários pacotes citando-os na pergunta, e a organização sozinha não basta (`/vercel/next.js` não cobre `vercel`).
4. Bloqueia (exit 2), lista os pacotes sem cobertura e os ids consultados até ali. A resposta orienta a consulta e a repetição do comando.

### O que o parser de Bash reconhece

- Instalação, atualização e remoção (`add`, `install <pkg>`, `update`, `remove`…) em `pnpm`, `npm`, `yarn` e `bun`, inclusive com flags globais antes do subcomando (`pnpm -w add`, `pnpm -C . add`, `pnpm --filter web add`, `npm --prefix . install`, `npm -w web install`, `yarn workspace web add`, `bun --cwd . add`); `dlx`/`x`/`create`, `exec drizzle-kit`, `npx`/`bunx`/`pnpx`, `shadcn` e `drizzle-kit`.
- O gerenciador por caminho (`/usr/bin/pnpm`, `./node_modules/.bin/pnpm`), via `corepack pnpm`, `npx pnpm` ou `pnpm dlx pnpm`, depois de `VAR=valor`, `env`, `sudo`, `doas`, `time`, `nice`, `nohup`, `timeout`, `stdbuf`, `xargs`, `exec` e `command`.
- Comandos dentro de `bash -c '…'`/`sh -c "…"` (e `zsh`, `dash`, `ksh`), `eval "…"`, subshells `( … )`, blocos `{ …; }`, `$( … )` e crases. Corpos de heredoc são ignorados, e redirecionamentos (`2>&1`, `> arquivo`) não são lidos como pacotes.
- **Escrita por Bash em arquivo protegido** (`package.json`, lockfiles e os arquivos de configuração da stack): redirecionamento (`>`, `>>`) para o arquivo, `tee`, `sed -i`/`perl -i`/`awk -i inplace`, `cp`/`ln`/`install`/`rsync` sobre ele (ou para o diretório que o contém), `mv`/`rm`/`touch`, `dd of=…`, `find … -delete/-exec`, `git checkout|restore … package.json` e `git apply`/`git am`/`patch` cujo patch (heredoc ou arquivo) cita o arquivo. Lockfile ⇒ sempre bloqueado; `package.json` ⇒ bloqueado, com orientação de usar o gerenciador ou `Edit`/`Write` (que permitem conferir as dependências); arquivo de configuração ⇒ exige a consulta da biblioteca correspondente, como no `Edit`.
- **Na dúvida, bloqueia:** qualquer comando que cite um arquivo protegido e não esteja na lista de leitura (`cat`, `grep`, `rg`, `jq`, `head`, `tail`, `ls`, `diff`, `sed` sem `-i`, `git diff|log|show|status|add|commit`, ferramentas que só leem a config como `tsc`, `eslint`, `vitest`, `playwright`, `prettier`, `next`, `drizzle-kit`) é tratado como escrita. Ex.: `node scripts/x.js package.json` e `python3 -m json.tool package.json` são bloqueados; use `jq` ou `cat` para ler.

Limites conhecidos:

- A análise é estática e heurística: não prova que a consulta tratou do assunto exato, nem que um comando desconhecido não altera arquivos. Scripts que escrevem por conta própria sem citar o arquivo na linha de comando (`node -e`, `python -c`, scripts do `package.json`, `pnpm db:generate`) não são reconhecidos; a regra, a skill e a revisão cobrem.
- Variáveis e expansões do shell não são resolvidas (`$PM add zod`, `f=package.json; sed -i … $f`).
- Consulta por subagent não conta. Faça na sessão principal.
- Cada sessão nova recomeça sem cobertura.
- O hook protege o agente, não o repositório: não há verificação equivalente no CI.

## Exceções

Biblioteca que o Context7 não tem: o agente **informa o usuário** e propõe a inclusão em `.claude/context7-exceptions.json`:

```json
{
  "exceptions": [
    {
      "package": "nome-do-pacote",
      "reason": "Não indexado no Context7; documentação oficial consultada em <fonte>",
      "approvedBy": "<responsável>",
      "date": "AAAA-MM-DD"
    }
  ]
}
```

Pré-releases aprovadas ficam em `"prereleaseApproved": ["pacote"]`.

Servidores do Context7 registrados com id gerado (ex.: o conector do Claude Desktop, `mcp__<uuid>__query-docs`) ficam em `trustedServers`:

```json
{
  "trustedServers": [
    { "server": "<uuid>", "reason": "Conector do Context7 no Claude Desktop", "approvedBy": "<responsável>", "date": "AAAA-MM-DD" }
  ]
}
```

Só o responsável aprova. Cada exceção é revisada ao fim do marco. Sem aprovação, o agente não altera esse arquivo.

## Scaffolding com as CLIs oficiais

**Scaffolding pelas CLIs oficiais.** Criar e configurar a stack com a CLI oficial de cada ferramenta (`create-next-app`, `shadcn init` e `shadcn add`, `drizzle-kit`, `husky init`, `pnpm init`), usando a versão da tabela de versões e as flags confirmadas no Context7. Depois, ajustar ao padrão do projeto (pasta `src/`, versões exatas sem `^`/`~`, estrutura de [conventions.md](../architecture/conventions.md)). **Nunca escrever à mão** o que uma CLI gera: `components.json`, componentes em `src/components/ui`, migrações do `drizzle-kit`, lockfile. Se a raiz tiver conflito de arquivos, gerar em pasta temporária e trazer os arquivos **sem sobrescrever** `README.md`, `CLAUDE.md`, `docs/` e `.claude/`.

## Versões aprovadas

As versões que o projeto adota estão em [stack-versions.md](stack-versions.md), validadas no Context7 e espelhadas em cada história de stack ("Versões fixadas"). Regras:

- Instalar **exatamente** a versão da tabela, com `package.json` sem `^`/`~`.
- Item “Linha (patch a fechar)”: consultar o Context7 para o patch e registrar na tabela antes de instalar; se não houver, parar e perguntar.
- Item “Decisão”: não instalar antes da decisão registrada em `open-decisions.md`.
- **Somente versões estáveis.** Proibido `rc`, `beta`, `alpha`, `canary`, `next`, `nightly`, `dev`, `experimental` e qualquer `x.y.z-sufixo`. O hook bloqueia comando e `package.json`; exceção só via `prereleaseApproved` em `.claude/context7-exceptions.json`, com aprovação do responsável.
- Divergência entre o que o Context7 retorna e a tabela: parar, informar e propor atualização da tabela (nunca instalar “a mais nova” por conta própria).

## Manutenção

- Pacote novo na stack ⇒ se o id do Context7 que o documenta não tem o nome do pacote como projeto, incluir o pacote (ou o escopo) em `LIBRARY_IDS` em `require-context7.py`, com o id registrado em [stack-versions.md](stack-versions.md); atualizar o mapa de arquivos de configuração (`CONFIG_FILES`) quando houver arquivo de configuração novo.
- Conector do Context7 com id novo (outra máquina ou reinstalação do app) ⇒ o hook bloqueia; o agente informa o id e o responsável decide incluí-lo em `trustedServers`.
- Mudou o hook, o `LIBRARY_IDS` ou a lista de escopos ⇒ rodar os testes em `.claude/hooks/tests/` (ver o README da pasta).
- Mudança nesta política ⇒ ADR substituto.
