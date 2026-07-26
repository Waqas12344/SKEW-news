# Clerk Authentication Implementation

## Goal

Add Clerk authentication to the Biasly Next.js app. This includes installing the SDK, wrapping the app with `ClerkProvider`, setting up the middleware proxy, creating sign-in and sign-up routes using Clerk's hosted components, updating the `SiteHeader` to show auth-aware UI (UserButton when signed in, Login/Sign up when signed out), and protecting any routes that should require authentication.

---

## Skills Read

- `.agents/skills/clerk/SKILL.md` — router, version detection
- `.agents/skills/clerk-setup/SKILL.md` — setup process, ClerkProvider placement, shadcn theme, pitfalls
- `.agents/skills/clerk-nextjs-patterns/SKILL.md` — server vs client, middleware strategies, mental model
- `.agents/skills/clerk-nextjs-patterns/references/middleware-strategies.md` — public-first matcher config, `proxy.ts` file
- `.agents/skills/clerk-nextjs-patterns/references/server-vs-client.md` — `await auth()`, `useAuth`, `useUser` patterns
- `.agents/skills/clerk-nextjs-patterns/references/api-routes.md` — 401/403 patterns

---

## Existing Code Inspected

- `package.json` — Next.js 16.2.11, React 19.2.4, no `@clerk/nextjs` yet
- `app/layout.tsx` — no ClerkProvider; wraps `<html>` and `<body>` directly
- `app/page.tsx` — public home page with mock articles; must stay public
- `components/homepage/SiteHeader.tsx` — currently shows static Login + Subscribe buttons; needs auth-aware UI
- `.env.local` — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` already set
- `proxy.ts` / `middleware.ts` — neither exists; must create `proxy.ts`
- `components.json` — does not exist; no shadcn theme needed for Clerk

---

## Decisions and Assumptions

1. **SDK version**: Install latest `@clerk/nextjs` (v7+, current SDK). No Core 2 patterns.
2. **Middleware strategy**: Public-first — home page `/`, `/sign-in`, `/sign-up`, `/api/public/**` are public. `/news/[id]` (news details pages) are **protected** — unauthenticated users are redirected to `/sign-in`. Admin action routes (`/api/scrape`, `/api/analyze`, etc.) are protected by `BIASLY_ADMIN_SECRET` separately (section 15 of AGENTS.md), not by Clerk middleware.
3. **Proxy file**: Use `proxy.ts` in the project root (Next.js 16, not ≤15 middleware.ts).
4. **Sign-in / Sign-up routes**: Create `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx` using Clerk's `<SignIn />` and `<SignUp />` components. These are centered, minimal pages matching the site's visual style.
5. **SiteHeader**: Convert to a client component so it can use `useUser` / `useAuth`. When signed in: show `<UserButton />` from `@clerk/nextjs` and hide the Login button. When signed out: show Login (links to `/sign-in`) and Subscribe buttons as-is.
6. **ClerkProvider**: Placed inside `<body>` in `app/layout.tsx` (current SDK requirement).
7. **Env variables**: Already in `.env.local`. Add the sign-in/sign-up redirect URL env vars per AGENTS.md canonical list:
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
   - `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
   - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`
   - `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`
8. **No shadcn Clerk theme**: `components.json` does not exist; plain Clerk components are used.
9. **`<ClerkProvider dynamic>`**: Not needed for the current public-first layout — no forced dynamic rendering required.

---

## Files Likely to Change

| File | Change |
|------|--------|
| `package.json` | Add `@clerk/nextjs` dependency |
| `app/layout.tsx` | Wrap children with `<ClerkProvider>` inside `<body>` |
| `proxy.ts` | **Create** — `clerkMiddleware` with public-first config |
| `app/sign-in/[[...sign-in]]/page.tsx` | **Create** — Clerk `<SignIn />` centered page |
| `app/sign-up/[[...sign-up]]/page.tsx` | **Create** — Clerk `<SignUp />` centered page |
| `components/homepage/SiteHeader.tsx` | Add `'use client'`, auth-aware header with `UserButton` |
| `.env.local` | Add `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `_SIGN_UP_URL`, redirect fallbacks |
| `.env.example` | Add all Clerk env vars to the canonical list |

---

## Implementation Requirements

### 1. Install the SDK

```bash
npm install @clerk/nextjs
```

### 2. Update `.env.local`

Append the four Clerk route config env vars (keys already exist):

```
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
```

### 3. Create `proxy.ts` (project root)

Public-first strategy. The home page and all unauthenticated views remain accessible.

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/public(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

`/news/[id]` is not in the public list, so Clerk middleware will redirect unauthenticated users to `/sign-in` automatically. No additional route-level protection code is needed in the news details page itself.

### 4. Update `app/layout.tsx`

Import `ClerkProvider` and wrap children inside `<body>`:

```tsx
import { ClerkProvider } from '@clerk/nextjs';

// ...inside RootLayout:
<body className="...">
  <ClerkProvider>
    {children}
  </ClerkProvider>
</body>
```

### 5. Create sign-in page: `app/sign-in/[[...sign-in]]/page.tsx`

Centered page, matching Biasly's white/gray palette:

```tsx
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F6F6]">
      <SignIn />
    </div>
  );
}
```

### 6. Create sign-up page: `app/sign-up/[[...sign-up]]/page.tsx`

Same pattern:

```tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F6F6]">
      <SignUp />
    </div>
  );
}
```

### 7. Update `SiteHeader.tsx`

- Add `'use client'` directive.
- Import `useUser` from `@clerk/nextjs` and `UserButton` from `@clerk/nextjs`.
- When `isSignedIn` is true: show `<UserButton />` in place of the Login button.
- When `isSignedIn` is false: show Login button as a `<Link href="/sign-in">` and Subscribe button as-is.
- While `isLoaded` is false: render a skeleton/placeholder to avoid layout shift.

### 8. Update `.env.example`

Add the Clerk section with all env vars from the AGENTS.md canonical table.

---

## Security Requirements

- `CLERK_SECRET_KEY` must never be imported in client components.
- `UserButton` and `useUser` / `useAuth` are client-only; they are used only in the `SiteHeader` which is `'use client'`.
- Server components use `await auth()` from `@clerk/nextjs/server` (not used yet in this task but pattern established for future pages).
- Admin action routes (`/api/scrape`, `/api/analyze`, etc.) rely on `BIASLY_ADMIN_SECRET` as per AGENTS.md section 15, not on Clerk middleware — but Clerk session data can be additionally read server-side if needed.

---

## Acceptance Criteria

- [ ] `@clerk/nextjs` is installed.
- [ ] `proxy.ts` exists at the project root with the correct `clerkMiddleware` and `config` matcher.
- [ ] `<ClerkProvider>` wraps children inside `<body>` in `app/layout.tsx`.
- [ ] `/sign-in` and `/sign-up` routes exist and render Clerk components.
- [ ] The home page `/` remains publicly accessible without sign-in.
- [ ] News details pages `/news/[id]` are **protected** — unauthenticated users are redirected to `/sign-in`.
- [ ] After signing in, users are redirected back to the news details page they tried to access.
- [ ] `SiteHeader` is a client component showing `<UserButton />` when signed in and Login + Subscribe when signed out.
- [ ] `.env.local` has all four Clerk URL config variables.
- [ ] No Clerk secret keys appear in client code or browser bundles.

---

## Checks to Run

```bash
npm run typecheck
npm run lint
npm run build
```

---

## Manual Test Steps

1. Start the dev server: `npm run dev`
2. Open `http://localhost:3000` — the home page loads without redirect (public).
3. Open `http://localhost:3000/sign-in` — Clerk sign-in widget appears centered on the page.
4. Open `http://localhost:3000/sign-up` — Clerk sign-up widget appears centered on the page.
5. Create a new account via the sign-up page. After sign-up, you are redirected to `/`.
6. The `SiteHeader` now shows `<UserButton />` (Clerk avatar/dropdown) in place of the Login button.
7. Click the `<UserButton />` and sign out. The header reverts to showing Login + Subscribe.
8. Sign in via `/sign-in`. You are redirected back to `/` and the header shows `<UserButton />` again.
9. While signed out, visit a news details page (e.g. `http://localhost:3000/news/1`) — Clerk redirects to `/sign-in` with the original URL preserved as a redirect param.
10. Sign in from that redirect. You land back on `/news/1`.
11. Check the browser DevTools Network tab — confirm no `CLERK_SECRET_KEY` is visible in any response.
