---
name: Institutional Node & Fleet Safety Console
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
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006398'
  on-secondary: '#ffffff'
  secondary-container: '#5bb8fe'
  on-secondary-container: '#00476e'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002113'
  on-tertiary-container: '#009668'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#cce5ff'
  secondary-fixed-dim: '#93ccff'
  on-secondary-fixed: '#001d31'
  on-secondary-fixed-variant: '#004b73'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.015em
  body-default:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: -0.005em
  body-medium:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: -0.005em
  body-compact:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
  label-code:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: -0.01em
  label-code-compact:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '400'
    lineHeight: 0.875rem
    letterSpacing: 0em
  label-ui:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
  metric-stat:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.25rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system establishes a high-density, mission-critical operations console for on-premise institutional networks, lab clusters, and enterprise fleet surveillance. Inspired by the tactical precision of Linear, the real-time vigilance of Netdata and Uptime Kuma, and the polished minimalism of Vercel, the aesthetic balances authoritative calm with immediate data comprehension.

### Design Principles
- **Unobtrusive Utilitarianism:** Visual styling defers entirely to metric clarity. Surfaces recede; status indicators advance.
- **Instrument Precision:** Every element respects strict tabular metrics, fine 1px structural demarcations, and explicit spatial boundaries.
- **Low-Latency Signaling:** Semantic color states (nominal, latency alert, intrusion, offline) are hyper-focused and never diluted with decorative tinting.
- **High-Information Density:** Dense information architecture built for 1440px+ command environments where multiple real-time streams, telemetry grids, and security audits coexist without cognitive friction.

## Colors

The system uses a calibrated cool-slate spectrum on a crisp, light-mode ground. Contrast ratios meet strict WCAG AAA guidelines for mission-critical monitoring readability.

### Surface Hierarchy & Foundation
- **Canvas Base:** `#FFFFFF` (Primary backdrop for core data cards and focus tables)
- **Sub-canvas / Shell:** `#F8FAFC` (App shell, navigation rail, persistent inspector drawers)
- **Muted Inset / Table Headers:** `#F1F5F9` (Nested telemetry panels, inactive tabs, column headers)
- **Hairline Dividers:** `#E2E8F0` (Structural grid dividers, micro-borders)

### Typography & Neutrals
- **Primary Ink:** `#0F172A` (Titles, telemetry numbers, high-priority node names)
- **Secondary Ink:** `#334155` (Labels, column headings, path segments)
- **Tertiary / Subdued:** `#64748B` (Timestamps, metadata keys, inactive placeholders)

### Status & Semantic Signaling
Semantic colors are used strictly for status indicators, micro-badges, and threshold sparklines:
- **Nominal / Online:** `#10B981` (Emerald 500) paired with `#ECFDF5` container fills.
- **Attention / High Latency:** `#F59E0B` (Amber 500) paired with `#FFFBEB` container fills.
- **Critical / Threat / Link Down:** `#F43F5E` (Rose 500) paired with `#FFF1F2` container fills.
- **Fleet Infrastructure / Gateway / LAN:** `#0284C7` (Sky 600) paired with `#F0F9FF` container fills for port mapping, switches, and active route channels.

## Typography

The typography strategy leverages **Inter** for operational UI and tabular legibility, combined with **JetBrains Mono** for machine-level identifiers (IPv4/IPv6 addresses, MAC tables, subnets, packet sizes, and ports).

### Typographic Hierarchy Rules
- **Numerical Figures:** Enable `tnum` (tabular numbers) and `cv02`, `cv03`, `cv04` features on Inter so telemetry data, throughput gauges, and ping values do not jitter during real-time streaming updates.
- **Labels and System Keys:** System-level metadata keys (e.g., `MTU`, `GATEWAY`, `UPTIME`) use uppercase `label-ui` with a subtle letter spacing of `0.04em`.
- **Monospace Isolation:** Never render IP addresses, CIDR blocks, or hardware hashes in proportional sans-serif. Always route through `label-code` or `label-code-compact`.

## Layout & Spacing

The layout is built for high-throughput, desktop-first monitoring workstations with a baseline target of 1440px wide, scaling fluidly across wider displays and collapsing gracefully on smaller review tablets.

### Grid & Composition
- **Shell Structure:** Persistent 240px left-hand control rail, a fixed top-level navigation/status bar (48px high), and a primary multi-panel monitoring viewport.
- **Data Worksurface:** A 12-column fluid grid system utilizing `gutter-desktop` (1.25rem) spacing. Diagnostic widgets, throughput graphs, and node tables span configurations of 3, 4, 6, or 12 columns.
- **Micro-Scale Spacing:** Component internal padding uses compact steps (`space-xs` = 4px, `space-sm` = 8px, `space-md` = 12px) to maximize screen real estate and visible row counts without sacrificing hit target clarity.

## Elevation & Depth

This design system rejects heavy blur drop-shadows and skeuomorphic gradients in favor of sharp, planar separation driven by hairline borders and low-contrast surface stratification.

### Surface Stratification
- **Level 0 (App Canvas):** `#F8FAFC` — Recessed utility background for surrounding frames, search strips, and utility gutters.
- **Level 1 (Card & Module Ground):** `#FFFFFF` — Raised panels bordered by `1px solid #E2E8F0`.
- **Level 2 (Nested / Recessed Telemetry):** `#F1F5F9` — Used inside cards to highlight terminal outputs, metric buckets, and table headers.

### Depth & Overlays
- **Drop Shadows:** Shadows are restricted to modal confirmation alerts and floating context dropdowns: `0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`.
- **Interactive Focus:** Keyboard focus and cursor selection are indicated via crisp 1px perimeter outlines in `#0284C7` (Sky 600) with a 2px offset or subtle inner ring glow (`rgba(2, 132, 199, 0.15)`).

## Shapes

The geometric framework balances technical rigor with modern ergonomics. Corner radii adhere strictly to an 8px (`0.5rem`) default, scaling down to 6px for micro-badges and up to 10px–12px for primary structural viewport containers.

### Shape Tokens
- **Default (Controls, Badges, Fields):** `0.5rem` (8px)
- **Large (Panels, Cards, Tables):** `0.625rem`–`0.75rem` (10px–12px)
- **Full Radius (Pills):** `9999px` reserved strictly for status pills and online indicator dots.

## Components

### Status Pills & Ping Indicators
- **Structure:** Height of 20px, inline-flex, padded `space-xs` vertically and `space-sm` horizontally. Pill radius (`9999px`).
- **Nominal State (Online):** 6px circular dot (`#10B981`) with optional slow pulse ring, paired with `label-code-compact` text (`#065F46`) on `#ECFDF5` background.
- **Degraded/Warning:** Dot `#F59E0B`, text `#92400E` on `#FFFBEB`.
- **Critical/Down:** Dot `#F43F5E`, text `#9F1239` on `#FFF1F2`.

### Telemetry Tables
- **Header:** Height 32px, surface `#F1F5F9`, border-bottom `1px solid #E2E8F0`. Text formatted in `label-ui` (`#64748B`).
- **Rows:** Height 40px, surface `#FFFFFF`, alternating hover state to `#F8FAFC`. Border-bottom `1px solid #E2E8F0`.
- **Cell Alignment:** Numeric performance data (CPU, RAM, packet drops) and timestamps right-aligned using tabular figures (`tnum`). Hostnames left-aligned. IP/MAC addresses formatted as monospace badges.

### Badges (Monospace Hardware & Network)
- **Visuals:** JetBrains Mono, `label-code-compact`. Padding 2px 6px.
- **Palette:** `#F1F5F9` background, `#334155` text, fine border `1px solid #CBD5E1`.
- **Usage:** MAC addresses (`AA:BB:CC:11:22:33`), IPv4/IPv6, VLAN IDs, and daemon port references (`:8080`, `:22`).

### Input Fields & Search Bars
- **Dimensions:** 32px or 36px height, font `body-default`.
- **Resting:** Background `#FFFFFF`, border `1px solid #CBD5E1`, text `#0F172A`.
- **Active / Focused:** Border `1px solid #0284C7`, ring `2px rgba(2, 132, 199, 0.12)`.
- **Quick Filters:** Prefix icon with subtle keyboard shortcut indicator (e.g., `⌘K`) positioned right-aligned in `label-code-compact` (`#94A3B8`).

### Buttons
- **Primary:** Background `#0F172A`, text `#FFFFFF`, border none, hover `#1E293B`. Font `body-medium`. Height 32px (compact) or 36px (standard).
- **Secondary / Outline:** Background `#FFFFFF`, border `1px solid #CBD5E1`, text `#334155`, hover `#F8FAFC`.
- **Destructive (Isolate Machine, Terminate Socket):** Background `#FFF1F2`, text `#E11D48`, border `1px solid #FECDD3`, hover `#FFE4E6`.

### Cards & Container Panels
- **Structure:** Background `#FFFFFF`, border `1px solid #E2E8F0`, corner radius 10px.
- **Header Slot:** 44px height, display flex, items centered, justify space-between, padded `0 space-lg`. Separated from body via `1px solid #E2E8F0`.
- **Body Slot:** Padded `space-lg`.

### Breadcrumbs
- **Hierarchy:** Separated by subtle forward slashes (`/`, `#CBD5E1`).
- **Segment Style:** Ancestor segments in `body-compact` (`#64748B`), active leaf segment in `body-medium` (`#0F172A`).