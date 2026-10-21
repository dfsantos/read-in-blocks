# E3 — Estado de leitura

Cobre RF-003. Persona: **Leitor**.

---

### US-013 — Marcar o estado de leitura dos nós
**Como** leitor, **quero** marcar cada capítulo/tópico como não iniciado, em andamento ou concluído, **para** registrar onde estou no livro.
**Cobre:** RF-003 · **Tamanho:** M · **Depende de:** US-010

**Critérios de aceite**
- [ ] Controle de estado (shadcn) em cada nó **folha** (nó sem filhos).
- [ ] Datas: `started_at` registrada ao entrar em “em andamento”; `completed_at` ao concluir; voltar de estado limpa a data correspondente; ir direto a “concluído” preenche as duas.
- [ ] Datas exibidas formatadas via i18n e editáveis manualmente (para registrar leituras passadas).
- [ ] Mudança de estado persiste e atualiza a tela sem recarregar a página inteira.
- [ ] Testes unitários das transições e datas; teste de isolamento.

**Notas técnicas:** ADR-0009 (estado de folhas armazenado).

---

### US-014 — Estado derivado dos nós com filhos
**Como** leitor, **quero** que partes e capítulos com subnós reflitam o estado dos filhos, **para** não precisar atualizá-los à mão.
**Cobre:** RF-003 (regra visível) · **Tamanho:** M · **Depende de:** US-013

**Critérios de aceite**
- [ ] Nó com subnós está “concluído” **somente** quando todos os subnós estão concluídos; “em andamento” se ao menos um está iniciado ou concluído; senão “não iniciado”.
- [ ] Estado de nó pai nunca é gravado: calculado em `src/domain` (função pura) e exibido de forma consistente em todas as telas.
- [ ] Ação “concluir tudo” em um nó pai marca todos os descendentes como concluídos, com confirmação. Marcar um pai como concluído conclui todos os descendentes (D-07).
- [ ] Datas do pai derivadas: início = menor `started_at` dos filhos; conclusão = maior `completed_at`, quando concluído.
- [ ] Testes unitários em tabela cobrindo árvores de 1, 2 e 3 níveis e casos de borda (pai sem filhos vira folha).

**Notas técnicas (revisões da US-013):** a linha de um nó guarda `status`, `started_at` e `completed_at` mesmo depois que ele ganha filhos (por adição ou movimento), e esses valores reaparecem se ele voltar a ser folha. O estado e as datas de um nó com filhos vêm sempre da derivação: a leitura ignora o que está guardado nele. Decidir também se, ao voltar a ser folha, o estado guardado é mantido ou zerado.
