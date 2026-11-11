/** Best-effort client IP. On Vercel, x-forwarded-for is set by the platform. */
export function getClientIp(headers: Pick<Headers, "get">): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}
