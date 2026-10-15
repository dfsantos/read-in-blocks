# PRD — Read in Blocks

**Status:** Rascunho v1
**Versão:** v1.0
**Data:** 2026-10-15
**Autor / Responsável:** [PENDENTE] — definir quem assina o PRD.

> **Legenda:** [INFERIDO] = dedução do agente, não confirmada pelo stakeholder · [PENDENTE] = informação não obtida na entrevista.

## 1. Visão Geral e Proposta de Valor

O Read in Blocks é um aplicativo web de acompanhamento de leitura. Em vez de medir o progresso como "páginas lidas / total", ele usa a estrutura hierárquica do livro (partes, capítulos e tópicos) como unidade de progresso. O leitor vê o avanço por ramos do livro e mantém anotações ancoradas em cada capítulo, o que organiza ao longo do tempo o que ele quer reter das leituras. O produto nasce da falta, sentida pelo próprio autor, de uma solução desse tipo.

## 2. Declaração do Problema e Contexto

### O Problema

O leitor não tem um lugar organizado para guardar, ao longo do tempo, o que quer reter das leituras. Os apps tradicionais mostram o progresso como uma barra linear de páginas, que não reflete a estrutura do livro. Já as anotações acabam virando blocos de texto soltos, desconectados do trecho do livro a que se referem.

### Cenários de Uso Principais

- **Iniciar ou retomar uma leitura:** sempre que começa ou retoma um livro, o leitor usa o aplicativo para registrar o avanço na estrutura do livro e anotar o trecho lido.
- **Revisitar o que foi retido:** o leitor volta a um livro já lido para consultar as anotações de um capítulo específico [INFERIDO].

## 3. Personas e Públicos Impactados

- **Leitor:** qualquer pessoa que queira rastrear sua leitura e criar anotações sobre ela, independentemente do gênero do livro. Ele precisa saber em que ponto da estrutura do livro está e manter organizado o que quer reter. Ganha uma visão do progresso que respeita a organização do livro e um acervo de anotações que acompanha essa mesma estrutura.

## 4. Objetivos e Métricas de Sucesso

### Objetivos Principais

[PENDENTE] — o stakeholder declarou que, no momento, não há objetivos definidos.

### Métricas e Metas

[PENDENTE] — não há métricas definidas. Sem elas, não existe critério objetivo para avaliar se o MVP cumpriu seu propósito.

## 5. Escopo e Fronteiras

### Incluso (MVP)

- Cadastro manual da estrutura do livro
- Visualização da estrutura em sumário interativo e em blocos
- Atualização do estado de leitura de cada capítulo
- Anotações por capítulo, com formatação rica
- Painel básico de progresso
- Acesso individual: cada leitor vê apenas o próprio conteúdo

### Fora de Escopo

- Importação automática da estrutura a partir de fontes externas
- Mapa/grafo visual interativo avançado
- Exportação de anotações para ferramentas externas
- Gamificação e sequências (streaks)
- Recursos sociais e compartilhamento

## 6. Regras de Negócio Críticas e Invariantes

1. **Privacidade do conteúdo:** livros, estruturas e anotações ficam disponíveis apenas ao usuário que os cadastrou, para não infringir direitos autorais.
2. **Progresso ponderado:** o progresso geral do livro considera o peso de cada parte ou capítulo, e não apenas a quantidade de capítulos concluídos.

## 7. Requisitos Funcionais (RFs)

| ID | Nome | Necessidade | Classificação |
|---|---|---|---|
| RF-001 | Estrutura do livro | Permitir ao leitor cadastrar um livro e sua hierarquia: partes, capítulos e, opcionalmente, tópicos | Essencial |
| RF-002 | Descrição dos nós | Permitir ao leitor registrar em cada nó o título, um resumo da proposta e uma meta estimada (páginas, minutos ou peso no livro) | Essencial |
| RF-003 | Estado de leitura | Permitir ao leitor marcar cada nó como não iniciado, em andamento ou concluído, com registro das datas de início e conclusão | Essencial |
| RF-004 | Sumário interativo | Exibir ao leitor a estrutura como lista aninhada dobrável, com indicação de progresso por seção | Essencial |
| RF-005 | Caderno por capítulo | Oferecer ao leitor um espaço próprio de anotações em cada nó | Essencial |
| RF-006 | Tipos de anotação | Permitir ao leitor registrar conceitos-chave, citações com referência de página ou posição e ações/dúvidas | Essencial |
| RF-007 | Formatação rica | Permitir ao leitor usar formatação rica nas anotações, incluindo blocos de código | Essencial |
| RF-008 | Progresso ponderado | Exibir ao leitor um painel com o progresso geral do livro, ponderado pelo peso de cada parte | Essencial |
| RF-009 | Biblioteca pessoal | Permitir ao leitor ver seus livros e retomar qualquer um deles de onde parou | Essencial |
| RF-010 | Conteúdo privado | Garantir que cada leitor acesse apenas os próprios livros e anotações | Essencial |
| RF-011 | Visão em blocos | Exibir ao leitor a estrutura como cartões organizados por parte | Desejável |
| RF-012 | Diagramas nas anotações | Permitir ao leitor incluir diagramas simples nas anotações | Desejável |
| RF-013 | Ritmo e previsão | Estimar para o leitor a data de conclusão do livro, com base nos capítulos concluídos por semana | Desejável |
| RF-014 | Densidade de anotações | Destacar ao leitor os capítulos em que ele mais fez anotações | Desejável |

### Regras Visíveis ao Usuário

- **RF-003:** um nó com subnós passa a "concluído" quando todos os seus subnós estão concluídos.
- **RF-008:** concluir uma parte que representa 40% do livro avança o progresso geral em 40%.
- **RF-010:** não há como ver ou acessar livros e anotações de outro leitor.

## 8. Restrições e Expectativas de Negócio

- **Períodos Críticos:** não há períodos críticos no momento.
- **Volume e Intensidade de Uso:** não há estimativa de volume; por enquanto, há um único usuário.
- **Dados Sensíveis e Acesso:** o conteúdo cadastrado (estrutura, citações e anotações) é visível apenas a quem o cadastrou.
- **Regulação e Compliance:** o produto não deve infringir os direitos autorais das obras.
- **Continuidade da Operação:** uma interrupção do produto não é um problema no momento.

## 9. Premissas, Riscos e Mitigações

- **Premissa:** o leitor está disposto a cadastrar manualmente a estrutura do livro.
- **Risco Registrado:** o cadastro manual pode ser trabalhoso em livros longos e desestimular o uso → **Mitigação:** priorizar, no pós-MVP, a importação automática da estrutura.
