'use client';

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser, UserButton } from "@clerk/nextjs";
import posthog from "posthog-js";

const navLinks = [
  { label: "Home", href: "/", active: true },
  { label: "For You", href: "/for-you", active: false },
  { label: "Local", href: "/local", active: false },
  { label: "Blindspot", href: "/blindspot", active: false },
];

export function SiteHeader() {
  const { isLoaded, isSignedIn, user } = useUser();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (user) {
      if (identifiedUserId.current === user.id) return;

      if (identifiedUserId.current) {
        posthog.reset();
      }

      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? undefined,
      });
      identifiedUserId.current = user.id;
      return;
    }

    if (identifiedUserId.current) {
      posthog.reset();
      identifiedUserId.current = null;
    }
  }, [isLoaded, user]);

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-[#E5E7EB]">
      <div className="container-biasly h-[52px] flex items-center justify-between gap-4">
        {/* Left: hamburger + wordmark */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Open menu"
            className="flex items-center justify-center w-8 h-8 rounded-md text-[#0D0D0F] hover:bg-[#F0F0F0] transition-colors"
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          <Link href="/" className="flex flex-col leading-none select-none">
            <span className="text-[20px] font-bold text-[#0D0D0F] leading-tight tracking-tight">
              biasly
            </span>
            <span className="text-[10px] font-medium text-[#8B7280] leading-none tracking-widest uppercase">
              News
            </span>
          </Link>
        </div>

        {/* Center: nav links — hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={[
                "px-3 h-9 flex items-center text-[14px] font-medium transition-colors",
                link.active
                  ? "text-[#0D0D0F] border-b-2 border-[#0D0D0F]"
                  : "text-[#8B7280] hover:text-[#0D0D0F] hover:bg-[#F6F6F6] rounded-md",
              ].join(" ")}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right: auth-aware action buttons */}
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm">
            Subscribe
          </Button>

          {/* Skeleton placeholder while Clerk loads — avoids layout shift */}
          {!isLoaded && (
            <div className="w-[62px] h-8 rounded-md bg-[#F0F0F0] animate-pulse" />
          )}

          {isLoaded && isSignedIn && (
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                },
              }}
            />
          )}

          {isLoaded && !isSignedIn && (
            <Link href="/sign-in">
              <Button variant="outline" size="sm">
                Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
