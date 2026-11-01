import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Shared building blocks for the admin and public site. Server-rendered, no client JavaScript. */
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const BTN = { primary: "bg-forest text-ivory hover:bg-forest-700", accent: "bg-terracotta text-white hover:bg-terracotta-600", secondary: "border border-sand bg-white text-ink hover:border-forest", danger: "border border-terracotta text-terracotta-600 hover:bg-terracotta/10", link: "text-forest underline underline-offset-2" } as const;
export type ButtonVariant = keyof typeof BTN;
const btnClass = (v: ButtonVariant, small?: boolean) => cx("inline-flex items-center justify-center rounded-full font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50", v === "link" ? "" : small ? "px-4 py-1.5 text-sm" : "px-6 py-2.5 text-sm", BTN[v]);
export function Button({ variant = "primary", small, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; small?: boolean }) { return <button {...p} className={cx(btnClass(variant, small), className)} />; }
export function ButtonLink({ variant = "primary", small, href, children, className }: { variant?: ButtonVariant; small?: boolean; href: string; children: ReactNode; className?: string }) { return <a href={href} className={cx(btnClass(variant, small), className)}>{children}</a>; }

export const INPUT = "mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus-visible:outline-2 focus-visible:outline-forest";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(INPUT, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(INPUT, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(INPUT, p.className)} />;
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return <label className={cx("block text-sm", className)}><span className="font-medium text-ink">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-ink/60">{hint}</span>}{error && <span role="alert" className="mt-1 block text-xs text-terracotta-600">{error}</span>}</label>;
}
export const Check = ({ label, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...p} />{label}</label>;

const TONE = { info: "bg-sand text-ink", success: "bg-sage text-forest", warn: "bg-[#F6E6BD] text-[#7A5F10]", error: "bg-terracotta/10 text-terracotta-600" } as const;
export function Alert({ tone = "info", children }: { tone?: keyof typeof TONE; children: ReactNode }) { return <p role={tone === "error" ? "alert" : "status"} className={cx("rounded-lg px-4 py-3 text-sm", TONE[tone])}>{children}</p>; }
export const Badge = ({ tone = "info", children }: { tone?: keyof typeof TONE; children: ReactNode }) => <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[tone])}>{children}</span>;

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx("rounded-card border border-sand bg-white p-5", className)}>{children}</div>;
export const PageTitle = ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-semibold text-forest">{children}</h1>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>;
export const SectionTitle = ({ children }: { children: ReactNode }) => <h2 className="mb-3 mt-10 font-display text-2xl font-semibold text-forest">{children}</h2>;
export const EmptyState = ({ children }: { children: ReactNode }) => <p className="rounded-card border border-dashed border-sand p-6 text-center text-sm text-ink/70">{children}</p>;
