/** Typed, validated site settings. Only values that differ from their default are stored in the database. */
export type SettingType = "text" | "textarea" | "url" | "email" | "path";
export type SettingDef = { key: string; group: string; label: string; help?: string; type: SettingType; max: number; default: string };

export const SETTINGS = [
  { key: "hero_title", group: "Homepage hero", label: "Headline (one line per row)", type: "textarea", max: 120, default: "Discover More.\nSave More.\nLive Happier." },
  { key: "hero_subtitle", group: "Homepage hero", label: "Sub-text", type: "textarea", max: 240, default: "From everyday essentials to special moments, find the best products, deals and brands, all in one place." },
  { key: "search_placeholder", group: "Homepage hero", label: "Search box hint", type: "text", max: 80, default: "Search for products, brands, deals and more..." },
  { key: "hero_cta_label", group: "Homepage hero", label: "Button label (empty hides the button)", type: "text", max: 30, default: "" },
  { key: "hero_cta_href", group: "Homepage hero", label: "Button link", help: "A site path such as /deals, or an https:// address.", type: "path", max: 300, default: "/shop" },
  { key: "announcement", group: "Site", label: "Announcement bar (empty hides it)", type: "text", max: 160, default: "" },
  { key: "site_tagline", group: "Site", label: "Tagline", type: "text", max: 80, default: "Discover More. Save More. Live Happier." },
  { key: "contact_email", group: "Site", label: "Contact email", type: "email", max: 120, default: "hello@khushio.com" },
  { key: "footer_blurb", group: "Footer", label: "Footer disclosure text", type: "textarea", max: 400, default: "As an affiliate, Khushio may earn a commission when you buy through links on this site, at no extra cost to you. Prices and availability are set by the retailer and can change." },
  { key: "social_instagram", group: "Social links", label: "Instagram address", type: "url", max: 200, default: "" },
  { key: "social_facebook", group: "Social links", label: "Facebook address", type: "url", max: 200, default: "" },
  { key: "social_x", group: "Social links", label: "X (Twitter) address", type: "url", max: 200, default: "" },
  { key: "social_youtube", group: "Social links", label: "YouTube address", type: "url", max: 200, default: "" },
  { key: "newsletter_form_url", group: "Newsletter", label: "Newsletter sign-up form address", help: "The https:// address your email provider gives for its hosted sign-up form. Empty hides the newsletter section; no email data is stored on this site.", type: "url", max: 300, default: "" },
  { key: "newsletter_title", group: "Newsletter", label: "Newsletter heading", type: "text", max: 80, default: "Get the best finds in your inbox" },
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof SETTINGS)[number]["key"];
export const SETTING_DEFAULTS = Object.fromEntries(SETTINGS.map((s) => [s.key, s.default])) as Record<SettingKey, string>;
export const SETTING_KEYS = SETTINGS.map((s) => s.key) as SettingKey[];

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

export type CleanResult = { ok: true; value: string } | { ok: false; reason: string };
/** Validates one raw form value against its definition. */
export function cleanSetting(def: SettingDef, raw: string): CleanResult {
  const value = raw.replace(/\r\n?/g, "\n").replace(CONTROL, "").trim();
  if (def.type !== "textarea" && value.includes("\n")) return { ok: false, reason: "must be a single line" };
  if (value.length > def.max) return { ok: false, reason: `is too long (maximum ${def.max} characters)` };
  if (!value) return { ok: true, value };
  if (def.type === "url" && !/^https:\/\/[^\s]+$/i.test(value)) return { ok: false, reason: "must be an https:// address" };
  if (def.type === "email" && !EMAIL.test(value)) return { ok: false, reason: "must be an email address" };
  if (def.type === "path" && !(/^\/(?!\/)[^\s\\]*$/.test(value) || /^https:\/\/[^\s\\]+$/i.test(value))) return { ok: false, reason: "must be a site path like /deals or an https:// address" };
  return { ok: true, value };
}
