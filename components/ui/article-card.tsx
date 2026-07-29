import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, BookOpen } from "lucide-react";
import { BiasMeter } from "./bias-meter";
import { Badge } from "./badge";

type SentimentLabel = "positive" | "neutral" | "negative";
type BiasLabel = "left" | "center" | "right" | "mixed" | "unclear";

export interface ArticleCardProps {
  title: string;
  description?: string;
  imageUrl: string;
  imageAlt?: string;
  category?: string;
  region?: string;
  source?: string;
  /** Human-readable time e.g. "2h ago" */
  publishedAt?: string;
  /** e.g. "12 min read" */
  readingTime?: string;
  sentimentLabel?: SentimentLabel;
  biasLabel?: BiasLabel;
  leftPct?: number;
  centerPct?: number;
  rightPct?: number;
  confidence?: number;
  href?: string;
  className?: string;
}

function ArticleCardInner({
  title,
  description,
  imageUrl,
  imageAlt = "",
  category,
  region,
  publishedAt,
  readingTime,
  sentimentLabel,
  biasLabel,
  leftPct = 0,
  centerPct = 0,
  rightPct = 0,
  className = "",
}: Omit<ArticleCardProps, "href">) {
  return (
    <article
      className={[
        "flex flex-col bg-white rounded-[12px] overflow-hidden border border-[#E5E7EB] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-shadow duration-200 hover:shadow-[0px_4px_12px_rgba(0,0,0,0.08)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Image */}
      <div className="relative w-full aspect-[16/9] bg-[#F0F0F0] overflow-hidden">
        <Image
          src={imageUrl}
          alt={imageAlt || title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-3 p-4 flex-1">
        {/* Meta: category · region */}
        {(category || region) && (
          <p className="text-[11px] font-medium text-[#8B7280] leading-none tracking-wide uppercase">
            {[category, region].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* Title */}
        <h3 className="text-[20px] font-semibold leading-[1.3] text-[#0D0D0F] line-clamp-3 group-hover:text-[#1D4ED8] transition-colors duration-150">
          {title}
        </h3>

        {/* Description */}
        {description && (
          <p className="text-[14px] font-normal leading-[1.6] text-[#8B7280] line-clamp-2">
            {description}
          </p>
        )}

        {/* Bias Meter */}
        {(leftPct > 0 || centerPct > 0 || rightPct > 0) && (
          <BiasMeter left={leftPct} center={centerPct} right={rightPct} />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-1">
          {/* Time metadata */}
          <div className="flex items-center gap-3 text-[#8B7280]">
            {publishedAt && (
              <span className="flex items-center gap-1 text-[11px]">
                <Clock size={12} strokeWidth={2} />
                {publishedAt}
              </span>
            )}
            {readingTime && (
              <span className="flex items-center gap-1 text-[11px]">
                <BookOpen size={12} strokeWidth={2} />
                {readingTime}
              </span>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1">
            {sentimentLabel && <Badge variant={sentimentLabel} />}
            {biasLabel && <Badge variant={biasLabel} />}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ArticleCard({ href, ...props }: ArticleCardProps) {
  if (href) {
    return (
      <Link href={href} className="block group">
        <ArticleCardInner {...props} />
      </Link>
    );
  }
  return (
    <div className="block group">
      <ArticleCardInner {...props} />
    </div>
  );
}
