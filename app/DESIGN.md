---
name: Siga Educa Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#d0dbed'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dee9fc'
  surface-container-highest: '#d9e3f6'
  on-surface: '#121c2a'
  on-surface-variant: '#3e4a3f'
  inverse-surface: '#27313f'
  inverse-on-surface: '#eaf1ff'
  outline: '#6e7a6e'
  outline-variant: '#bdcabc'
  surface-tint: '#795900'
  primary: '#795900'
  on-primary: '#ffffff'
  primary-container: '#c39200'
  on-primary-container: '#412f00'
  inverse-primary: '#f9bd22'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#006d37'
  on-tertiary: '#ffffff'
  tertiary-container: '#2eaf62'
  on-tertiary-container: '#003a1a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdf9f'
  primary-fixed-dim: '#f9bd22'
  on-primary-fixed: '#261a00'
  on-primary-fixed-variant: '#5c4300'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#81fba5'
  tertiary-fixed-dim: '#64de8b'
  on-tertiary-fixed: '#00210c'
  on-tertiary-fixed-variant: '#005228'
  background: '#f8f9ff'
  on-background: '#121c2a'
  surface-variant: '#d9e3f6'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1440px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  sidebar-width: 260px
---

## Brand & Style
The design system is engineered for an educational SaaS environment that balances administrative rigor with an approachable, modern feel. Drawing inspiration from high-performance productivity tools like Linear and Notion, the style is **Corporate / Modern** with a focus on high-efficiency workflows. 

The brand personality is professional, organized, and optimistic. The aesthetic relies on a "Soft Minimalism" approach: generous whitespace, a structured grid, and subtle depth through tonal layering rather than aggressive borders. The goal is to reduce cognitive load for educators and administrators, providing a calm, focused environment for data management and pedagogical tracking.

## Colors
The palette is centered around a warm and energetic "Institutional Gold" that signals value and achievement. The primary yellow (`#FBBF24`) is used for core brand actions and primary buttons, while its lighter counterpart provides soft backgrounds for active states and subtle highlights.

Secondary blue and tertiary green are reserved for functional differentiation—blue (`#3B82F6`) for informative data or administrative tasks, and green (`#2EAF62`) for success states and growth tracking. The neutral palette is deliberately clean to reduce screen glare during long work sessions, while pure white is reserved for high-priority card surfaces to create a clear "layering" effect.

## Typography
The typographic system uses a tiered approach for maximum clarity. **Space Grotesk** is used for headlines, providing a technical yet friendly geometric character that feels modern and precise. 

For the vast majority of interface text, **Inter** is the workhorse font, chosen for its exceptional legibility in SaaS data tables and long-form pedagogical reports. **JetBrains Mono** is introduced sparingly for specialized labels, ID numbers, or data-dense indicators to provide a functional, "instrument-panel" aesthetic that differentiates static labels from dynamic content.

## Layout & Spacing
The design system employs a **Fluid Grid** model with fixed sidebar constraints. 

1.  **Sidebar:** A fixed 260px width on desktop. On mobile, the sidebar transitions to a bottom navigation bar or a hidden drawer.
2.  **Dashboard Layout:** Content resides in a fluid container with a 1440px max-width to prevent line lengths from becoming unreadable on ultra-wide monitors.
3.  **Spacing Rhythm:** An 8px base unit (4px for micro-adjustments) ensures vertical rhythm. Metric cards should utilize 24px internal padding (3 units) to feel airy and premium.
4.  **Responsive Tiers:** On tablet, gutters reduce to 16px. On mobile, the grid collapses to a single column with cards spanning the full width minus a 16px outer margin.

## Elevation & Depth
Depth in this system is achieved through **Tonal Layers** supplemented by **Ambient Shadows**. 

-   **Layer 0 (Background):** A clean, neutral-tinted canvas.
-   **Layer 1 (Cards/Sidebar):** `#FFFFFF` — Use a soft, 12% opacity shadow with a 16px blur and a 4px vertical offset to create a "lifted" effect.
-   **Layer 2 (Popovers/Modals):** High-elevation surfaces use a 20% opacity shadow and a 1px subtle border (`#E5E7EB`) to define the perimeter against white cards.

Avoid heavy dark borders. Instead, use thin, 1px lines in `#E5E7EB` to separate layout sections where tonal contrast is insufficient.

## Shapes
A core identifier of the system is the **16px (1rem)** border radius used for all primary containers and cards. This large radius softens the technical nature of educational data, making the software feel more human and modern.

Smaller components like buttons, input fields, and tags should follow a `rounded-md` (8px) rule to maintain a consistent geometric language while ensuring they don't look overly "circular" compared to the larger structural cards.

## Components

### Side Menu
The navigation uses a white background with a clean vertical list. Icons are rendered in the secondary blue (`#3B82F6`). Active states are marked with a subtle pill-shaped background in the primary gold (at 20-30% opacity) and a high-weight font label.

### Metric Cards
Large dashboard cards should feature a `headline-sm` title, a `display-lg` numeric value, and a small Sparkline or percentage indicator for trends. Internal padding must be a consistent 24px.

### Buttons
- **Primary:** Filled `#FBBF24` with high-contrast text. 8px corner radius.
- **Secondary:** Outlined with `#E5E7EB` and secondary blue text.
- **Ghost:** No background, used for low-priority actions in tables.

### Input Fields
Inputs should use a 1px border (`#E5E7EB`), turning to Secondary Blue on focus. Labels should use the `label-sm` style, positioned above the field to maximize horizontal space for data entry.

### Data Visualizations
Charts (Pie, Bar, Line) must exclusively use the primary, secondary, and tertiary palette: Gold (`#FBBF24`), Blue (`#3B82F6`), and Green (`#2EAF62`). Always use rounded bar caps and soft line tension to match the system's shape language.