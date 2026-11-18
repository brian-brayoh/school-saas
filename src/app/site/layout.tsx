import "@fontsource-variable/schibsted-grotesk";
import "@fontsource/kalam/400.css";
import "./site.css";
import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME}: school fees that reconcile themselves`,
  description: "Parents pay your paybill with the admission number. Every payment lands on the right student, with a receipt and an up-to-date balance list.",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="site min-h-screen bg-paper font-display text-ink antialiased">{children}</div>;
}
