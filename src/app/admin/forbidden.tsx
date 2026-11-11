import Link from "next/link";

export const metadata = { title: "Access denied", robots: { index: false } };

// Rendered inside the admin shell, so the sidebar and top bar stay visible.
export default function AdminForbidden() {
  return (
    <section className="py-12 text-center">
      <h1 className="text-3xl">Access denied</h1>
      <p className="mt-3 text-ink-600">Your account does not have permission to view this page.</p>
      <Link href="/admin/dashboard" className="mt-6 inline-block font-medium text-coral-600 underline">Back to the dashboard</Link>
    </section>
  );
}
