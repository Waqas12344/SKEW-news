# Design System Implementation

## Goal

Implement the Biasly design system across the project so that all future UI work has a consistent, production-ready foundation that exactly matches the attached UI reference.

---

## Skills Read

- `node_modules/next/dist/docs/` — Next.js App Router conventions, font loading, CSS variables
- Tailwind CSS v4 docs — `@theme` inline config, CSS custom properties
- Existing project patterns (globals.css, layout.tsx)

---

## Existing Code Inspected

- `app/globals.css` — Tailwind v4 `@import "tailwindcss"` with `@theme inline` block; currently defines only basic background/foreground tokens and Geist fonts
- `app/layout.tsx` — Uses `Geist` and `Geist_Mono` from `next/font/google`; passes font CSS variables into `<html>`
- `package.json` — Next.js 16.2.11, React 19, Tailwind v4 via `@tailwindcss/postcss`
- `postcss.config.mjs` — `@tailwindcss/postcss` plugin only, no `tailwind.config.ts`
- No existing component library, no shadcn/ui installed yet

---

## Visual Interpretation (from UI reference)

### Brand
- Wordmark: **biasly** in bold black, lowercase; "News" in gray below it
- Tagline: "Balanced news coverage, powered by AI."

### Colors

**Primary (text)**
- Text Primary: `#0D0D0F`
- Text Secondary: `#8B7280` (shown as `#887280` in ref — using `#8B7280`)
- Surface: `#F6F6F6`

**Semantic**
- Left Bias: `#843318`
- Center Bias: `#E5E7EB`
- Right Bias: `#1D4ED8`

**Neutrals**
- BG Primary: `#FFFFFF`
- BG Secondary: `#F0F0F0`
- Border: `#E5E7EB`
- Divider: `#E5E7EB`

### Typography — Poppins font family

| Style       | Usage               | Size  | Weight    | Line Height |
|-------------|---------------------|-------|-----------|-------------|
| H1          | Page / Screen Title | 32px  | Bold 700  | 1.2         |
| H2          | Section Title       | 24px  | SemiBold 600 | 1.3      |
| H3          | Card / Module Title | 20px  | SemiBold 600 | 1.3      |
| H4          | Subheading          | 16px  | Medium 500 | 1.4        |
| Body Large  | Important content   | 16px  | Regular 400 | 1.6       |
| Body Medium | Body text           | 14px  | Regular 400 | 1.6       |
| Body Small  | Supporting text     | 13px  | Regular 400 | 1.6       |
| Caption     | Labels, meta text   | 11px  | Regular 400 | 1.4       |

### Spacing — 4px base unit
Tokens: 4, 8, 16, 24, 32, 40, 64px

### Grid System
- Container max-width: 1280px
- 12 columns
- Gutter: 24px
- Margin: 24px

### Shadows
- Small: `0px 1px 2px rgba(0,0,0,0.05)`
- Medium: `0px 4px 12px rgba(0,0,0,0.08)`
- Large: `0px 12px 24px rgba(0,0,0,0.12)`

### Border Radius
- Small: 4px
- Medium: 8px
- Large: 12px
- Full: 9999px

### Buttons

**Primary**: black bg `#0D0D0F`, white text; hover: slightly lighter (`#1a1a1a`)
**Secondary**: white bg, black border + text; hover: light gray bg
**Text button**: no bg/border, just text; hover: underline or slight bg
**Disabled**: muted gray, no pointer

**Outline**: white bg + border, text-colored label

### Chip / Category pill
- Light gray bg `#F0F0F0`, rounded-full, small text with `+` icon
- Active/hover: darker bg

### Bias Meter
- Three-segment horizontal bar: red (left %) | gray (center %) | blue (right %)
- Labels inside segments: "Left X%", "Center X%", "Right X%"
- Bar height: ~28px, rounded ends overall

### Icons
- Lucide React icons (line style, 2px stroke, rounded caps)

### Article Card
- Image top
- "Category · Region" meta line (caption gray text)
- H3 bold title
- Body Medium description (2-line clamp)
- Bias meter bar
- Footer: time ago + read time icons, sentiment/framing badge

---

## Decisions / Assumptions

1. Tailwind v4 uses `@theme inline` in CSS — all tokens defined in `globals.css`, no `tailwind.config.ts`
2. Poppins loaded via `next/font/google` in `layout.tsx`, replacing Geist Sans as the primary font; Geist Mono removed (not needed)
3. Dark mode support: remove dark mode automatic toggle — the design system is light-mode only (the reference shows no dark mode)
4. All tokens exposed as CSS custom properties so they can be used from both Tailwind utility classes and plain CSS
5. Lucide React will be installed for icons; shadcn/ui is deferred (not installed yet per package.json)
6. Component files live in `components/ui/` — reusable primitives only
7. `typecheck` script added to `package.json` since it is missing

---

## Files Likely to Change

| File | Change |
|------|--------|
| `package.json` | Add `lucide-react`; add `typecheck` script |
| `app/globals.css` | Full design system tokens in `@theme inline`; typography base styles |
| `app/layout.tsx` | Switch font to Poppins; update metadata |
| `components/ui/button.tsx` | Primary, Secondary, Text, Outline variants |
| `components/ui/chip.tsx` | Category chip / pill |
| `components/ui/bias-meter.tsx` | Three-segment bias bar |
| `components/ui/article-card.tsx` | News card matching reference |
| `components/ui/badge.tsx` | Sentiment / framing badge |

---

## Implementation Requirements

### 1. `globals.css`
- Keep `@import "tailwindcss"`
- Define all color, spacing, shadow, radius, and font tokens in `@theme inline`
- Token naming convention: `--color-*`, `--spacing-*`, `--shadow-*`, `--radius-*`
- Remove dark mode media query (light-mode only design)
- Set `font-family: var(--font-poppins)` on body
- Define typography utility classes as `@layer utilities`

### 2. `layout.tsx`
- Import `Poppins` from `next/font/google` with weights 400, 500, 600, 700
- Pass `--font-poppins` CSS variable to `<html>`
- Update metadata title to "Biasly — Balanced news coverage, powered by AI."

### 3. `components/ui/button.tsx`
- Client component with `variant` prop: `primary | secondary | text | outline`
- `size` prop: `sm | md | lg`
- `disabled` state styles
- Uses only Tailwind utility classes, no inline styles

### 4. `components/ui/chip.tsx`
- Category tag with optional `+` icon (using Lucide `Plus`)
- Variants: `default | active`
- Rounded-full, small text

### 5. `components/ui/bias-meter.tsx`
- Props: `left: number`, `center: number`, `right: number`
- Three contiguous colored segments proportional to percentages
- Labels inside segments when space allows (min 15% to show label)
- Red / gray / blue matching design tokens

### 6. `components/ui/badge.tsx`
- Sentiment badge: `positive | neutral | negative` → green / gray / red
- Small, rounded-full, uppercase caption text

### 7. `components/ui/article-card.tsx`
- Image (Next.js `Image` component, aspect ratio ~16:9)
- Meta: category · region (caption)
- Title: H3
- Description: 2-line clamp, body-medium
- Bias meter
- Footer: time-ago + read time + sentiment badge

---

## Security Requirements

- No server secrets in components
- No `"use client"` on server components
- `button.tsx`, `chip.tsx`, `bias-meter.tsx`, `badge.tsx`, `article-card.tsx` are all client or shared UI — mark `"use client"` only where event handlers or hooks are used (`button.tsx`, `chip.tsx`)

---

## Acceptance Criteria

- [ ] All design tokens from the reference are defined in `globals.css`
- [ ] Poppins font loads via `next/font/google`, no flash
- [ ] `Button` renders all four variants with correct colors and hover states
- [ ] `Chip` renders with and without active state
- [ ] `BiasMeter` renders correct proportional segments for any left/center/right triple
- [ ] `Badge` renders sentiment labels with correct colors
- [ ] `ArticleCard` renders with all fields populated
- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run build` succeeds

---

## Checks to Run

```bash
npm run typecheck
npm run lint
npm run build
```

---

## Manual Test Steps

1. Run `npm run dev`
2. Open `http://localhost:3000`
3. The home page currently shows placeholder content — after this implementation it will show the default Next.js page but using Poppins font
4. To visually verify components, temporarily add a design-system preview to `app/page.tsx` showing all button variants, a chip, a bias meter at 25/50/25, and an article card with mock data — then remove before committing
5. Check browser DevTools → Fonts to confirm Poppins is loaded
6. Check no console errors
