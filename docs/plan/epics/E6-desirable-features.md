# E6 — Funcionalidades desejáveis

Cobre RF-012, RF-013 e RF-014 (classificação **Desejável**). Podem ser descartadas, adiadas ou reordenadas sem afetar o MVP essencial. Persona: **Leitor**.

---

### US-022 — Diagramas nas anotações
**Como** leitor, **quero** incluir diagramas simples nas anotações, **para** representar relações entre conceitos.
**Cobre:** RF-012 · **Tamanho:** G · **Depende de:** US-019

**Critérios de aceite**
- [ ] Inserir bloco de diagrama no editor (sintaxe Mermaid) com pré-visualização.
- [ ] Renderização no modo leitura; erro de sintaxe exibe mensagem amigável sem quebrar a anotação.
- [ ] Renderização isolada e segura (sem executar HTML/JS arbitrário): Mermaid em `securityLevel: 'strict'`, compatível com a CSP da US-028; teste com diagrama malicioso.
- [ ] Biblioteca carregada sob demanda.
- [ ] Textos de interface em pt-BR via i18n.

**Notas técnicas:** ADR-0007. A escolha final (Mermaid vs. alternativa) é confirmada ao iniciar a história.

---

### US-023 — Ritmo e previsão de conclusão
**Como** leitor, **quero** uma estimativa de quando terminarei o livro, **para** planejar minha leitura.
**Cobre:** RF-013 · **Tamanho:** M · **Depende de:** US-016

**Critérios de aceite**
- [ ] Domínio puro calcula o ritmo (capítulos concluídos por semana, sobre uma janela definida) e a data prevista a partir do trabalho restante.
- [ ] Estimativa exibida no painel do livro, com data formatada via i18n.
- [ ] Sem dados suficientes (ex.: menos de 2 conclusões ou 1 semana): mensagem explicativa em vez de número enganoso.
- [ ] Livro concluído não exibe previsão.
- [ ] Testes unitários em tabela com datas fixas (sem depender do relógio real).

**Notas técnicas:** usa `completed_at` registrado na US-013. A fórmula exata (contagem x peso) é decidida ao iniciar a história, preferindo a baseada em peso para ser coerente com o RF-008.

---

### US-024 — Densidade de anotações
**Como** leitor, **quero** destacar os capítulos em que mais anotei, **para** ver onde está o que mais me marcou.
**Cobre:** RF-014 · **Tamanho:** P · **Depende de:** US-018

**Critérios de aceite**
- [ ] Indicador de densidade (ex.: intensidade/contagem) por capítulo no sumário e/ou blocos.
- [ ] Lista “capítulos com mais anotações” no painel do livro.
- [ ] Consulta agregada em repositório com escopo de dono; teste de isolamento.
- [ ] Indicador não depende apenas de cor (acessibilidade).
