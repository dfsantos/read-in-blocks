<!-- PR title must follow Conventional Commits: type(scope): subject -->

## História

US-XXX — <título>

## Critérios de aceite atendidos

- [ ] <copiar os critérios da história e marcar>

## Checklist de segurança (Zero Trust)

Política: `docs/security/zero-trust.md`. Marque ou escreva "N/A" com motivo.

- [ ] Autenticação e autorização no ponto de acesso a dados (não só em middleware/UI)
- [ ] Acesso a dados somente via `src/server/repositories`, com `userId` da sessão
- [ ] Toda entrada validada no servidor com Zod (IDs, enums, tamanhos)
- [ ] Sem segredos no código/cliente; `.env.example` atualizado
- [ ] Nenhum HTML de usuário renderizado sem sanitização
- [ ] Sem conteúdo do usuário, tokens ou dados pessoais em logs
- [ ] Dependências novas mínimas, versão fixada, justificadas abaixo
- [ ] Testes de isolamento entre usuários (quando há dados do usuário)

## Documentação consultada (Context7)

| Biblioteca | ID Context7 | Versão adotada |
| ---------- | ----------- | -------------- |
|            |             |                |

## Dependências adicionadas ou alteradas

<!-- justificativa de cada uma -->

## Como validar

<!-- passos para o responsável validar -->
