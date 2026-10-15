# CLAUDE.md — Instruções permanentes para agentes

Este arquivo é lido automaticamente por agentes de código. As regras abaixo são **obrigatórias** em toda sessão, sem exceção e sem precisar ser lembradas pelo usuário. Detalhes e justificativas estão em `docs/`.

## 1. Commits: Conventional Commits (obrigatório)

Todo commit **deve** seguir [Conventional Commits 1.0.0](https://www.conventionalcommits.org/pt-br/v1.0.0/), em inglês:

```
<type>(<scope>): <subject>

<body, optional>

<footer, optional>
```

- **type:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **scope:** obrigatório; um dos escopos listados em [`docs/architecture/git-workflow.md`](docs/architecture/git-workflow.md).
- **subject:** imperativo, minúsculas, sem ponto final, até 72 caracteres no cabeçalho (`feat(library): add book creation form`).
- **Quebra de compatibilidade:** `!` após o escopo e rodapé `BREAKING CHANGE: …`.
- **Referência à história:** rodapé `Refs: US-013`.
- Os trailers de atribuição exigidos pela plataforma (`Co-Authored-By`, `Claude-Session`) ficam no rodapé, depois dos demais.
- Um commit = uma mudança lógica. Nunca usar mensagens como `update`, `fix stuff`, `wip`.
- Antes de commitar, conferir a mensagem contra o formato acima. Quando o `commitlint` existir no repositório (US-001), ele deve passar.
- Título de PR também segue Conventional Commits.

## 2. Segurança: Zero Trust (obrigatório)

Nunca confiar em rede, cliente, sessão, ambiente ou entrada. Verificar explicitamente, dar o menor privilégio, assumir que houve brecha. Política completa: [`docs/security/zero-trust.md`](docs/security/zero-trust.md) e [ADR-0011](docs/adr/0011-zero-trust-security.md). Em todo código novo:

1. **Autenticar e autorizar em cada ponto de acesso a dados**, nunca só em middleware ou na UI. Todo Server Action e Route Handler é um endpoint público.
2. **Acesso a dados somente via `src/server/repositories`**, com `userId` obrigatório vindo da sessão (nunca do cliente). Recurso de terceiro ⇒ 404.
3. **Validar toda entrada no servidor com Zod**, inclusive IDs, enums e tamanhos.
4. **Sem segredos no código/cliente.** Só variáveis de ambiente; nada sensível em `NEXT_PUBLIC_*`; atualizar `.env.example`.
5. **Nunca renderizar HTML armazenado/de usuário sem sanitização**; conteúdo rico é JSON do ProseMirror.
6. **Não registrar em log** conteúdo do usuário, tokens ou dados pessoais.
7. **Dependências:** adicionar o mínimo, com versão fixada via lockfile; justificar na descrição do PR.
8. Qualquer dúvida de segurança: escolher a opção mais restritiva e registrar a dúvida para o usuário.

## 3. Idioma

- **Código, comentários, commits, branches, chaves de i18n:** inglês.
- **Interface da aplicação:** português (pt-BR), sempre via `messages/pt-BR.json` (next-intl). Nenhum texto de interface direto em componentes.
- **Documentação em `docs/`:** português.

## 4. Processo de trabalho

- Implementar **uma história por vez**, somente a que o usuário autorizou ([`docs/plan/progress.md`](docs/plan/progress.md)). Não adiantar histórias futuras.
- Branch `story/US-XXX-short-name` (exceto quando a plataforma designar outra branch; nesse caso usar a designada).
- Seguir Definition of Ready/Done em [`docs/plan/README.md`](docs/plan/README.md), incluindo o checklist de segurança.
- Atualizar `docs/plan/progress.md` ao mudar o status de uma história; só o usuário aprova.
- Não criar PR a menos que o usuário peça.
- Decisões técnicas novas ⇒ novo ADR em `docs/adr/`. Não contradizer ADRs aceitos sem propor um ADR substituto.

## 5. Mapa de documentos

| Assunto | Documento |
|---|---|
| Produto | [`docs/prd/prd-read-in-blocks.md`](docs/prd/prd-read-in-blocks.md) |
| Stack e arquitetura | [`docs/architecture/tech-stack.md`](docs/architecture/tech-stack.md) |
| Convenções de código | [`docs/architecture/conventions.md`](docs/architecture/conventions.md) |
| Git e commits | [`docs/architecture/git-workflow.md`](docs/architecture/git-workflow.md) |
| Segurança | [`docs/security/zero-trust.md`](docs/security/zero-trust.md) |
| Decisões | [`docs/adr/`](docs/adr/README.md) |
| Plano e status | [`docs/plan/`](docs/plan/README.md) |
