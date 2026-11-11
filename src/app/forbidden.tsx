import Link from "next/link";

export const metadata = { title: "Access denied", robots: { index: false } };

export default function Forbidden() {
  return (
    <main>
      <section className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-4xl">Access denied</h1>
        <p className="mt-3 text-ink-600">Your account does not have permission to view this page.</p>
        <Link href="/admin/dashboard" className="mt-6 inline-block font-medium text-coral-600 underline">Back to the dashboard</Link>
      </section>
    </main>
  );
}
