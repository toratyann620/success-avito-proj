import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AVITO（アビト）：AI-driven Value into Transformative Organization",
  description: "AVITO（アビト）はRAG基盤のAI業務支援ツール。社内ナレッジを横断検索し、Excel・Word・PowerPoint資料を自動生成します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
