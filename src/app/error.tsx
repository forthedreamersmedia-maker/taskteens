"use client";
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-navy-500">{error.message || "An unexpected error occurred."}</p>
      <button type="button" onClick={reset} className="btn-primary mt-6">Try again</button>
    </div>
  );
}
