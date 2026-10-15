---
paths:
  - "src/server/actions/**"
  - "src/app/**/route.ts"
  - "src/app/**/actions.ts"
---

# Server Actions e Route Handlers (Zero Trust, ADR-0011)

Toda Server Action e Route Handler é um **endpoint público**. Ordem obrigatória:

1. Validar a entrada no servidor com **Zod** (tipos, UUIDs, enums, tamanhos máximos).
2. `requireUser()` — sem sessão, rejeitar. Não depender de middleware.
3. Chamar o repositório com o `userId` da sessão (nunca do payload).
4. `revalidatePath` / `revalidateTag` quando necessário.

- Retorno tipado: `{ ok: true, data } | { ok: false, errorKey }`, com `errorKey` sendo uma chave de i18n, nunca texto livre.
- Erros não revelam existência de recursos de terceiros nem detalhes internos (stack, SQL).
- Ações de escrita verificam `Origin` e respeitam rate limit/limites de payload definidos na US-028.
- Ações finas: regra de negócio fica em `src/domain`, acesso a dados em repositórios.
