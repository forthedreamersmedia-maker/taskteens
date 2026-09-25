"use client";
import { MapPin, Search, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CITIES } from "@/lib/constants";
import { useCategories } from "@/lib/hooks/use-reference";
import { cn } from "@/lib/utils";

export function JobSearchBar({ className, initial }: { className?: string; initial?: { q?: string; city?: string; category?: string } }) {
  const router = useRouter();
  const CATEGORIES = useCategories();
  const [q, setQ] = useState(initial?.q ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (city) sp.set("city", city);
    if (category) sp.set("category", category);
    router.push(`/jobs${sp.size ? `?${sp}` : ""}`);
  };
  return (
    <form role="search" aria-label="Search jobs" onSubmit={submit} className={cn("grid gap-2 rounded-3xl bg-white p-2 shadow-lift ring-1 ring-navy-100 sm:grid-cols-[1fr_1fr_auto]", className)}>
      <label className="flex items-center gap-2 rounded-2xl px-3 py-2.5 focus-within:bg-cream-100 sm:col-span-3 sm:border-b sm:border-navy-100 sm:rounded-b-none">
        <Search className="h-5 w-5 shrink-0 text-navy-400" aria-hidden="true" />
        <span className="sr-only">Keyword</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dog walking, tutoring, café…" className="w-full bg-transparent text-sm outline-none placeholder:text-navy-300" />
      </label>
      <label className="flex items-center gap-2 rounded-2xl px-3 py-2.5 focus-within:bg-cream-100 ">
        <MapPin className="h-5 w-5 shrink-0 text-navy-400" aria-hidden="true" />
        <span className="sr-only">Location</span>
        <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full bg-transparent text-sm outline-none">
          <option value="">Any East Bay city</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 rounded-2xl px-3 py-2.5 focus-within:bg-cream-100 sm:border-l sm:border-navy-100">
        <Tag className="h-5 w-5 shrink-0 text-navy-400" aria-hidden="true" />
        <span className="sr-only">Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-transparent text-sm outline-none">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn-primary btn-lg rounded-2xl">Search jobs</button>
    </form>
  );
}
