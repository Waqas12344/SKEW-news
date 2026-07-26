import Image from "next/image";
import Link from "next/link";
import { Clock, BookOpen } from "lucide-react";

export interface RelatedArticleCardProps {
  title: string;
  category?: string;
  region?: string;
  publishedAt?: string;
  readingTime?: string;
  imageUrl: string;
  href?: string;
}

export function RelatedArticleCard({
  title,
  category,
  region,
  publishedAt,
  readingTime,
  imageUrl,
  href = "#",
}: RelatedArticleCardProps) {
  return (
    <Link href={href} className="group flex gap-3 items-start">
      {/* Thumbnail */}
      <div className="relative shrink-0 w-20 h-20 rounded-[8px] overflow-hidden bg-[#F0F0F0]">
        <Image
          src={imageUrl}
          alt={title}
          fill
          sizes="80px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        {(category || region) && (
          <p className="text-[11px] font-medium text-[#8B7280] uppercase tracking-wide leading-none">
            {[category, region].filter(Boolean).join(" · ")}
          </p>
        )}
        <h4 className="text-[14px] font-semibold leading-[1.4] text-[#0D0D0F] line-clamp-2 group-hover:text-[#1D4ED8] transition-colors duration-150">
          {title}
        </h4>
        <div className="flex items-center gap-3 text-[#8B7280] mt-auto">
          {publishedAt && (
            <span className="flex items-center gap-1 text-[11px]">
              <Clock size={11} strokeWidth={2} />
              {publishedAt}
            </span>
          )}
          {readingTime && (
            <span className="flex items-center gap-1 text-[11px]">
              <BookOpen size={11} strokeWidth={2} />
              {readingTime}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
