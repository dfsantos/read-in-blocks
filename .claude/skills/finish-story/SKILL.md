---
name: finish-story
description: Conclui uma história percorrendo o Definition of Done e a prepara para a validação do usuário (ex.: /finish-story US-013). Roda lint, typecheck, testes e build, confere critérios de aceite, checklist Zero Trust, i18n, migração e .env.example, atualiza progress.md para "Em validação" e resume o que validar. Use quando a implementação de uma história terminar.
argument-hint: "US-XXX"
---

# Finalizar história

Argumento: ID da história em andamento (padrão: a que está *Em desenvolvimento* em `docs/plan/progress.md`).

## Passos

1. **Rodar as verificações** do projeto (scripts de `package.json`): `lint`, `typecheck`, `test`, `build`; E2E quando a história listar. Reporte falhas **com a saída real**; não declare pronto com algo vermelho.
2. **Critérios de aceite:** para cada item da história, indique evidência (arquivo/teste/tela). Item sem evidência = não pronto.
3. **Definition of Done** (`docs/plan/README.md`):
   - testes escritos e passando; casos de isolamento de dois usuários se há dados do usuário;
   - todo texto de interface em `messages/pt-BR.json`, código/commits em inglês;
   - migração versionada incluída se houve mudança de schema;
   - `.env.example` e docs afetadas atualizados;
   - commits em Conventional Commits com `Refs: US-XXX`.
4. **Checklist Zero Trust:** execute a skill `security-checklist` sobre o diff e anexe o resultado. Para mudanças em dados, entradas ou autenticação, invoque também o subagent `security-reviewer`; para mudanças de schema, `migration-reviewer`; e sempre `acceptance-reviewer`.
5. **Atualizar** `docs/plan/progress.md`: status *Em validação*. **Nunca** marque *Aprovada* — só o usuário aprova.
6. **Resumo para o usuário:** o que foi entregue, como validar (passos e URL de preview se houver), desvios/decisões tomadas, riscos residuais e itens fora de escopo descobertos.
7. Push na branch. Não abrir PR sem pedido do usuário.
