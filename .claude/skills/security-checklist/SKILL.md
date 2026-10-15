---
name: security-checklist
description: Preenche o checklist de segurança Zero Trust (docs/security/zero-trust.md) a partir do diff atual, indicando para cada item atendido/N-A/pendente com evidência. Use ao finalizar uma história, antes de abrir ou atualizar PR, ou quando o usuário pedir revisão de segurança do que mudou.
---

# Checklist Zero Trust sobre o diff

1. Obter o diff da branch (`git diff origin/main...HEAD` ou o alvo indicado) e ler `docs/security/zero-trust.md`.
2. Para cada item do checklist, responder **Atendido / N/A / Pendente**, citando `arquivo:linha` como evidência. N/A exige justificativa de uma linha.
   - Todo acesso a dados autentica via `requireUser()` e usa repositório com `userId`?
   - Algum id de recurso é aceito sem verificar dono? Há teste negativo com segundo usuário?
   - Toda entrada validada no servidor com Zod (tipos, tamanho, enum)?
   - Segredo/dado sensível em código, cliente (`NEXT_PUBLIC_*`), logs ou mensagens de erro?
   - Conteúdo do usuário renderizado sem HTML bruto; sanitização onde houver HTML?
   - Erros revelam existência de recursos alheios ou detalhes internos?
   - Dependências novas justificadas (necessidade, manutenção, licença) e lockfile atualizado?
   - Mudança de schema com `owner_id` coberta por testes de isolamento?
   - `.env.example` atualizado sem valores reais?
3. Procurar ativamente: `dangerouslySetInnerHTML`, `eval`, SQL concatenado, `process.env` exposto ao cliente, rotas/actions sem `requireUser()`, imports do cliente de banco fora de `repositories`.
4. Saída: tabela com os itens + lista de pendências priorizadas. **Não corrija** automaticamente achados fora do escopo da história; reporte-os.
