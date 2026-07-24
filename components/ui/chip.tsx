"use client";

import * as React from "react";
import { Plus } from "lucide-react";

type ChipVariant = "default" | "active";

interface ChipProps {
  label: string;
  variant?: ChipVariant;
  showPlus?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Chip({
  label,
  variant = "default",
  showPlus = false,
  onClick,
  className = "",
}: ChipProps) {
  const base =
    "inline-flex items-center gap-1 px-3 h-7 rounded-[9999px] text-[13px] font-medium transition-colors duration-150 select-none";

  const variantStyles: Record<ChipVariant, string> = {
    default:
      "bg-[#F0F0F0] text-[#0D0D0F] hover:bg-[#E5E7EB] cursor-pointer",
    active:
      "bg-[#0D0D0F] text-white hover:bg-[#1a1a1a] cursor-pointer",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={[base, variantStyles[variant], className]
        .filter(Boolean)
        .join(" ")}
    >
      <span>{label}</span>
      {showPlus && (
        <Plus
          size={12}
          strokeWidth={2}
          className={variant === "active" ? "text-white" : "text-[#8B7280]"}
        />
      )}
    </button>
  );
}
