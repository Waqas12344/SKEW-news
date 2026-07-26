# News Details Page Implementation

## Goal

Implement the Biasly news details page at `app/news/[id]/page.tsx` matching the attached UI reference pixel-perfectly. The page uses **static mock data** (same article used on the homepage). Supabase data fetching is wired in a later step.

---

## Skills Read

- `node_modules/next/dist/docs/01-app/` — App Router dynamic routes, `params` prop, server components
- Existing project patterns — `components/ui/*`, `components/homepage/*`, `globals.css` design tokens

---

## Existing Code Inspected

| File | Notes |
|------|-------|
| `app/page.tsx` | Has 12 MOCK_ARTICLES with exact shape used by ArticleCard |
| `app/layout.tsx` | Poppins font, Biasly metadata, no nav |
| `app/globals.css` | Full design tokens — colors, typography, radius, shadow, `.container-biasly` |
| `components/ui/article-card.tsx` | Full card used for Related Stories |
| `components/ui/bias-meter.tsx` | Three-segment bar |
| `components/ui/badge.tsx` | Sentiment / bias label badges |
| `components/ui/button.tsx` | Primary/secondary/outline/text variants |
| `components/homepage/SiteHeader.tsx` | Sticky header — reused on details page |
| `components/homepage/Footer.tsx` | Dark footer — reused on details page |
| `next.config.ts` | placehold.co in remotePatterns |

No `lib/`, `supabase/`, or `app/news/` exist yet.

---

## Visual Interpretation (pixel-perfect from UI reference)

### Overall Page Layout

Two-column layout on desktop (≥1024px):
- **Left main column** (~65% width): article content
- **Right sidebar** (~35% width, sticky `top-[72px]`): analysis panels
- Single column on mobile (sidebar stacks below article)
- Container max-width 1280px, gap 40px between columns

---

### Left Column — Article Content

#### Breadcrumb / meta
- `Politics · United States` — caption gray, 11px, top of page
- spacing: `pt-8`

#### Title
- H1 (32px bold): "Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report"
- margin-bottom: 12px

#### Byline row
- "By **David Morgan** · May 31, 2026 · 12 min read"
- Right side: Save icon (Bookmark), Share icon (Share2), "..." (MoreHorizontal) — lucide icons, 18px, gray
- Bottom border divider `#E5E7EB`, margin-bottom 16px

#### Hero image
- Full-width within left column, aspect-ratio 16/9, `rounded-lg`
- Caption below: "President Donald Trump in the Cabinet Room at the White House, Washington, D.C., May 30, 2026. Photo: Andrew Harnik/Getty Images." — 11px gray italic

#### Bias Distribution bar
- Label: "Bias Distribution ⓘ" — 13px medium
- The full BiasMeter component: L 20% | Center 31% | Right 49%
- "12 sources" below, 11px gray
- Wrapped in a light gray `#F6F6F6` rounded-lg box with padding

#### Article body
- 8 paragraphs of body text, 15px regular, line-height 1.75, `#0D0D0F`
- Uses mock body paragraphs matching the reference article

#### Related Stories section
- Heading: "Related Stories" — H3 (20px semibold), margin-bottom 16px
- `2×3 grid` (2 columns, 3 rows = 6 cards) on desktop, 1 col on mobile
- Each card is a compact horizontal card: small thumbnail left (80×80, rounded-md) + right: category · region (caption), title (14px semibold, 2-line clamp), date + read time
- This is a **new compact card** component `components/ui/related-article-card.tsx` — different from the full ArticleCard

#### Newsletter CTA strip
- Full-width gray `#F6F6F6` strip, rounded-lg, padding 24px
- Left: "Stay Informed. Stay Balanced." bold + sub-copy
- Right: email input + Subscribe button (primary)
- margin-top: 48px, margin-bottom: 0

---

### Right Sidebar (sticky)

Sidebar cards have: white bg, `rounded-lg`, border `#E5E7EB`, shadow-sm, padding 20px, gap 16px between cards.

#### Card 1 — Bias Analysis

Header row: "Bias Analysis" label (13px semibold) + ⓘ icon right

**Overall Bias badge**: large `Right 49%` badge — blue bg `#1D4ED8`, white text, 16px bold, rounded-md, `w-full text-center py-2`

Sub-label: "Based on 12 balanced sources" — 11px gray

**Bias breakdown table** (3 rows):
```
Left     20%   ████░░░░░  (red bar, width proportional)
Center   31%   ██████░░░  (gray bar)
Right    49%   █████████  (blue bar, full-ish)
```
Each row: label (11px gray w-16) | percentage (13px bold) | bar (flex-1, h-1.5 rounded-full bg-[color])

Analysis note: "Our analysis is based on the political leaning of the publication and how the story is framed. Sources are weighted by reliability and recency." — 11px gray, italic, margin-top 12px

**"How We Analyse Bias" button**: outline variant, full-width, size sm

---

#### Card 2 — AI Summary

Header: "AI Summary" + ⓘ + "Generated May 31, 2026 · 3 min read" — 11px gray

Bullet list (5 items), 13px body text, `text-[#0D0D0F]`, `leading-relaxed`, bullet `•` gray, gap 8px between items:
- The Trump administration has sent Iran a revised nuclear deal proposal with tougher terms...
- The proposal also demands unrestricted inspector access to all nuclear sites...
- Iran has not responded officially but says any deal must respect Iran's right to peaceful nuclear energy...
- The U.S. warns it is prepared to take other action if diplomacy fails...
- Israel supports the tougher stance, praising the administration's determination...

"All summaries can make mistakes." — 11px gray italic, margin-top 8px

**"Provide Feedback" button**: outline variant, full-width, size sm

---

#### Card 3 — Source Breakdown

Header: "Source Breakdown" + ⓘ

"12 Total Sources" — 13px semibold

Bias mini-bars (same style as Bias Analysis card):
```
Left    2 (20%)   ██░░░░  red
Center  4 (37%)   ████░░  gray
Right   6 (49%)   ██████  blue
```

**Top Sources** table label — 13px semibold, margin-top 8px

6 source rows (from reference):
| Source | Bias |
|--------|------|
| Fox News | Right (blue badge) |
| The Wall Street Journal | Center (gray badge) |
| Reuters | Center |
| BBC | Center |
| CNN | Left (red badge) |
| The New York Times | Center |
| The Washington Post | Center |
| Newsmax | Right |

Each row: source name (13px) | bias badge (xs, right-aligned)

**"View All Sources" button**: outline, full-width, sm

---

## Decisions / Assumptions

1. **Static mock data** — single article object inline in `app/news/[id]/page.tsx`. All `[id]` values show the same mock article for now (Supabase lookup added later).
2. **Dynamic route** `app/news/[id]/page.tsx` — Server Component. `params.id` is received but not used until Supabase is wired.
3. **New component** `components/ui/related-article-card.tsx` — compact horizontal thumbnail card for Related Stories grid.
4. **No new layout file** — `SiteHeader` and `Footer` imported directly into the page (same pattern as homepage).
5. **Sticky sidebar** — `sticky top-[72px]` (accounts for 52px header + 20px gap). On mobile sidebar stacks below article.
6. **BiasMeter reused** for the "Bias Distribution" section in the article body.
7. **generateStaticParams** — export a `generateStaticParams` function returning IDs 1–12 so the dynamic route pre-renders correctly at build time.
8. **No Clerk** — not yet integrated.
9. **`next/link` used** for all internal links.
10. **Newsletter strip** — no real form action, `type="email"` input + disabled `<Button>` for now. No server action yet.

---

## Files to Create / Change

| File | Action |
|------|--------|
| `app/news/[id]/page.tsx` | Create — full details page |
| `components/ui/related-article-card.tsx` | Create — compact horizontal card |

---

## Mock Article Data (inline in page)

```ts
const MOCK_ARTICLE = {
  id: "1",
  title: "Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report",
  category: "Politics",
  region: "United States",
  author: "David Morgan",
  publishedAt: "May 31, 2026",
  readTime: "12 min read",
  imageUrl: "https://placehold.co/1200x675/1a1a1a/ffffff?text=News+Article",
  imageCaption: "President Donald Trump in the Cabinet Room at the White House, Washington, D.C., May 30, 2026. Photo: Andrew Harnik/Getty Images.",
  leftPct: 20, centerPct: 31, rightPct: 49,
  sourcesCount: 12,
  overallBias: "right" as const,
  body: [/* 8 paragraphs */],
  summary: [/* 5 bullet points */],
  sources: [/* 8 source rows */],
}
```

## Related Stories Mock (6 compact cards, different articles from MOCK_ARTICLES on homepage)

---

## Component Details

### `components/ui/related-article-card.tsx`
Props:
```ts
interface RelatedArticleCardProps {
  title: string;
  category?: string;
  region?: string;
  publishedAt?: string;
  readingTime?: string;
  imageUrl: string;
  href?: string;
}
```
Layout: horizontal flex, image 80×80 rounded-md left, content right (category · region caption, title 14px semibold 2-line clamp, date + readTime footer).

---

## Security Requirements

- No `"use client"` on page or layout-level server components
- All components server-safe unless they use hooks/events

---

## Acceptance Criteria

- [ ] `/news/1` through `/news/12` all load without 404
- [ ] Two-column layout on desktop, stacked on mobile
- [ ] Bias Analysis sidebar card shows correct breakdown bars and overall badge
- [ ] AI Summary shows bullet list and feedback button
- [ ] Source Breakdown shows source rows with correct bias badges
- [ ] "Related Stories" shows 6 compact cards in 2-col grid
- [ ] Newsletter CTA strip renders at bottom of article
- [ ] `SiteHeader` and `Footer` present (same as homepage)
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

1. `npm run dev`
2. Open `http://localhost:3000/news/1`
3. Verify: two-col layout, article content, sticky sidebar, bias bars, AI summary bullets, source rows, related stories grid, newsletter strip, footer
4. Resize to 768px — sidebar stacks below article
5. Scroll down — sidebar stays sticky until it hits footer
6. Click any related story card — navigates to another `/news/[id]`
7. Go back, click browser back — returns to homepage correctly
