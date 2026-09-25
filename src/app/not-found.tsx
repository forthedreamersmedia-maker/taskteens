import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="font-display text-7xl font-extrabold text-bay-500">404</p>
      <h1 className="mt-4 text-2xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-navy-500">It may have moved, or the listing may no longer be available.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="btn-outline">Home</Link>
        <Link href="/jobs" className="btn-primary">Find jobs</Link>
      </div>
    </div>
  );
}
