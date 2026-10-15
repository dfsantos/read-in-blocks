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

1. Identifica se a ação é de dependência ou de configuração da stack e quais pacotes envolve.
2. Lê o transcript da sessão e procura chamadas `query-docs` do Context7.
3. Considera um pacote coberto se alguma dessas chamadas menciona o pacote (ou um alias, ex.: `next` ⇒ `next.js`; `@tiptap/*` ⇒ `tiptap`).
4. Bloqueia (exit 2) e lista os pacotes sem cobertura. A resposta orienta a consulta e a repetição do comando.

Limites conhecidos:

- A associação pacote→consulta é heurística (nome e aliases); não prova que a consulta tratou do assunto exato.
- Consulta por subagent não conta. Faça na sessão principal.
- Comandos indiretos (`pnpm db:generate`, scripts do `package.json`) não são reconhecidos; a regra e a revisão cobrem.
- Cada sessão nova recomeça sem cobertura.

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

Só o responsável aprova. Cada exceção é revisada ao fim do marco. Sem aprovação, o agente não altera esse arquivo.

## Versões aprovadas

As versões que o projeto adota estão em [stack-versions.md](stack-versions.md), validadas no Context7 e espelhadas em cada história de stack ("Versões fixadas"). Regras:

- Instalar **exatamente** a versão da tabela, com `package.json` sem `^`/`~`.
- Item “Linha (patch a fechar)”: consultar o Context7 para o patch e registrar na tabela antes de instalar; se não houver, parar e perguntar.
- Item “Decisão”: não instalar antes da decisão registrada em `open-decisions.md`.
- Divergência entre o que o Context7 retorna e a tabela: parar, informar e propor atualização da tabela (nunca instalar “a mais nova” por conta própria).

## Manutenção

- Pacote novo na stack ⇒ conferir se precisa de alias no hook (`ALIASES` em `require-context7.py`) e atualizar o mapa de arquivos de configuração (`CONFIG_FILES`).
- Mudança nesta política ⇒ ADR substituto.
