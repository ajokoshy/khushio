/** Built-in page texts (Markdown). A page costs no database storage until an admin customises it. */
export const DEFAULT_PAGES: Record<string, { title: string; body: string; description: string }> = {
  about: { title: "About Khushio", description: "What Khushio is and how it works.", body: "Khushio helps shoppers in India discover good products, real deals and emerging brands in one place.\n\nWe are a discovery site. You complete every purchase on the retailer’s own website.\n\n## How we make money\n\nSome links are affiliate links. If you buy through them we may earn a commission at no extra cost to you. Commissions never decide what we recommend. Read our [editorial policy](/editorial-policy)." },
  contact: { title: "Contact", description: "How to reach Khushio.", body: "Questions, corrections or partnership ideas? Write to the email address shown in the footer of this site and we will reply as soon as we can." },
  "affiliate-disclosure": { title: "Affiliate disclosure", description: "How affiliate links work on Khushio.", body: "Some links on Khushio are affiliate links. If you buy through them we may earn a commission at no extra cost to you.\n\nCommissions never decide which products we recommend, and links marked as affiliate links are opened in a new tab so you stay in control." },
  "privacy-policy": { title: "Privacy policy", description: "What data Khushio collects and why.", body: "We collect only the data needed to run the site, such as anonymous counts of visits and affiliate link clicks. We store only the page a click came from, never your name, email address or IP address.\n\nWe do not sell personal data. This is a starter text: have it reviewed before launch." },
  "terms-and-conditions": { title: "Terms and conditions", description: "Terms of using Khushio.", body: "Prices, offers and availability come from third-party retailers and can change without notice.\n\nThis is a starter text: have it reviewed before launch." },
  "editorial-policy": { title: "Editorial policy", description: "How Khushio chooses and reviews products.", body: "## How we choose products\n\nWe feature products because they are useful, fairly priced and available in India, not because of the commission they pay.\n\n## Prices and deals\n\nPrices are shown as last recorded, with the date we checked them where we have one. Deals and coupons are removed when they expire.\n\n## Corrections\n\nIf something is wrong, tell us and we will fix it promptly." },
  disclaimer: { title: "Disclaimer", description: "Important limits on the information shown.", body: "Information on Khushio is provided in good faith for general guidance only. Prices, offers, coupons and availability are controlled by retailers and can change at any moment; always check the retailer’s site before you buy.\n\nWe are not responsible for the content or practices of other sites that we link to." },
};

/** Addresses that belong to the application and can never be used by a custom page. */
export const RESERVED_SLUGS = new Set(["admin", "go", "api", "shop", "products", "categories", "brands", "deals", "coupons", "journal", "collections", "compare", "gifts", "discover", "best-picks", "stores", "sitemap", "robots", "favicon", "icon", "images", "brand", "_next", "search"]);

export function cleanPageSlug(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s && !RESERVED_SLUGS.has(s) ? s : null;
}
