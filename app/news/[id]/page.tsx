import Image from "next/image";
import { Bookmark, Share2, MoreHorizontal, Info } from "lucide-react";
import { SiteHeader } from "@/components/homepage/SiteHeader";
import { Footer } from "@/components/homepage/Footer";
import { BiasMeter } from "@/components/ui/bias-meter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelatedArticleCard } from "@/components/ui/related-article-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type BiasLabel = "left" | "center" | "right" | "mixed" | "unclear";

interface SourceRow {
  name: string;
  bias: BiasLabel;
}

// ---------------------------------------------------------------------------
// Mock data — replaced with Supabase lookup in a later step
// ---------------------------------------------------------------------------
const MOCK_ARTICLE = {
  id: "1",
  title: "Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report",
  category: "Politics",
  region: "United States",
  author: "David Morgan",
  publishedAt: "May 31, 2026",
  readTime: "12 min read",
  imageUrl: "/01-ui-design-system.png",
  imageCaption:
    "President Donald Trump in the Cabinet Room at the White House, Washington, D.C., May 30, 2026. Photo: Andrew Harnik/Getty Images.",
  leftPct: 20,
  centerPct: 31,
  rightPct: 49,
  sourcesCount: 12,
  overallBias: "right" as BiasLabel,
  overallBiasLabel: "Right 49%",
  body: [
    "The Trump administration has sent Iran a revised nuclear deal proposal that includes tougher terms on uranium enrichment and stronger verification measures, according to a report published Saturday.",
    "The new proposal, delivered through intermediaries in Oman, requires Iran to halt all uranium enrichment on its soil and ship its stockpile of enriched uranium out of the country. It also demands unrestricted access for international inspectors to all Iranian nuclear facilities, including military sites.",
    '"This is a take-it-or-leave-it proposal," a senior administration official told the Wall Street Journal. "The President wants a deal, but he will not accept a weak agreement that puts America or our allies at risk."',
    "Iran has not yet officially responded to the proposal. However, Iranian Foreign Minister Hossein Amir-Abdollahian said last week that any deal must respect Iran's right to peaceful nuclear energy and include the lifting of all U.S. sanctions.",
    "The revised proposal comes after several rounds of indirect talks between U.S. and Iranian officials failed to produce a breakthrough. The Trump administration has warned that if diplomacy fails, it is prepared to take other action to prevent Iran from obtaining a nuclear weapon.",
    "European allies have urged both sides to continue negotiations. \"We believe diplomacy is still the best path forward,\" said a spokesperson for the EU's foreign policy chief.",
    "Israel, which has long opposed the 2015 nuclear deal with Iran, praised the Trump administration's tougher stance. \"This is the kind of leadership that was missing in the past,\" said Israeli Prime Minister Benjamin Netanyahu in a statement.",
    "The fate of the proposal now rests with Iran, as global attention remains focused on whether a new nuclear agreement can be reached — or if tensions will escalate further.",
  ],
  summaryDate: "May 31, 2026",
  summaryReadTime: "3 min read",
  summaryPoints: [
    "The Trump administration has sent Iran a revised nuclear deal proposal with tougher terms, including a complete halt to uranium enrichment and uranium stockpiles.",
    "The proposal also demands unrestricted inspector access to all nuclear sites, including military facilities.",
    "Iran has not responded officially but says any deal must respect Iran's right to peaceful nuclear energy and include sanctions relief.",
    "The U.S. warns it is prepared to take other action if diplomacy fails, while European allies urge continued negotiations.",
    "Israel supports the tougher stance, praising the administration's determination to prevent Iran from acquiring nuclear weapons.",
  ],
  analysisNote:
    "Our analysis is based on the political leaning of the publication and how the story is framed. Sources are weighted by reliability and recency.",
  sourceBreakdown: { left: 2, leftPct: 20, center: 4, centerPct: 37, right: 6, rightPct: 49 },
  topSources: [
    { name: "Fox News", bias: "right" },
    { name: "The Wall Street Journal", bias: "center" },
    { name: "Reuters", bias: "center" },
    { name: "BBC", bias: "center" },
    { name: "CNN", bias: "left" },
    { name: "The New York Times", bias: "center" },
    { name: "The Washington Post", bias: "center" },
    { name: "Newsmax", bias: "right" },
  ] as SourceRow[],
};

const RELATED_STORIES = [
  {
    title: "Iran Says It Will Not Negotiate Under 'Maximum Pressure'",
    category: "World",
    region: "Middle East",
    publishedAt: "May 29, 2026",
    readingTime: "8 min read",
    imageUrl: "https://placehold.co/160x160/1a1a2a/ffffff?text=Iran",
    href: "/news/2",
  },
  {
    title: "Bipartisan Group Urges Diplomacy With Iran",
    category: "Politics",
    region: "United States",
    publishedAt: "May 28, 2026",
    readingTime: "5 min read",
    imageUrl: "https://placehold.co/160x160/0a1a0a/ffffff?text=Politics",
    href: "/news/3",
  },
  {
    title: "US Sanctions More Iranian Entities Over Nuclear Program",
    category: "Politics",
    region: "United States",
    publishedAt: "May 29, 2026",
    readingTime: "6 min read",
    imageUrl: "https://placehold.co/160x160/2a1a0a/ffffff?text=Sanctions",
    href: "/news/4",
  },
  {
    title: "What's in the 2015 Iran Nuclear Deal?",
    category: "Science",
    region: "Nuclear Policy",
    publishedAt: "May 26, 2026",
    readingTime: "10 min read",
    imageUrl: "https://placehold.co/160x160/1a0a2a/ffffff?text=Nuclear",
    href: "/news/5",
  },
  {
    title: "Oman Hosts Another Round of US–Iran Nuclear Talks",
    category: "World",
    region: "Middle East",
    publishedAt: "May 27, 2026",
    readingTime: "7 min read",
    imageUrl: "https://placehold.co/160x160/0a2a1a/ffffff?text=Talks",
    href: "/news/6",
  },
  {
    title: "Israel Reaffirms Red Line Over Iranian Nuclear Program",
    category: "World",
    region: "Middle East",
    publishedAt: "May 24, 2026",
    readingTime: "9 min read",
    imageUrl: "https://placehold.co/160x160/2a0a0a/ffffff?text=Israel",
    href: "/news/7",
  },
];

// ---------------------------------------------------------------------------
// Static params — pre-render /news/1 through /news/12
// ---------------------------------------------------------------------------
export function generateStaticParams() {
  return Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1) }));
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
export default function NewsDetailsPage() {
  const article = MOCK_ARTICLE;

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
                {article.category}&nbsp;&nbsp;·&nbsp;&nbsp;{article.region}
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
                <p className="text-[11px] text-[#8B7280]">{article.sourcesCount} sources</p>
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

              {/* Related Stories */}
              <div className="flex flex-col gap-4 pt-2">
                <h3 className="text-[20px] font-semibold leading-[1.3] text-[#0D0D0F]">
                  Related Stories
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {RELATED_STORIES.map((story) => (
                    <RelatedArticleCard key={story.href} {...story} />
                  ))}
                </div>
              </div>

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
                    <span className="text-[16px] font-bold">Right 49%</span>
                  </div>
                  <p className="text-[11px] text-[#8B7280] text-center">
                    Based on {article.sourcesCount} balanced sources
                  </p>
                </div>

                {/* Breakdown rows */}
                <div className="flex flex-col gap-3">
                  {[
                    { label: "Left", pct: article.leftPct, color: "#843318" },
                    { label: "Center", pct: article.centerPct, color: "#6B7280" },
                    { label: "Right", pct: article.rightPct, color: "#1D4ED8" },
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
                    {article.sourcesCount} Total Sources
                  </p>
                  {[
                    { label: "Left", count: article.sourceBreakdown.left, pct: article.sourceBreakdown.leftPct, color: "#843318" },
                    { label: "Center", count: article.sourceBreakdown.center, pct: article.sourceBreakdown.centerPct, color: "#6B7280" },
                    { label: "Right", count: article.sourceBreakdown.right, pct: article.sourceBreakdown.rightPct, color: "#1D4ED8" },
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
                  {article.topSources.map((source) => (
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
