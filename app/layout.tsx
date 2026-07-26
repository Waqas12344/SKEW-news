import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Biasly — Balanced news coverage, powered by AI.",
  description:
    "Biasly collects real news articles and analyzes them with AI to surface reader-friendly sentiment and framing insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#FFFFFF] text-[#0D0D0F]">
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
