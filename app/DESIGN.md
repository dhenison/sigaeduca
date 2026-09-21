---
name: SIGA EDUCA — Academic Core
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#444651'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#bb0112'
  on-secondary: '#ffffff'
  secondary-container: '#e02928'
  on-secondary-container: '#fffbff'
  tertiary: '#3e2400'
  on-tertiary: '#ffffff'
  tertiary-container: '#5c3800'
  on-tertiary-container: '#ef9900'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#ffdad6'
  secondary-fixed-dim: '#ffb4ab'
  on-secondary-fixed: '#410002'
  on-secondary-fixed-variant: '#93000b'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
  headline-xl:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
This design system serves academic institutions, municipal school districts, teachers, secretaries, and school principals who require reliability, precision, and clarity under high-density data workloads. The visual language conveys institutional trust, modern administrative efficiency, and academic dignity.

The design movement is **Corporate / Modern** optimized for dense institutional dashboards, merging clean SaaS ergonomics with institutional rigor. Interfaces prioritize scannability, crisp hierarchical separation between administrative tiers (academic records, enrollments, grading, pedagogical metrics), and low visual fatigue during extended daily operation.

## Colors
The palette is built around an authoritative deep navy blue (`#1E3A8A`) as the anchor of the visual architecture, representing institutional legitimacy, safety, and operational focus.

- **Primary (`#1E3A8A` / `#1D4ED8`)**: Used for persistent primary navigation, header badges, primary buttons, active state sidebars, and critical school structure indicators.
- **Secondary (`#DC2626` / `#B91C1C`)**: The institutional signal color for urgent pedagogical occurrences, student absence thresholds, administrative sanctions, cancellation flows, and destructive action controls.
- **Tertiary (`#F59E0B` / `#FBBF24`)**: Used selectively for academic warnings, pending documentation, pending report card approval, merit badges, and medium-level pedagogical alerts.
- **Neutrals & Surfaces**: Main canvas background resides on `#F8FAFC`, cards and elevated panels on `#FFFFFF`, with structural dividers, table stripes, and card frames utilizing `#F1F5F9` and `#E2E8F0`. Text hierarchy ranges from `#0F172A` (headings) to `#475569` (body text) and `#94A3B8` (subtle captions).

## Typography
The system uses **Inter** across all typographic applications. Inter delivers superior legibility for tabular numbers, student matriculation codes, timestamps, and multi-level data grids.

- **Headlines & Titles**: Weighted between Semibold (600) and Bold (700) with compact line-heights to maintain space efficiency in portal headers and statistical summaries.
- **Body Text**: Rendered at Regular (400) and Medium (500) weights, optimized for fast parsing of student logs, grade sheets, and system notifications.
- **Tabular Numerals**: Numeric metrics within KPI cards, gradebooks, and attendance rates must activate OpenType `tnum` (tabular lining figures) to ensure vertical alignment across dense rows.

## Layout & Spacing
The layout follows a persistent multi-tier admin dashboard structure: a fixed or collapsible left navigation rail (240px expanded, 72px collapsed), an institutional top bar (64px height) with search and notification anchors, and a fluid main content canvas.

Content grids conform to a 12-column responsive layout:
- **Desktop (>= 1280px)**: 12 columns with 1.25rem (20px) gutters and 1.5rem (24px) outer margins. KPI metrics distribute across 4 or 5 equal metric tiles.
- **Tablet (768px - 1279px)**: 8 columns with 1rem gutters, collapsing multi-metric rows into 2x2 grids and converting dual-column chart grids to single-column blocks.
- **Mobile (< 768px)**: 4 columns with 0.75rem gutters and 1rem canvas margin. The sidebar collapses into a slide-over off-canvas drawer.

## Elevation & Depth
Elevation is maintained using low-contrast outlines paired with micro ambient drop shadows to maintain a clean, administrative aesthetic without muddying data density:

- **Level 0 (Base Canvas)**: Neutral surface (`#F8FAFC`) with no elevation.
- **Level 1 (Card & Module Surfaces)**: Pure white background (`#FFFFFF`) framed by a subtle 1px border (`#E2E8F0`) and a diffused shadow `0 1px 3px rgba(15, 23, 42, 0.05)`.
- **Level 2 (Hovered Cards & Interactive Controls)**: Elevated slightly with `0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Dropdowns, Floating Filters & Tooltips)**: Elevated with `0 10px 15px -3px rgba(15, 23, 42, 0.10)`.
- **Level 4 (Modals & Confirmation Sheets)**: Backed by an institutional backdrop overlay `rgba(15, 23, 42, 0.45)` with a modal shadow of `0 20px 25px -5px rgba(15, 23, 42, 0.15)`.

## Shapes
A balanced roundedness level of `2` (0.5rem / 8px for standard elements) provides a modern yet authoritative interface. 

- **Form controls, badges, and small buttons**: 0.5rem (8px).
- **Cards, dashboard panels, and data tables**: 0.75rem to 1rem (12px to 16px).
- **Metric icon pills & status tags**: Pill-rounded (9999px) or soft squircle (8px) for categorical identification.
- **Structural frames & container dividers**: Consistent 1px crisp lines with `#E2E8F0`.

## Components

### Buttons
- **Primary**: Background `#1E3A8A`, text `#FFFFFF`, rounded 8px, font-weight 500. Hover transitions to `#1D4ED8`. Active state deepens to `#172554`. Focus ring: 2px `#93C5FD` with 2px offset.
- **Destructive**: Background `#DC2626`, text `#FFFFFF`. Hover transitions to `#B91C1C`.
- **Secondary / Outline**: 1px solid border `#CBD5E1`, background `#FFFFFF`, text `#1E293B`. Hover state `#F8FAFC`.
- **Ghost / Action Icon**: Padding 8px, border-radius 8px, transparent background, text `#64748B`, hover background `#F1F5F9`.

### Metric & KPI Cards
- Base surface `#FFFFFF`, 1px border `#E2E8F0`, rounded 12px, padding 20px.
- Left-aligned icon badge contained in a 40x40px rounded container tinted at 10% opacity of the category color (e.g., Primary Blue for students, Yellow for attendance, Red for alerts/occurrences).
- Bold numeric value (24px, 700 weight) with clear textual labels and footer trend pill indicator showing status or percentage.

### Input Fields & Selects
- 1px border `#CBD5E1`, background `#FFFFFF`, text `#0F172A`, placeholder text `#94A3B8`.
- Height: 40px for standard inputs; 32px for compact table filters.
- Focus state: Border color transitions to `#1E3A8A` with a subtle box-shadow ring `0 0 0 3px rgba(30, 58, 138, 0.12)`.

### Badges & Status Chips
- **Success / Normal**: Background `#ECFDF5`, text `#065F46`, border `#A7F3D0`.
- **Alert / Occurrence**: Background `#FEF2F2`, text `#991B1B`, border `#FECACA`.
- **Attention / Pending**: Background `#FFFBEB`, text `#92400E`, border `#FDE68A`.
- **Informational / Class**: Background `#EFF6FF`, text `#1E40AF`, border `#BFDBFE`.
- Geometry: Height 22px, padding 2px 8px, rounded 9999px, text size 11px uppercase or 12px capitalized.

### Data Tables & Student Rosters
- Header: Background `#F8FAFC`, uppercase font-size 11px, tracking 0.05em, text `#64748B`, border bottom 1px solid `#E2E8F0`.
- Row: Alternating subtle hover `#F8FAFC`, height 48px, horizontal borders `#F1F5F9`.
- Cells: Text 13px/14px `#334155`. Numeric columns aligned right; status chips centered or left-aligned with icon bullets.