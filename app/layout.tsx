import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "チャートシミュレーター（1分足）",
  description: "歩み値データから1分足チャートを生成し、時間を操作してチャートを再生できるシミュレーター",
  openGraph: {
    title: "チャートシミュレーター（1分足）",
    description: "歩み値データから1分足チャートを生成し、時間を操作してチャートを再生できるシミュレーター",
    type: "website",
    images: [
      {
        url: "/twitter-image.png",
        width: 1200,
        height: 630,
        alt: "チャートシミュレーター（1分足）",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "チャートシミュレーター（1分足）",
    description: "歩み値データから1分足チャートを生成し、時間を操作してチャートを再生できるシミュレーター",
    images: ["/twitter-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}

