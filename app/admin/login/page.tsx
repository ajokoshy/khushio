import type { Metadata } from "next";
import { login } from "../actions";
export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };
export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const err = (await searchParams).e;
  return (
    <div className="mx-auto max-w-sm px-5 py-20">
      <h1 className="font-display text-3xl font-semibold text-forest">Admin sign in</h1>
      {err && <p role="alert" className="mt-4 text-sm text-terracotta-600">Wrong email or password.</p>}
      <form action={login} className="mt-6 space-y-4">
        <label className="block text-sm">Email<input name="email" type="email" required autoComplete="username" className="mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2" /></label>
        <label className="block text-sm">Password<input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-lg border border-sand bg-white px-3 py-2" /></label>
        <button className="w-full rounded-full bg-forest py-2.5 font-medium text-ivory">Sign in</button>
      </form>
    </div>
  );
}
