import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-600">Access denied</p>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">Unauthorized</h1>
        <p className="mt-3 text-sm text-gray-600">This area is restricted to WasteWise administrators only.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/login" className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800">
            Go to login
          </Link>
          <Link href="/" className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Back to app
          </Link>
        </div>
      </div>
    </main>
  );
}
