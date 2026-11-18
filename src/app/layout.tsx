import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "School back office",
  description: "Fees, students and parent communication for Kenyan schools",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
