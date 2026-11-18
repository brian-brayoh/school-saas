/** Working product name. "Ada" is Swahili for fees (ada ya shule). Change it here. */
export const PRODUCT_NAME = "Ada";

/** Where "Book a demo" goes: WhatsApp if SALES_WHATSAPP is set (2547XXXXXXXX), else email, else nothing. */
export function demoHref(): string | null {
  const wa = process.env.SALES_WHATSAPP?.replace(/\D/g, "");
  if (wa) return `https://wa.me/${wa}?text=${encodeURIComponent(`Hi, I'd like a demo of ${PRODUCT_NAME} for our school.`)}`;
  const email = process.env.SALES_EMAIL?.trim();
  if (email) return `mailto:${email}?subject=${encodeURIComponent(`${PRODUCT_NAME} demo`)}`;
  return null;
}
