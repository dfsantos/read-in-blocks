# ADR-0011 — Estratégia de segurança Zero Trust

- **Status:** Aceito (2026-10-15)
- **Data:** 2026-10-15

## Contexto

O conteúdo do usuário (estrutura de livros, citações, anotações) é protegido por direitos autorais e deve ser acessível somente ao dono (PRD §6.1, §8). A aplicação é pública na internet, hospedada em infraestrutura serverless de terceiros, e será em boa parte escrita por agente. Não há perímetro de rede confiável.

## Decisão

Adotar **Zero Trust** como princípio de projeto, aplicado em todas as camadas. Política operacional detalhada em [`docs/security/zero-trust.md`](../security/zero-trust.md). Os três pilares:

1. **Verificar explicitamente:** toda requisição é autenticada e autorizada **no ponto de acesso ao dado**, com identidade vinda da sessão do servidor. Nenhuma confiança em middleware isolado, rede, cabeçalhos do cliente, ambiente (preview/dev) ou na própria UI.
2. **Menor privilégio:** papéis de banco separados (aplicação sem DDL; migração à parte), segredos por ambiente e com escopo mínimo, tokens de CI mínimos, dependências mínimas, acesso por padrão negado (inclusive **allowlist de contas Google**, ver D-10).
3. **Assumir violação:** limitar o raio de impacto (escopo por dono em cada tabela, RLS avaliada na US-006), sessões curtas e revogáveis, logs de auditoria sem conteúdo do usuário, backups, sanitização de tudo que vem do usuário, cabeçalhos/CSP como segunda barreira contra XSS.

Esta ADR **complementa** [ADR-0008](0008-data-isolation-per-user.md) (isolamento por dono) e [ADR-0005](0005-authentication-better-auth-google.md) (autenticação), e adiciona obrigações às histórias (checklist de segurança no Definition of Done).

## Alternativas consideradas

- **Segurança de perímetro (“confiar na rede/ambiente interno”):** inaplicável em serverless público.
- **Segurança apenas no fim do projeto (US-026):** a auditoria final continua existindo, mas corrigir tarde é caro; por isso o checklist vale a cada história.

## Consequências

- Cada história que toca dados ou entradas inclui critérios de segurança e testes negativos.
- Um pouco mais de código padronizado (validação, `requireUser()`, repositórios) e de configuração (CSP, papéis de banco).
- Deploys de preview ficam atrás de proteção da Vercel, pois usam login e banco reais.
- O risco residual (ex.: comprometimento da conta Google do dono, da conta Vercel ou do Neon) é registrado na política, com recomendações de MFA.
