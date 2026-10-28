import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
const NAME = "kh_admin", DAY = 86_400_000;
const sig = (v: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(v).digest("hex");
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function checkLogin(email: string, password: string) {
  const envHash = (process.env.ADMIN_PASSWORD_HASH ?? "").trim();
  const envEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const secret = process.env.AUTH_SECRET ?? "";
  const [salt, hash] = envHash.split(":");

  const hashFormatOk = salt?.length === 32 && hash?.length === 128;
  const okEmail = safeEq(email.trim().toLowerCase(), envEmail);
  const okPass = hashFormatOk && safeEq(scryptSync(password, salt, 64).toString("hex"), hash);

  // TEMPORARY DEBUG: remove after login works. Logs yes/no results and lengths only, never values.
  console.log("[login-debug]", {
    ADMIN_EMAIL_set: envEmail.length > 0,
    ADMIN_PASSWORD_HASH_set: envHash.length > 0,
    hash_format_ok: hashFormatOk,
    hash_salt_len: salt?.length ?? 0,
    hash_value_len: hash?.length ?? 0,
    AUTH_SECRET_len: secret.length,
    AUTH_SECRET_ok: secret.length >= 32,
    email_matches: okEmail,
    submitted_email_len: email.trim().length,
    configured_email_len: envEmail.length,
    password_matches: okPass,
    submitted_password_len: password.length,
  });

  return okEmail && okPass && secret.length >= 32;
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
