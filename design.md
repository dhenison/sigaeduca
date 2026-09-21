# DESIGN.md — SIGA EDUCA (Academic Core)

Fonte canônica: [`app/DESIGN.md`](./app/DESIGN.md)  
Tokens Tailwind: [`js/siga-theme.js`](./js/siga-theme.js)

## Marca

Dashboard institucional corporativo. Confiança, precisão e densidade de dados. âncora visual: azul-marinho `#1E3A8A` / `#00236F`.

| Papel | Hex | Uso |
|---|---|---|
| Primary | `#00236F` / `#1E3A8A` | Nav, botões primários, estados ativos |
| Secondary | `#BB0112` / `#DC2626` | Ocorrências, faltas, ações destrutivas |
| Tertiary | `#F59E0B` | Pendências, avisos, mérito |
| Canvas | `#F8FAFC` | Fundo da área de trabalho |
| Card | `#FFFFFF` | Painéis, tabelas |
| Borda | `#E2E8F0` | Frames e divisores |
| Texto | `#0F172A` / `#475569` / `#94A3B8` | Título / corpo / caption |

## Tipografia

**Inter** em todos os níveis. Numerais tabulares (`tnum`) em KPIs e grades. Sem Space Grotesk nem JetBrains Mono.

## Layout

- Sidebar: **240px** expandida, **72px** recolhida
- Top bar: **64px**
- Desktop ≥1280: 12 colunas, gutter 1.25rem
- Tablet: 8 colunas
- Mobile: drawer off-canvas, gutter 0.75rem

## Formas

- Controles e botões: 8px (`rounded-lg`)
- Cards e tabelas: 12–16px (`rounded-xl` / `rounded-2xl`)
- Chips de status: pill

## Elevação

Card: `0 1px 3px rgba(15, 23, 42, 0.05)` + borda 1px `#E2E8F0`.
