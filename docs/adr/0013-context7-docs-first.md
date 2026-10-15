# ADR-0013 — Documentação via Context7 antes de qualquer mudança na stack

- **Status:** Proposto
- **Data:** 2026-10-15

## Contexto

O projeto depende de bibliotecas que mudam rápido (Next.js, shadcn/ui, Tailwind, Better Auth, Drizzle, next-intl, Tiptap, Zod, Playwright, entre outras). O agente é treinado com um corte de conhecimento e pode propor APIs, opções de configuração e versões já obsoletas, o que gera dependências desatualizadas, código com APIs removidas e falhas de segurança. O Context7 serve a documentação atual e específica por versão.

## Decisão

**Toda ação de criação ou atualização da stack é precedida por consulta ao Context7, na mesma sessão, para cada biblioteca envolvida.** Isso inclui:

1. Adicionar, atualizar ou remover dependência (`pnpm add/update/remove`, `pnpm dlx`, `npx`, CLI do shadcn, `drizzle-kit`, `create-next-app` etc.).
2. Editar `package.json` (nomes ou versões de dependências).
3. Criar ou alterar arquivos de configuração da stack (`next.config.*`, `drizzle.config.*`, `components.json`, `tailwind`/`postcss`, `eslint`, `vitest`, `playwright`, `commitlint`, `tsconfig.json`, `vercel.json`, workflows do GitHub Actions).
4. Escrever código que use uma API de biblioteca pela primeira vez na sessão (regra e skill, sem bloqueio mecânico).

**Como consultar:** `resolve-library-id` para obter o ID e, em seguida, `query-docs` com o ID da biblioteca (e a versão, quando for fixada) e uma pergunta específica ao que será feito. Resultado do Context7 prevalece sobre a memória do agente. Se divergirem, vale o Context7.

**Garantia mecânica (não depende da memória do agente):** hook `PreToolUse` (`.claude/hooks/require-context7.py`) bloqueia os itens 1 a 3 quando o transcript da sessão não contém uma chamada `query-docs` do Context7 que cubra a biblioteca. O bloqueio informa qual biblioteca falta consultar.

**Somente versões estáveis:** o hook também bloqueia pré-releases (`rc`, `beta`, `alpha`, `canary`, `next`, `nightly`, `dev`, `x.y.z-sufixo`) em comandos e em `package.json`; exceção por pacote em `prereleaseApproved`, com aprovação do responsável.

**Exceções:** biblioteca ausente do Context7 só passa se constar em `.claude/context7-exceptions.json`, com motivo, data e aprovação do responsável. O agente **não** acrescenta exceções por conta própria.

**Registro:** a descrição do PR lista, por história, as bibliotecas consultadas (ID Context7 e versão) e as versões efetivamente adotadas.

## Alternativas consideradas

- **Apenas instrução no `CLAUDE.md`:** depende do agente lembrar; não é garantia. Mantida como camada complementar.
- **Fixar versões “conhecidas” no plano:** envelhece rápido e reproduz o problema. As versões agora são fixadas em [stack-versions.md](../architecture/stack-versions.md), cada uma validada no Context7 e só em versão estável.
- **Busca na web:** menos precisa por versão e mais sujeita a conteúdo desatualizado ou de terceiros.

## Consequências

- Algumas chamadas extras por mudança de stack; custo baixo comparado a retrabalho com API obsoleta.
- O hook cobre dependências e configs, mas **não** consegue provar que cada linha de código de aplicação foi escrita com base na consulta; para isso valem a regra, a skill e a revisão (`acceptance-reviewer`).
- A garantia vale para a sessão corrente: em sessão nova, consulta-se de novo. Consultas feitas por subagents não contam, pois ficam fora do transcript da sessão principal.
- Depende do servidor MCP do Context7 estar conectado; sem ele, mudanças de stack ficam bloqueadas (comportamento desejado).
- A heurística de associação pacote→biblioteca (aliases no hook) precisa ser mantida quando a stack ganhar pacotes novos.
