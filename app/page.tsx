import { SiteHeader } from "@/components/homepage/SiteHeader";
import { CategoryBar } from "@/components/homepage/CategoryBar";
import { Footer } from "@/components/homepage/Footer";
import { ArticleCard, type ArticleCardProps } from "@/components/ui/article-card";

// ---------------------------------------------------------------------------
// Mock data — replaced with Supabase query in a later step
// ---------------------------------------------------------------------------
const MOCK_ARTICLES: ArticleCardProps[] = [
  {
    title: "Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report",
    imageUrl: "/01-ui-design-system.png",
    category: "Politics",
    region: "United States",
    leftPct: 20,
    centerPct: 31,
    rightPct: 49,
    publishedAt: "12 sources",
  },
  {
    title: "Researchers Make Case for Grapes as a 'Superfood' After Review of Health Evidence",
    imageUrl: "/01-ui-design-system.png",
    category: "Health",
    region: "United States",
    leftPct: 18,
    centerPct: 42,
    rightPct: 40,
    publishedAt: "7 sources",
  },
  {
    title: "CERN Finds High-Significance Hint of Physics Beyond Standard Model",
    imageUrl: "/01-ui-design-system.png",
    category: "Science",
    region: "Switzerland",
    leftPct: 18,
    centerPct: 62,
    rightPct: 22,
    publishedAt: "8 sources",
  },
  {
    title: "Indigenous Leader Brooklyn Rivera Dies in Nicaragua After Nearly 3 Years of Detention",
    imageUrl: "/01-ui-design-system.png",
    category: "World",
    region: "Nicaragua",
    leftPct: 54,
    centerPct: 28,
    rightPct: 18,
    publishedAt: "63 sources",
  },
  {
    title: "UN Security Council to Hold Emergency Meeting as Israel Pushes Deeper into Lebanon",
    imageUrl: "/01-ui-design-system.png",
    category: "World",
    region: "Middle East",
    leftPct: 22,
    centerPct: 35,
    rightPct: 43,
    publishedAt: "15 sources",
  },
  {
    title: "Oil Prices Dip as OPEC+ Considers Output Increase Amid Weak Demand",
    imageUrl: "/01-ui-design-system.png",
    category: "Business",
    region: "Global",
    leftPct: 25,
    centerPct: 50,
    rightPct: 25,
    publishedAt: "11 sources",
  },
  {
    title: "SpaceX Launches Starship Test Flight in Milestone for Mars Program",
    imageUrl: "/01-ui-design-system.png",
    category: "Technology",
    region: "United States",
    leftPct: 12,
    centerPct: 45,
    rightPct: 43,
    publishedAt: "9 sources",
  },
  {
    title: "Apple Unveils AI-Powered Features Across iPhone, iPad and Mac",
    imageUrl: "/01-ui-design-system.png",
    category: "Business",
    region: "United States",
    leftPct: 15,
    centerPct: 40,
    rightPct: 45,
    publishedAt: "10 sources",
  },
  {
    title: "2025 on Track to Be Among Top 3 Hottest Years, EU Climate Service Says",
    imageUrl: "/01-ui-design-system.png",
    category: "Climate",
    region: "Global",
    leftPct: 33,
    centerPct: 34,
    rightPct: 33,
    publishedAt: "14 sources",
  },
  {
    title: "Fed Holds Rates Steady, Signals Caution on Inflation and Growth Outlook",
    imageUrl: "/01-ui-design-system.png",
    category: "Economy",
    region: "United States",
    leftPct: 30,
    centerPct: 45,
    rightPct: 25,
    publishedAt: "13 sources",
  },
  {
    title: "Real Madrid Win Champions League After Comeback Victory in Final",
    imageUrl: "/01-ui-design-system.png",
    category: "Soccer",
    region: "Europe",
    leftPct: 10,
    centerPct: 20,
    rightPct: 70,
    publishedAt: "26 sources",
  },
  {
    title: "Wildfires Force Thousands to Evacuate Across Western Canada",
    imageUrl: "/01-ui-design-system.png",
    category: "Environment",
    region: "Canada",
    leftPct: 27,
    centerPct: 33,
    rightPct: 40,
    publishedAt: "17 sources",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HomePage() {
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

      {/* Sticky header */}
      <SiteHeader />

      {/* Category filter bar */}
      <CategoryBar />

      {/* Main content */}
      <main className="flex-1">
        <div className="container-biasly py-8">
          {/* Section heading */}
          <h2 className="text-h2 text-[#0D0D0F] mb-6">Top News</h2>

          {/* Article grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {MOCK_ARTICLES.map((article, index) => (
              <ArticleCard
                key={index}
                {...article}
                href={`/news/${index + 1}`}
              />
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
