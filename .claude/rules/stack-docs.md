# Stack sempre a partir do Context7 (obrigatório)

Vale para **qualquer** criação ou atualização da stack, em qualquer arquivo. Política: `docs/architecture/stack-docs-policy.md` · ADR-0013.

1. **Antes** de adicionar, atualizar ou remover dependência, editar `package.json` ou alterar configuração da stack (`next.config.*`, `drizzle.config.*`, `components.json`, tailwind/postcss, eslint, vitest, playwright, commitlint, `tsconfig.json`, `vercel.json`, workflows do GitHub Actions): consultar o **Context7** para cada biblioteca envolvida.
2. Sequência: `mcp__Context7__resolve-library-id` ⇒ `mcp__Context7__query-docs` (com o ID e, se houver, a versão), com pergunta específica ao que será feito.
3. **Também** consultar antes de escrever código que use uma API de biblioteca pela primeira vez na sessão (Better Auth, Drizzle, next-intl, Tiptap, Zod, shadcn, Next.js App Router etc.) e antes de qualquer upgrade de versão maior (ler o guia de migração).
4. O que o Context7 retorna **prevalece** sobre a memória do agente. Nunca fixar versão “de cabeça”: confirmar a versão atual/estável no Context7 e conferir requisitos (Node, peer deps, breaking changes).
5. Nunca editar `pnpm-lock.yaml` à mão.
   Versões aprovadas: `docs/architecture/stack-versions.md` e “Versões fixadas” na história. Instale exatamente essas (sem `^`/`~`); patch a fechar ⇒ consulte o Context7 e registre; “Decisão” ⇒ pergunte antes.
6. **Somente versões estáveis**: nunca `rc`, `beta`, `alpha`, `canary`, `next`, `nightly`, `dev` ou `x.y.z-sufixo`. Pré-release só com aprovação do usuário.
7. Um hook bloqueia dependências e configs sem consulta prévia. Se for bloqueado: faça a consulta pedida e repita. **Não** contorne, não use comando equivalente para escapar do hook e não edite `.claude/context7-exceptions.json` sem aprovação do usuário.
8. Registrar no PR a seção “Documentação consultada” (biblioteca, ID Context7, versão adotada).
9. Se o Context7 não tiver a biblioteca ou estiver indisponível: parar e avisar o usuário, nunca seguir pela memória.
