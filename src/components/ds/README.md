# Design system do painel (v3)

Nasceu na tela **Início** (`src/routes/dashboard/index.tsx`); toda tela nova do
painel é montada com estas peças.

## Ideia

O painel é uma **folha** (`bg-background`, cantos arredondados) apoiada sobre um
**canvas** bege (`bg-canvas`) onde mora o menu lateral claro. Dentro da folha
não há moldura de cartão: o espaço e fios finos separam as seções
(`Bloco`). Cartão só aparece onde o conteúdo é um objeto à parte: o destaque
da tela (`Foco`), o formulário numa gaveta.

## Princípios

1. **Cada seção carrega sozinha** (`QueryState`: carregando → erro com "tentar
   de novo" → vazio → conteúdo).
2. **O banco conta, o navegador mostra.** Números = `select("id", { count:
"exact", head: true })`; listas pedem só colunas e linhas usadas.
3. **Do número ao lead em um clique.** Linha de lead inteira abre a ficha
   (link esticado) e traz WhatsApp + CRM por cima. Busca em `Ctrl/⌘ + K`;
   `G` + letra navega (`shell/atalhos.tsx`).
4. **Gráfico simples é HTML/SVG** sem biblioteca (`AreaChart`, barras de
   proporção), com leitura em texto para leitor de tela.
5. **Cor tem significado.** Só tokens; nada de `bg-emerald-100` solto.
6. **Movimento com propósito.** Entrada em cascata (`Reveal`), contagem
   (`useContagem`), gaveta/modal com `--ease-out`; tudo respeita
   `prefers-reduced-motion`.

## Tokens (`src/styles.css`)

| Uso        | Classes                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Superfície | `bg-canvas` (fundo) · `bg-background` (folha) · `bg-card` (objeto)                                             |
| Estado     | `success` `warning` `info` `danger` (+ `-soft`), com par no modo escuro                                        |
| Gráficos   | `bg-chart-1…6` · `bg-chart-muted` · `bg-chart-track`                                                           |
| Sombra     | `--shadow-card` (folha) · `--shadow-pop` (menus, gaveta, modais)                                               |
| Tipografia | `font-display` (serifa) só em saudação e título de gaveta; resto `font-sans` · `num` para números de indicador |
| Movimento  | `--ease-out`; `animate-sheet-right`, `animate-pop`, `animate-veil`, `animate-rise`                             |

## Componentes (`src/components/ds`)

`Bloco` (seção) · `Chip` (filtro) · `AreaChart` · `Reveal` · `Pill` · `Avatar` ·
`Kbd` · `QueryState`/`SkeletonRows`/`PanelEmpty` · `CommandPaletteProvider`.
Shell em `src/components/shell` (menu recolhível `[`, barra superior, conta).
Formulários: `Input`/`Select`/`Textarea` (h-10, foco com anel suave) dentro de
gaveta (`Sheet`); veja `dashboard/lead-form-dialog.tsx` (`Secao`, `Campo`).

Telas compostas da Início: `components/dashboard/inicio/*`.

## Checklist de uma tela nova

- [ ] Cabeçalho (data, título, resumo, ações) e `Bloco` em cada seção
- [ ] Dados por hooks com `QueryState`; sem `select("*")`; limite e colunas explícitos
- [ ] Vendedor vê só a própria carteira (`useEscopo`)
- [ ] Cores só por token; claro e escuro conferidos
- [ ] 390 px e 1440 px conferidos; botão só com ícone tem `aria-label`
