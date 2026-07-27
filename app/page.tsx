import { SiteHeader } from "@/components/homepage/SiteHeader";
import { CategoryBar } from "@/components/homepage/CategoryBar";
import { Footer } from "@/components/homepage/Footer";
import { ArticleCard } from "@/components/ui/article-card";
import { getHomeArticles } from "@/lib/supabase/queries/articles";
import { toArticleCardProps } from "@/lib/supabase/mappers";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await getHomeArticles();
  const articles = rows.map(toArticleCardProps);

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
            {articles.length === 0 ? (
              <p className="text-[#8B7280] text-[14px] py-16 text-center col-span-full">
                No analyzed articles yet — run the pipeline to populate the feed.
              </p>
            ) : (
              articles.map((article) => (
                <ArticleCard key={article.href} {...article} />
              ))
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
