import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
const NAME = "kh_admin", DAY = 86_400_000;
const sig = (v: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(v).digest("hex");
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function checkLogin(email: string, password: string) {
  const [salt, hash] = (process.env.ADMIN_PASSWORD_HASH ?? "").split(":");
  if (!salt || !hash || !process.env.AUTH_SECRET || (process.env.AUTH_SECRET.length < 32)) return false;
  const okEmail = safeEq(email.trim().toLowerCase(), (process.env.ADMIN_EMAIL ?? "").toLowerCase());
  const okPass = safeEq(scryptSync(password, salt, 64).toString("hex"), hash);
  return okEmail && okPass;
}
export async function startSession() {
  const exp = String(Date.now() + 7 * DAY);
  (await cookies()).set(NAME, `${exp}.${sig(exp)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 86400 });
}
export async function endSession() { (await cookies()).delete(NAME); }
export async function isAdmin() {
  const v = (await cookies()).get(NAME)?.value; if (!v || !process.env.AUTH_SECRET) return false;
  const [exp, s] = v.split("."); return !!exp && !!s && Number(exp) > Date.now() && safeEq(s, sig(exp));
}
export async function requireAdmin() { if (!(await isAdmin())) redirect("/admin/login"); }
