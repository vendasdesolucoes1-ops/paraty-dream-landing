# Design system do painel

Criado na tela **Início** (`src/routes/dashboard/index.tsx`). Toda tela nova do
painel é montada com estas peças; a tela Início é o exemplo vivo de cada uma.

## Princípios

1. **Cada seção carrega sozinha.** Uma consulta lenta ou com erro não segura
   nem derruba o resto da página (`QueryState`: carregando → erro com "tentar de
   novo" → vazio → conteúdo).
2. **O banco conta, o navegador mostra.** Nunca baixar uma tabela inteira para
   contar ou agrupar. Números = `select("id", { count: "exact", head: true })`;
   listas pedem só as colunas e as linhas que aparecem na tela.
3. **Do número ao lead em um clique.** Todo indicador leva para onde se age
   (`KpiCell to=…`), e toda linha de lead tem WhatsApp + abrir no CRM
   (`LeadAcoes`). Busca global em `Ctrl/⌘ + K`.
4. **Gráfico simples é HTML.** Barras de proporção e colunas em CSS: nítidas em
   qualquer tela, sem biblioteca, acessíveis (texto para leitor de tela).
5. **Cor tem significado.** Só tokens; nada de `bg-emerald-100` solto.

## Tokens (`src/styles.css`)

| Uso        | Classes                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Estado     | `text-success` `bg-success-soft` · `warning` · `info` · `danger` (todos com par no modo escuro) |
| Gráficos   | `bg-chart-1…6` (categorias, nesta ordem) · `bg-chart-muted` · `bg-chart-track` (trilho)         |
| Superfície | `bg-background` (fundo) · `bg-card` + `border-border` + `shadow-[var(--shadow-card)]`           |
| Texto      | `text-foreground` · `text-muted-foreground`                                                     |
| Marca      | `font-display` só em título de página e saudação; títulos de painel levam `font-sans`           |
| Número     | `num-display`: serifa da marca com algarismos alinhados, para indicadores grandes               |

Estado de lead: `STATUS_TONE` / `STATUS_LABEL` em `src/lib/lead-status.ts`.
Origens: `ORIGENS` (inclui as importadas por extratores, que não entram em
"novos hoje").

## Componentes

| Componente                                     | Para quê                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `PageHeader`                                   | Título da página + contexto de uma linha + ações                 |
| `KpiStrip` · `KpiCell`                         | Faixa de indicadores numa só superfície; célula inteira é o link |
| `Sparkbars`                                    | Mini-gráfico de colunas dentro de um indicador                   |
| `Panel` (`flush` para listas de linha inteira) | Envelope de toda seção: título, descrição, ação, corpo           |
| `Segmented`                                    | Troca de visões no mesmo painel ("Para agir \| Recentes")        |
| `QueryState` · `SkeletonRows` · `PanelEmpty`   | Carregando / erro / vazio padronizados                           |
| `Pill`                                         | Etiqueta de estado (`tone`)                                      |
| `Avatar` · `Kbd`                               | Iniciais e tecla de atalho                                       |
| `CommandPaletteProvider` · `useCommandPalette` | Busca global (páginas + leads)                                   |

Formatação (número, data relativa, telefone, WhatsApp): `src/lib/format.ts`.
Navegação e regras de acesso por perfil: `src/components/dashboard/nav.ts`
(sidebar e busca leem do mesmo lugar).

## Shell (`src/components/shell`)

Menu lateral recolhível (248 px ↔ 68 px; no celular vira gaveta), barra
superior com breadcrumb, busca e tema, e menu da conta. O estado do menu fica
salvo no navegador (`moradas-sidebar`); atalho `[`, botão na barra e ação na
busca (`Ctrl/⌘ + K` → "Recolher o menu"). Itens e permissões vêm de
`components/dashboard/nav.ts`.

Ações por linha (`LeadAcoes`) aparecem ao passar o mouse ou focar a linha e
ficam sempre visíveis em toque; a linha-pai precisa de `group/linha`.

## Tema

`DashboardThemeProvider` põe `.dark` no `<html>` (não numa div), então
diálogos, gavetas e toasts, que renderizam em portal, também escurecem. A
escolha fica salva no navegador.

## Checklist de uma tela nova

- [ ] `PageHeader` no topo e `Panel` em cada seção
- [ ] Dados por hooks com `QueryState` (nada de `isLoading ? … : …` à mão)
- [ ] Sem `select("*")` e sem baixar listas inteiras; limite e colunas explícitos
- [ ] Vendedor vê só a própria carteira (`useEscopo`)
- [ ] Cores só por token; claro e escuro conferidos
- [ ] 390 px e 1440 px conferidos; botão só com ícone tem `aria-label`
