import { notFound } from "next/navigation";
import Image from "next/image";
import { Bookmark, Share2, MoreHorizontal, Info } from "lucide-react";
import { SiteHeader } from "@/components/homepage/SiteHeader";
import { Footer } from "@/components/homepage/Footer";
import { BiasMeter } from "@/components/ui/bias-meter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getArticleDetailById } from "@/lib/supabase/queries/articles";
import { toDetailData } from "@/lib/supabase/mappers";
import type { RelatedArticleCardProps } from "@/components/ui/related-article-card";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types (keep local — no shared module needed)
// ---------------------------------------------------------------------------
type BiasLabel = "left" | "center" | "right" | "mixed" | "unclear";

interface SourceRow {
  name: string;
  bias: BiasLabel;
}

// ---------------------------------------------------------------------------
// Sub-components (page-local, no separate files needed)
// ---------------------------------------------------------------------------

/** Proportional mini-bar used in sidebar breakdown tables */
function BiasBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

/** Section card wrapper used throughout the sidebar */
function SidebarCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[12px] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] p-5 flex flex-col gap-4">
      {children}
    </div>
  );
}

/** Sidebar card header row — title + optional info icon */
function SidebarCardHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-semibold text-[#0D0D0F]">{title}</span>
      <Info size={14} strokeWidth={2} className="text-[#8B7280]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function NewsDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const row = await getArticleDetailById(id);
  if (!row) notFound();

  const article = toDetailData(row);

  // Related stories deferred to §20 (pgvector). Section is hidden when empty.
  const relatedStories: RelatedArticleCardProps[] = [];

  return (
    <div className="flex flex-col min-h-screen bg-[#F6F6F6]">
      {/* Top info bar */}
      <div className="w-full bg-[#F0F0F0] border-b border-[#E5E7EB] hidden md:block">
        <div className="container-biasly flex items-center justify-between h-8">
          <span className="text-[11px] text-[#8B7280]">
            Browser Extension&nbsp;&nbsp;·&nbsp;&nbsp;Theme:&nbsp;
            <span className="text-[#0D0D0F] font-medium">Light</span>
            &nbsp;&nbsp;Dark&nbsp;&nbsp;Auto
          </span>
          <span className="text-[11px] text-[#8B7280]">
            Monday, June 1, 2026&nbsp;&nbsp;·&nbsp;&nbsp;Set Location&nbsp;&nbsp;·&nbsp;&nbsp;International Edition ↓
          </span>
        </div>
      </div>

      <SiteHeader />

      <main className="flex-1">
        <div className="container-biasly py-8">
          <div className="flex flex-col lg:flex-row gap-10 items-start">

            {/* ================================================================
                LEFT COLUMN — Article content
            ================================================================ */}
            <div className="w-full lg:flex-1 min-w-0 flex flex-col gap-6">

              {/* Breadcrumb */}
              <p className="text-[11px] font-medium text-[#8B7280] uppercase tracking-wide">
                {[article.category, article.region].filter(Boolean).join("\u00a0\u00a0·\u00a0\u00a0")}
              </p>

              {/* Title */}
              <h1 className="text-[32px] font-bold leading-[1.2] text-[#0D0D0F]">
                {article.title}
              </h1>

              {/* Byline row */}
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
                <div className="flex items-center gap-2 text-[13px] text-[#8B7280]">
                  <span>
                    By&nbsp;<span className="font-semibold text-[#0D0D0F]">{article.author}</span>
                  </span>
                  <span>·</span>
                  <span>{article.publishedAt}</span>
                  <span>·</span>
                  <span>{article.readTime}</span>
                </div>
                <div className="flex items-center gap-2 text-[#8B7280]">
                  <button type="button" aria-label="Save article" className="p-1.5 rounded-md hover:bg-[#F0F0F0] transition-colors">
                    <Bookmark size={18} strokeWidth={2} />
                  </button>
                  <button type="button" aria-label="Share article" className="p-1.5 rounded-md hover:bg-[#F0F0F0] transition-colors">
                    <Share2 size={18} strokeWidth={2} />
                  </button>
                  <button type="button" aria-label="More options" className="p-1.5 rounded-md hover:bg-[#F0F0F0] transition-colors">
                    <MoreHorizontal size={18} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* Hero image */}
              <div className="flex flex-col gap-2">
                <div className="relative w-full aspect-[16/9] rounded-[12px] overflow-hidden bg-[#F0F0F0]">
                  <Image
                    src={article.imageUrl}
                    alt={article.title}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 65vw"
                    className="object-cover"
                  />
                </div>
                <p className="text-[11px] text-[#8B7280] italic leading-relaxed">
                  {article.imageCaption}
                </p>
              </div>

              {/* Bias Distribution box */}
              <div className="bg-[#F6F6F6] border border-[#E5E7EB] rounded-[12px] p-4 flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-[#0D0D0F]">Bias Distribution</span>
                  <Info size={13} strokeWidth={2} className="text-[#8B7280]" />
                </div>
                <BiasMeter
                  left={article.leftPct}
                  center={article.centerPct}
                  right={article.rightPct}
                />
                <p className="text-[11px] text-[#8B7280]">{article.sourcesCount} source{article.sourcesCount !== 1 ? "s" : ""}</p>
              </div>

              {/* Article body */}
              <div className="flex flex-col gap-4">
                {article.body.map((para, i) => (
                  <p
                    key={i}
                    className="text-[15px] leading-[1.75] text-[#0D0D0F]"
                  >
                    {para}
                  </p>
                ))}
              </div>

              {/* Related Stories — hidden until §20 pgvector populates it */}
              {relatedStories.length > 0 && (
                <div className="flex flex-col gap-4 pt-2">
                  <h3 className="text-[20px] font-semibold leading-[1.3] text-[#0D0D0F]">
                    Related Stories
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {relatedStories.map((story) => (
                      <div key={story.href}>
                        {/* RelatedArticleCard rendered here in §20 */}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Newsletter CTA strip */}
              <div className="bg-[#F6F6F6] border border-[#E5E7EB] rounded-[12px] p-6 mt-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-[16px] font-semibold text-[#0D0D0F]">
                      Stay Informed. Stay Balanced.
                    </p>
                    <p className="text-[13px] text-[#8B7280]">
                      Get the top stories and bias analysis delivered to your inbox.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                    <input
                      type="email"
                      placeholder="Enter your email"
                      className="h-10 px-3 rounded-[8px] border border-[#E5E7EB] text-[14px] text-[#0D0D0F] bg-white placeholder:text-[#8B7280] focus:outline-none focus:ring-2 focus:ring-[#0D0D0F]/20 w-full sm:w-48"
                    />
                    <Button variant="primary" size="md">
                      Subscribe
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* ================================================================
                RIGHT SIDEBAR — Analysis panels (sticky)
            ================================================================ */}
            <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4 lg:sticky lg:top-[72px]">

              {/* ---- Card 1: Bias Analysis ---- */}
              <SidebarCard>
                <SidebarCardHeader title="Bias Analysis" />

                {/* Overall bias badge */}
                <div className="flex flex-col gap-1">
                  <div className="w-full flex items-center justify-center py-2.5 rounded-[8px] bg-[#1D4ED8] text-white">
                    <span className="text-[16px] font-bold">{article.overallBiasLabel}</span>
                  </div>
                  <p className="text-[11px] text-[#8B7280] text-center">
                    Based on {article.sourcesCount} balanced source{article.sourcesCount !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Breakdown rows */}
                <div className="flex flex-col gap-3">
                  {[
                    { label: "Left",   pct: article.leftPct,   color: "#843318" },
                    { label: "Center", pct: article.centerPct, color: "#6B7280" },
                    { label: "Right",  pct: article.rightPct,  color: "#1D4ED8" },
                  ].map(({ label, pct, color }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-12 text-[11px] text-[#8B7280]">{label}</span>
                      <span className="w-9 text-[13px] font-semibold text-[#0D0D0F] text-right">{pct}%</span>
                      <BiasBar pct={pct} color={color} />
                    </div>
                  ))}
                </div>

                {/* Analysis note */}
                <p className="text-[11px] text-[#8B7280] italic leading-relaxed">
                  {article.analysisNote}
                </p>

                <Button variant="outline" size="sm" className="w-full">
                  How We Analyse Bias
                </Button>
              </SidebarCard>

              {/* ---- Card 2: AI Summary ---- */}
              <SidebarCard>
                <div className="flex flex-col gap-1">
                  <SidebarCardHeader title="AI Summary" />
                  <p className="text-[11px] text-[#8B7280]">
                    Generated {article.summaryDate}&nbsp;·&nbsp;{article.summaryReadTime}
                  </p>
                </div>

                {/* Bullet points */}
                <ul className="flex flex-col gap-2">
                  {article.summaryPoints.map((point, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[#0D0D0F]">
                      <span className="text-[#8B7280] mt-0.5 shrink-0">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>

                <p className="text-[11px] text-[#8B7280] italic">
                  All summaries can make mistakes.
                </p>

                <Button variant="outline" size="sm" className="w-full">
                  Provide Feedback
                </Button>
              </SidebarCard>

              {/* ---- Card 3: Source Breakdown ---- */}
              <SidebarCard>
                <SidebarCardHeader title="Source Breakdown" />

                {/* Total + mini bias bars */}
                <div className="flex flex-col gap-3">
                  <p className="text-[13px] font-semibold text-[#0D0D0F]">
                    {article.sourcesCount} Total Source{article.sourcesCount !== 1 ? "s" : ""}
                  </p>
                  {[
                    { label: "Left",   count: article.sourceBreakdown.left,   pct: article.sourceBreakdown.leftPct,   color: "#843318" },
                    { label: "Center", count: article.sourceBreakdown.center, pct: article.sourceBreakdown.centerPct, color: "#6B7280" },
                    { label: "Right",  count: article.sourceBreakdown.right,  pct: article.sourceBreakdown.rightPct,  color: "#1D4ED8" },
                  ].map(({ label, count, pct, color }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-12 text-[11px] text-[#8B7280]">{label}</span>
                      <span className="w-16 text-[13px] font-semibold text-[#0D0D0F]">
                        {count} ({pct}%)
                      </span>
                      <BiasBar pct={pct} color={color} />
                    </div>
                  ))}
                </div>

                {/* Divider */}
                <div className="border-t border-[#E5E7EB]" />

                {/* Top sources table */}
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] font-semibold text-[#0D0D0F] mb-1">
                    Top Sources
                  </p>
                  {(article.topSources as SourceRow[]).map((source) => (
                    <div
                      key={source.name}
                      className="flex items-center justify-between py-1.5 border-b border-[#F0F0F0] last:border-0"
                    >
                      <span className="text-[13px] text-[#0D0D0F]">{source.name}</span>
                      <Badge variant={source.bias} />
                    </div>
                  ))}
                </div>

                <Button variant="outline" size="sm" className="w-full">
                  View All Sources
                </Button>
              </SidebarCard>

            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
