import type { ReactNode } from "react";

export const metadata = { title: "Pastebin Lite" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 720,
          margin: "2rem auto",
          padding: "0 1rem",
          lineHeight: 1.5,
        }}
      >
        <h1 style={{ marginBottom: "1rem" }}>
          <a href="/" style={{ color: "inherit", textDecoration: "none" }}>
            Pastebin Lite
          </a>
        </h1>
        {children}
      </body>
    </html>
  );
}
