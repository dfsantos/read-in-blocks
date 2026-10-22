# Qualidade de UX: responsividade, acessibilidade e desempenho

Registro da revisão da US-025 (2026-10-21) e de como repeti-la. Vale para todas as telas do app.

## Como verificar

- **Acessibilidade e largura de celular:** `tests/e2e/accessibility.spec.ts` percorre todas as telas (login, biblioteca vazia e com livro, cadastro com erro, página do livro nas visões Sumário e Blocos, diálogo de exclusão, edição, caderno vazio, com o editor aberto e com anotações, e a página 404) e, em cada uma:
  - roda o axe (`@axe-core/playwright`) com as regras WCAG 2.0/2.1 A e AA e exige zero violações;
  - confere que a página não rola para o lado em 375 px;
  - salva capturas em 375, 768 e 1280 px em `test-results/screens/` (para revisão visual; não são comparadas automaticamente).
- **Desempenho:** Lighthouse 13.5.0 (`pnpm dlx lighthouse@13.5.0`) contra o build de produção local (`next start`), com a sessão passada por `--extra-headers` (cookie de uma conta de E2E) e o Chromium do Playwright em `CHROME_PATH`. Celular é o perfil padrão do Lighthouse (4G lento simulado e CPU 4× mais lenta); desktop usa `--preset=desktop`. Em produção, o Speed Insights da Vercel pode complementar (ver D-01).

## Exceção conhecida do axe

Um `treeitem` expandido do sumário contém o grupo dos filhos (padrão de árvore do ARIA), e a regra `label-content-name-mismatch` lê os nomes dos filhos como texto fora do nome do item. Só esse caso é ignorado no teste; o texto da própria linha é o nome inteiro do item.

## Resultado da revisão (2026-10-21)

Corrigido nesta história:

- **Fonte:** o token `--font-sans` apontava para si mesmo e todas as telas caíam na fonte serifada do navegador; agora usa a Geist carregada pelo layout.
- **Contraste (WCAG 1.4.3):** `--muted-foreground` e `--destructive` ficaram um pouco mais escuros, para manter 4,5:1 também sobre fundos cinza e sobre a tinta vermelha do botão de excluir; as iniciais do avatar usam a cor do texto.
- **Nome do menu do usuário (WCAG 2.5.3):** o botão tira o nome de um texto só para leitores de tela, em vez de um `aria-label` que deixava de fora as iniciais visíveis.
- **Estrutura no celular:** os botões de cada item espremiam o título numa coluna de uma letra; o título agora mantém ao menos 10rem e os botões quebram para a linha de baixo.
- **Foco após Subir/Descer (nota da US-012):** quando o item chega à ponta e o botão usado fica desabilitado, o foco vai para o outro botão do mesmo item.
- **Barra do editor (vinha da US-019, achada na US-022):** os botões não tiram mais o foco do editor ao clicar.
- **Páginas de estado:** 404 e erro em português, com saída para a biblioteca (e "Tentar de novo" no erro); endereço desconhecido também cai na 404. O texto vem do catálogo (`states.*`).
- **Carregamento:** não há `loading.tsx`. Com ele, o Next.js envia a página com status 200 antes de a própria página conferir o acesso, e o livro de outro leitor responderia 200 em vez de 404 (ADR-0008). Os estados de carregamento ficam nos componentes (editor, diagrama, botões com "Salvando…").
- **Textos:** mesma frase para a mesma situação (item que não existe mais, falha ao salvar, limites "no máximo", exclusão que não pode ser desfeita); chave sem uso removida.
- **Metadados:** todas as rotas têm título próprio (inclusive a 404); ícone do app (SVG, ICO e ícone da Apple) no lugar do padrão do framework.
- **CSP:** o Zod 4 testava `new Function` e gerava uma violação de CSP em toda página com formulário; agora roda em modo `jitless` (`src/domain/zod.ts`).

### Lighthouse

| Página | Perfil | Desempenho | Acessibilidade | Boas práticas | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Biblioteca | celular | 95 | 100 | 100 | 0,8 s | 2,8 s | 110 ms | 0 |
| Biblioteca | desktop | 100 | 100 | 100 | 0,2 s | 0,6 s | 0 ms | 0 |
| Livro | celular | 90 | 100 | 100 | 0,9 s | 3,4 s | 170 ms | 0 |
| Livro | desktop | 100 | 100 | 100 | 0,2 s | 0,7 s | 0 ms | 0 |
| Caderno | celular | 90 | 100 | 100 | 0,9 s | 3,5 s | 110 ms | 0 |
| Caderno | desktop | 100 | 100 | 100 | 0,3 s | 0,8 s | 0 ms | 0 |
| Login | celular | 96 | 100 | 100 | 1,1 s | 2,6 s | 120 ms | 0 |
| Login | desktop | 100 | 100 | 100 | 0,3 s | 0,6 s | 0 ms | 0 |

Livro com 12 capítulos e caderno com uma anotação. No perfil de celular, o LCP fica entre 2,6 s e 3,5 s (o limite "bom" do Core Web Vitals é 2,5 s), puxado pelo JavaScript da página sob CPU e rede simuladas lentas; não há layout shift. Ponto a acompanhar em produção, não bloqueante.
