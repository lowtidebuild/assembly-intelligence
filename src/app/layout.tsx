import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "산업별 국회 인텔리전스",
  description: "ParlaWatch+ — 산업별 국회 입법 동향 인텔리전스 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = window.localStorage.getItem("parlawatch-theme");
                  var theme =
                    stored === "dark" || stored === "light"
                      ? stored
                      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
                  document.documentElement.dataset.theme = theme;
                } catch (error) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
