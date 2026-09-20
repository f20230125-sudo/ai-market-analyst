import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deriv AI Market Analyst",
  description:
    "Simulated market data, real technical indicators, and an AI analyst that explains what they mean.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
