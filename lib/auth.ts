import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
const NAME = "kh_admin", DAY = 86_400_000;
const hmac = (v: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(v).digest("hex");
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** Ties every session to the current password hash and email: changing either (or AUTH_SECRET) signs everyone out. */
const fingerprint = () => createHash("sha256").update(`${process.env.ADMIN_PASSWORD_HASH ?? ""}|${(process.env.ADMIN_EMAIL ?? "").trim().toLowerCase()}`).digest("hex").slice(0, 16);
const sig = (exp: string) => hmac(`${exp}.${fingerprint()}`);

export function checkLogin(email: string, password: string) {
  const envHash = (process.env.ADMIN_PASSWORD_HASH ?? "").trim();
  const envEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const secret = process.env.AUTH_SECRET ?? "";
  const [salt, hash] = envHash.split(":");

  const hashFormatOk = salt?.length === 32 && hash?.length === 128;
  const okEmail = safeEq(email.trim().toLowerCase(), envEmail);
  // A plain-text password is a development convenience only. It is never accepted in production.
  const plain = process.env.NODE_ENV === "production" ? "" : process.env.ADMIN_PASSWORD ?? "";
  const okPass = hashFormatOk
    ? safeEq(scryptSync(password, salt, 64).toString("hex"), hash)
    : plain.length >= 12 && safeEq(password, plain);
  return okEmail && okPass && secret.length >= 32;
}

export async function startSession() {
  const exp = String(Date.now() + 7 * DAY);
  (await cookies()).set(NAME, `${exp}.${sig(exp)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 7 * 86400 });
}

export async function endSession() { (await cookies()).delete(NAME); }
export async function isAdmin() {
  const v = (await cookies()).get(NAME)?.value; if (!v || (process.env.AUTH_SECRET ?? "").length < 32) return false;
  const [exp, s] = v.split("."); return !!exp && !!s && Number(exp) > Date.now() && safeEq(s, sig(exp));
}
export async function requireAdmin() { if (!(await isAdmin())) redirect("/admin/login"); }
