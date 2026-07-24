"use client";

import * as React from "react";

type ButtonVariant = "primary" | "secondary" | "text" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#0D0D0F] text-white border border-transparent hover:bg-[#1a1a1a] disabled:bg-[#E5E7EB] disabled:text-[#8B7280] disabled:cursor-not-allowed",
  secondary:
    "bg-white text-[#0D0D0F] border border-[#0D0D0F] hover:bg-[#F0F0F0] disabled:bg-white disabled:text-[#8B7280] disabled:border-[#E5E7EB] disabled:cursor-not-allowed",
  outline:
    "bg-white text-[#0D0D0F] border border-[#E5E7EB] hover:bg-[#F6F6F6] disabled:bg-white disabled:text-[#8B7280] disabled:cursor-not-allowed",
  text: "bg-transparent text-[#0D0D0F] border border-transparent hover:bg-[#F0F0F0] disabled:text-[#8B7280] disabled:cursor-not-allowed",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-[14px]",
  lg: "h-12 px-6 text-[16px]",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-[8px] font-medium transition-colors duration-150 cursor-pointer select-none",
        variantStyles[variant],
        sizeStyles[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
