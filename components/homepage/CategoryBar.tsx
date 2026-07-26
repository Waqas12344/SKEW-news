"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/chip";

const CATEGORIES = [
  "World Cup",
  "IPL",
  "Social Media",
  "Business & Markets",
  "Health & Medicine",
  "Soccer",
  "Artificial Intelligence",
  "Arsenal FC",
  "Extreme Weather and Disasters",
];

export function CategoryBar() {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <div className="relative w-full bg-white border-b border-[#E5E7EB]">
      {/* Left scroll arrow + gradient */}
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center pointer-events-none">
        <div className="w-12 h-full bg-gradient-to-r from-white to-transparent" />
      </div>
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollBy(-200)}
        className="absolute left-1 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-[#E5E7EB] shadow-sm hover:bg-[#F0F0F0] transition-colors"
      >
        <ChevronLeft size={14} strokeWidth={2} />
      </button>

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        className="flex items-center gap-2 px-10 py-2 overflow-x-auto"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {CATEGORIES.map((cat) => (
          <Chip key={cat} label={cat} showPlus className="shrink-0" />
        ))}
      </div>

      {/* Right scroll arrow + gradient */}
      <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center pointer-events-none">
        <div className="w-12 h-full bg-gradient-to-l from-white to-transparent" />
      </div>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollBy(200)}
        className="absolute right-1 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-[#E5E7EB] shadow-sm hover:bg-[#F0F0F0] transition-colors"
      >
        <ChevronRight size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
