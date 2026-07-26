# Homepage Implementation

## Goal

Replace the default `app/page.tsx` scaffold with the full Biasly homepage matching the attached UI reference — pixel-perfect layout with a sticky header/nav, scrollable category filter bar, "Top News" 3-column article grid, and a footer. The page uses **static mock data** since Supabase is not wired up yet; data fetching from Supabase will be added in a later step.

---

## Skills Read

- `node_modules/next/dist/docs/01-app/` — App Router conventions, project structure, server vs client components
- Existing project patterns — `components/ui/*`, `globals.css` design tokens

---

## Existing Code Inspected

| File | Status |
|------|--------|
| `app/page.tsx` | Default Next.js scaffold — **fully replaced** |
| `app/layout.tsx` | Poppins font, Biasly metadata, no nav |
| `app/globals.css` | Full design token system — colors, typography, spacing, radius, shadow, `.container-biasly` |
| `components/ui/article-card.tsx` | Existing — will be used directly |
| `components/ui/bias-meter.tsx` | Existing — already used by ArticleCard |
| `components/ui/badge.tsx` | Existing — already used by ArticleCard |
| `components/ui/button.tsx` | Existing — used in header (Subscribe, Login) |
| `components/ui/chip.tsx` | Existing — used for category filter pills |

No `lib/` directory exists yet — Supabase integration is a future step.

---

## Visual Interpretation (pixel-perfect from UI reference)

### Overall Layout
- White background
- Full-width sticky header at top
- Thin secondary nav bar directly below header with scrollable category chips
- Body: `container-biasly` max-width 1280px, horizontal padding 24px
- "Top News" heading → 3-column responsive grid of article cards
- Footer: dark `#0D0D0F` background, 4-column links layout + brand + copyright

---

### Header (sticky, `z-50`)
- Height: ~52px
- Left: hamburger menu icon + **biasly** wordmark (bold black, "News" smaller below in gray) 
- Center nav links: `Home` | `For You` | `Local` | `Blindspot` — 14px medium, `Home` is active (underline or bold)
- Right: `Subscribe` (primary black button, size sm) + `Login` (outline button, size sm)
- Bottom border: `1px solid #E5E7EB`
- Background: white
- Top info bar above header (visible in reference): "Browser Extension · Theme: Light Dark Auto · Monday, June 1, 2026 · Set Location · International Edition ↓" — 11px gray text, full-width, `#F6F6F6` background, border bottom. This is optional chrome — implement as a simple `<div>` but do not over-engineer.

### Category Filter Bar
- Full-width, horizontally scrollable, no scrollbar visible (`overflow-x: auto; scrollbar-width: none`)
- Background: white, bottom border `1px solid #E5E7EB`
- Padding: `8px 0`
- Pills: use existing `Chip` component with `showPlus`
- Categories from reference: `World Cup`, `IPL`, `Social Media`, `Business & Markets`, `Health & Medicine`, `Soccer`, `Artificial Intelligence`, `Arsenal FC`, `Extreme Weather and Disasters`
- Left and right scroll arrows (chevron icons, lucide) — faded white gradient overlay on each edge
- No active state needed (all default) — this is a static strip for now

### Main Content
- Top padding: `32px`
- Section heading "Top News" — `text-h2` (24px semibold), margin-bottom `24px`
- Grid: `3 columns` on desktop (≥1024px), `2 columns` on tablet (≥640px), `1 column` on mobile
- Gap: `24px`
- 12 article cards total (4 rows × 3 cols) — all mock data

### Article Card (from `components/ui/article-card.tsx`)
The existing component already has the right structure. Each card shows:
- Image (16:9 aspect ratio)
- Category · Region (caption, uppercase, gray)
- Title (H3, 20px semibold, 3-line clamp)
- Bias meter (left/center/right segments)
- Footer: "N sources" left, no reading time in this view (replace readingTime with sources count)
- No description shown in grid view (omit description prop)

The existing `ArticleCard` component will be used as-is with `description` omitted. The "N sources" is rendered as a separate footer element below the bias meter inside the card — we will not modify the card component; instead the mock data will pass `publishedAt` as "N sources" (since the component accepts that as a string).

Actually — to keep it clean: keep `ArticleCard` unchanged, pass `publishedAt` as `"12 sources"` since it accepts any string and shows it with a Clock icon. For the homepage this is acceptable.

### Footer
- Background: `#0D0D0F` (brand black)
- Text: white / gray
- Layout: 4-column on desktop, stacked on mobile
  - **Col 1 — Brand**: `biasly` wordmark in white, "News" sub-label, tagline "Balanced news coverage powered by AI."
  - **Col 2 — Company**: About, Careers, Press, Contact
  - **Col 3 — Help**: Help Center, Guides, Privacy Policy, Terms of Service
  - **Col 4 — Connect**: X (Twitter), LinkedIn, Instagram, YouTube icons (lucide or simple SVG)
- Bottom strip: `© 2026 Biasly News. All rights reserved.` — 11px gray, centered, top border divider

---

## Decisions / Assumptions

1. **Static mock data only** — 12 articles hardcoded in `app/page.tsx`. No Supabase calls. This matches AGENTS.md section 5 ("UI must display stored data only") — data fetching wires in later.
2. **`app/page.tsx` is a Server Component** — no `"use client"` on the page itself. Interactive filter chips are inside `components/homepage/CategoryBar.tsx` which is `"use client"`.
3. **New components created**: `components/homepage/SiteHeader.tsx` (server), `components/homepage/CategoryBar.tsx` (client), `components/homepage/Footer.tsx` (server). These are page-level layout components, not generic UI primitives, so they live in `components/homepage/` not `components/ui/`.
4. **`ArticleCard` is reused unchanged** — `description` simply omitted, `publishedAt` carries "N sources" text, no `readingTime`.
5. **No Clerk integration yet** — Subscribe/Login are plain buttons with no `onClick`. Clerk is wired in a separate step.
6. **Top info bar** — implemented as a simple static `<div>` bar, not a component.
7. **Responsive**: 1 col mobile, 2 col tablet (`sm:`), 3 col desktop (`lg:`).
8. **Next.js `Image`** uses `placehold.co` URLs for mock images — need to add `placehold.co` to `next.config.ts` `images.remotePatterns`.
9. **No scroll-lock / active state management** on the category filter for now.

---

## Files To Create / Change

| File | Action |
|------|--------|
| `app/page.tsx` | Replace entirely — static homepage |
| `components/homepage/SiteHeader.tsx` | Create — sticky header |
| `components/homepage/CategoryBar.tsx` | Create — "use client", scrollable chip strip |
| `components/homepage/Footer.tsx` | Create — dark footer |
| `next.config.ts` | Add `placehold.co` to `images.remotePatterns` |

---

## Mock Data

12 articles matching the reference (same titles, categories, regions, bias percents):

1. Politics · United States — Trump Sends Iran Revised Peace Proposal... — L20 C31 R49 — 12 sources
2. Health · United States — Researchers Make Case for Grapes as a 'Superfood'... — L18 C42 R40 — 7 sources
3. Science · Switzerland — CERN Finds High-Significance Hint of Physics... — L18 C62 R22 — 8 sources
4. World · Nicaragua — Indigenous Leader Brooklyn Rivera Dies... — L54 C28 R18 — 63 sources
5. World · Middle East — UN Security Council to Hold Emergency Meeting... — L22 C35 R43 — 15 sources
6. Business · Global — Oil Prices Dip as OPEC+ Considers Output Increase... — L25 C50 R25 — 11 sources
7. Technology · United States — SpaceX Launches Starship Test Flight in Milestone... — L12 C45 R43 — 9 sources
8. Business · United States — Apple Unveils AI-Powered Features Across iPhone, iPad and Mac — L15 C40 R45 — 10 sources
9. Climate · Global — 2025 on Track to Be Among Top 3 Hottest Years... — L33 C34 R33 — 14 sources
10. Economy · United States — Fed Holds Rates Steady, Signals Caution... — L30 C45 R25 — 13 sources
11. Soccer · Europe — Real Madrid Win Champions League After Comeback Victory... — L10 C20 R70 — 26 sources
12. Environment · Canada — Wildfires Force Thousands to Evacuate Across Western Canada — L27 C33 R40 — 17 sources

All images use `https://placehold.co/600x338/1a1a1a/ffffff?text=News` (dark placeholder).

---

## Implementation Requirements

### `next.config.ts`
- Add `placehold.co` to `images.remotePatterns` so `next/image` does not throw

### `components/homepage/SiteHeader.tsx` (server component, no directive)
- Sticky, `z-50`, white bg, bottom border
- Left: `Menu` icon (lucide, 20px) + biasly wordmark (bold 20px black "biasly", 11px gray "News" below)
- Center: nav links `Home | For You | Local | Blindspot` — `Home` shown with bottom-border active style
- Right: `<Button variant="primary" size="sm">Subscribe</Button>` + `<Button variant="outline" size="sm">Login</Button>`
- Full responsive: on mobile hide center nav, keep logo + right buttons

### `components/homepage/CategoryBar.tsx` ("use client")
- `overflow-x-auto` horizontal scroll, `scrollbar-width: none` / webkit scrollbar hidden via inline style or CSS
- Render chips for all 9 categories using `<Chip label="..." showPlus />`
- Container padding: `8px 24px`
- No active state for now
- Left/right scroll gradient overlays (pseudo-element via `before:/after:` or simple `<div>` overlay with pointer-events-none)

### `components/homepage/Footer.tsx` (server component)
- Dark bg `#0D0D0F`
- Biasly brand col + Company links col + Help links col + Connect icons col (use Lucide `Twitter`, `Linkedin`, `Instagram`, `Youtube`)
- Copyright strip at bottom

### `app/page.tsx` (server component)
- Import `SiteHeader`, `CategoryBar`, `Footer`
- Render info bar (simple `<div>`)
- Render `SiteHeader`
- Render `CategoryBar`
- Main content: `container-biasly`, "Top News" heading, `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6`
- Map over 12 mock articles and render `<ArticleCard />` for each

---

## Security Requirements

- No secrets in any component
- No `"use client"` on `app/page.tsx`, `SiteHeader`, or `Footer`
- Only `CategoryBar` is client (needs scroll state/interaction)

---

## Acceptance Criteria

- [ ] Homepage loads at `http://localhost:3000` showing the full biasly layout
- [ ] Poppins font renders on all text
- [ ] Header is sticky — scrolling down keeps it visible
- [ ] Category bar scrolls horizontally, no visible scrollbar
- [ ] 12 article cards appear in 3-column desktop grid
- [ ] Each card shows image, category · region, title, bias meter, sources
- [ ] Bias meter segments are proportionally correct for each article
- [ ] Footer shows brand, links, social icons, and copyright
- [ ] Responsive: 2-col at 768px, 1-col at mobile
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — succeeds

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
3. Verify: Poppins font, sticky header, category filter, 3-col card grid, footer
4. Resize to 768px — verify 2-col grid
5. Resize to 375px — verify 1-col grid, header collapses nav
6. Scroll down — verify header stays fixed
7. Scroll category bar — verify horizontal scroll works, no visible scrollbar
