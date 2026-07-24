import * as React from "react";

interface BiasMeterProps {
  left: number;
  center: number;
  right: number;
  className?: string;
}

/**
 * Three-segment horizontal bias bar.
 * left + center + right should sum to 100.
 * Labels appear inside a segment only when it is ≥ 15% wide.
 */
export function BiasMeter({ left, center, right, className = "" }: BiasMeterProps) {
  // Normalise so they always sum to 100
  const total = left + center + right || 100;
  const l = Math.round((left / total) * 100);
  const c = Math.round((center / total) * 100);
  const r = 100 - l - c;

  const MIN_LABEL_PCT = 15;

  return (
    <div className={`flex w-full h-7 overflow-hidden rounded-[9999px] ${className}`}>
      {/* Left segment */}
      {l > 0 && (
        <div
          style={{ width: `${l}%` }}
          className="flex items-center justify-center bg-[#843318] text-white text-[11px] font-medium"
        >
          {l >= MIN_LABEL_PCT && <span>Left {l}%</span>}
        </div>
      )}

      {/* Center segment */}
      {c > 0 && (
        <div
          style={{ width: `${c}%` }}
          className="flex items-center justify-center bg-[#E5E7EB] text-[#0D0D0F] text-[11px] font-medium"
        >
          {c >= MIN_LABEL_PCT && <span>Center {c}%</span>}
        </div>
      )}

      {/* Right segment */}
      {r > 0 && (
        <div
          style={{ width: `${r}%` }}
          className="flex items-center justify-center bg-[#1D4ED8] text-white text-[11px] font-medium"
        >
          {r >= MIN_LABEL_PCT && <span>Right {r}%</span>}
        </div>
      )}
    </div>
  );
}
