import { LoginForm } from "./login-form";

export const metadata = { title: "Admin sign in", robots: { index: false } };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return (
    <section className="mx-auto max-w-sm px-4 py-24">
      <h1 className="text-3xl">Admin sign in</h1>
      <p className="mt-2 text-ink-600">Access is by invitation only.</p>
      <LoginForm callbackUrl={callbackUrl} />
    </section>
  );
}
