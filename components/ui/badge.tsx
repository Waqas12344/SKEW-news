import * as React from "react";

type SentimentType = "positive" | "neutral" | "negative";
type BiasType = "left" | "center" | "right" | "mixed" | "unclear";
type BadgeVariant = SentimentType | BiasType;

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
  className?: string;
}

const sentimentStyles: Record<SentimentType, string> = {
  positive: "bg-[#DCFCE7] text-[#15803D]",
  neutral:  "bg-[#F3F4F6] text-[#6B7280]",
  negative: "bg-[#FEE2E2] text-[#DC2626]",
};

const biasStyles: Record<BiasType, string> = {
  left:    "bg-[#843318] text-white",
  center:  "bg-[#E5E7EB] text-[#0D0D0F]",
  right:   "bg-[#1D4ED8] text-white",
  mixed:   "bg-[#F59E0B] text-white",
  unclear: "bg-[#F3F4F6] text-[#6B7280]",
};

const defaultLabels: Record<BadgeVariant, string> = {
  positive: "Positive",
  neutral:  "Neutral",
  negative: "Negative",
  left:     "Left",
  center:   "Center",
  right:    "Right",
  mixed:    "Mixed",
  unclear:  "Unclear",
};

function isSentiment(v: BadgeVariant): v is SentimentType {
  return v === "positive" || v === "neutral" || v === "negative";
}

export function Badge({ variant, label, className = "" }: BadgeProps) {
  const colorStyle = isSentiment(variant)
    ? sentimentStyles[variant]
    : biasStyles[variant as BiasType];

  return (
    <span
      className={[
        "inline-flex items-center px-2 h-5 rounded-[9999px] text-[11px] font-medium uppercase tracking-wide leading-none",
        colorStyle,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label ?? defaultLabels[variant]}
    </span>
  );
}
