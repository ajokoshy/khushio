export const site = {
  name: "Khushio",
  tagline: "Discover More. Save More. Live Happier.",
  description: "Khushio helps you find the best products, deals and brands in India, all in one place.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://khushio.com",
};

/** Turn a section on only when its routes exist. Disabled sections are hidden from nav, footer and sitemap. */
export const features = {
  shop: true, categories: true, deals: true, coupons: true, brands: true,
  bestPicks: true, compare: true, gifts: true, discover: true, journal: true,
  legal: true,
} as const;

export type Feature = keyof typeof features;
export type NavItem = { label: string; href: string; feature: Feature };

export const nav: NavItem[] = [
  { label: "Shop", href: "/shop", feature: "shop" },
  { label: "Deals", href: "/deals", feature: "deals" },
  { label: "Coupons", href: "/coupons", feature: "coupons" },
  { label: "Best picks", href: "/best-picks", feature: "bestPicks" },
  { label: "Compare", href: "/compare", feature: "compare" },
  { label: "Gifts", href: "/gifts", feature: "gifts" },
  { label: "Discover", href: "/discover", feature: "discover" },
  { label: "Journal", href: "/journal", feature: "journal" },
];

export const legalLinks: NavItem[] = [
  { label: "About", href: "/about", feature: "legal" },
  { label: "Contact", href: "/contact", feature: "legal" },
  { label: "Affiliate disclosure", href: "/affiliate-disclosure", feature: "legal" },
  { label: "Privacy policy", href: "/privacy-policy", feature: "legal" },
  { label: "Terms and conditions", href: "/terms-and-conditions", feature: "legal" },
];

export const enabled = (items: NavItem[]) => items.filter((i) => features[i.feature]);

export const categories = [
  { slug: "fashion-accessories", label: "Fashion & Accessories", icon: "Shirt", tone: "bg-[#F8D9CF] text-terracotta" },
  { slug: "electronics-gadgets", label: "Electronics & Gadgets", icon: "Smartphone", tone: "bg-[#D5E8E4] text-[#2F6F68]" },
  { slug: "beauty-personal-care", label: "Beauty & Personal Care", icon: "Sparkles", tone: "bg-[#F8DCD2] text-terracotta" },
  { slug: "home-living", label: "Home & Living", icon: "Home", tone: "bg-[#DDE5D0] text-forest-700" },
  { slug: "kids-baby", label: "Kids & Baby", icon: "Baby", tone: "bg-[#F6E6BD] text-[#B7852B]" },
  { slug: "sports-fitness", label: "Sports & Fitness", icon: "Dumbbell", tone: "bg-[#E6DDF0] text-[#7A5FA0]" },
  { slug: "travel-experiences", label: "Travel & Experiences", icon: "Plane", tone: "bg-[#D5EBE2] text-[#2F7A64]" },
  { slug: "books-more", label: "Books & More", icon: "BookOpen", tone: "bg-sand text-[#7A5F45]" },
] as const;
