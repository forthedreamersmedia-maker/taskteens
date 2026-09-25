"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { Section } from "@/components/layout/dashboard-shell";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/feedback";
import { CategoryIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { errorMessage } from "@/lib/utils";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function CategoriesPage() {
  const data = useData();
  const toast = useToast();
  const { data: cats, loading, reload } = useAsync(() => data.listCategories(true), []);
  const { data: areas, loading: aLoading, reload: reloadAreas } = useAsync(() => data.listServiceAreas(true), []);
  const [newCat, setNewCat] = useState({ name: "", description: "" });
  const [newArea, setNewArea] = useState({ name: "", cities: "" });

  const run = async (fn: () => Promise<void>, ok: string, after: () => void) => {
    try {
      await fn();
      toast({ tone: "success", title: ok, body: "Recorded in the audit log." });
      after();
    } catch (e) {
      toast({ tone: "error", title: "Couldn't save", body: errorMessage(e) });
    }
  };

  return (
    <AdminShell title="Categories & service areas" subtitle="Deactivating hides an option from new listings and filters; existing listings keep their values.">
      <Section title="Job categories" className="mt-0">
        {loading ? <Skeleton className="h-40" /> : (
          <ul className="divide-y divide-navy-50 overflow-hidden rounded-3xl border border-navy-100 bg-white">
            {cats?.map((c) => (
              <li key={c.slug} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-3"><CategoryIcon name={c.icon} className="h-5 w-5 text-navy-400" /><span><span className="font-medium">{c.name}</span><span className="block text-xs text-navy-500">{c.description}</span></span></span>
                <span className="flex items-center gap-2">
                  <Badge tone={c.active ? "green" : "gray"}>{c.active ? "Active" : "Hidden"}</Badge>
                  <button className="btn-outline btn-sm" onClick={() => run(() => data.adminUpsertCategory({ ...c, active: !c.active }), c.active ? "Category hidden" : "Category activated", () => reload(true))}>{c.active ? "Deactivate" : "Activate"}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="card mt-4 grid gap-3 p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (newCat.name.trim().length < 2) return toast({ tone: "error", title: "Enter a category name" });
            run(() => data.adminUpsertCategory({ slug: slugify(newCat.name), name: newCat.name.trim(), description: newCat.description.trim(), icon: "Briefcase", active: true, sort: (cats?.length ?? 0) + 1 }), "Category added", () => { setNewCat({ name: "", description: "" }); reload(true); });
          }}
        >
          <Field label="New category"><input className="input" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} /></Field>
          <Field label="Description" optional><input className="input" value={newCat.description} onChange={(e) => setNewCat({ ...newCat, description: e.target.value })} /></Field>
          <button type="submit" className="btn-primary"><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>
        </form>
      </Section>

      <Section title="Service areas">
        {aLoading ? <Skeleton className="h-32" /> : (
          <ul className="divide-y divide-navy-50 overflow-hidden rounded-3xl border border-navy-100 bg-white">
            {areas?.map((a) => (
              <li key={a.slug} className="flex items-center justify-between gap-3 px-4 py-3">
                <span><span className="font-medium">{a.name}</span><span className="block text-xs text-navy-500">{a.cities.join(", ")}</span></span>
                <span className="flex items-center gap-2">
                  <Badge tone={a.active ? "green" : "gray"}>{a.active ? "Active" : "Hidden"}</Badge>
                  <button className="btn-outline btn-sm" onClick={() => run(() => data.adminUpsertServiceArea({ ...a, active: !a.active }), "Service area updated", () => reloadAreas(true))}>{a.active ? "Deactivate" : "Activate"}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="card mt-4 grid gap-3 p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const cities = newArea.cities.split(",").map((c) => c.trim()).filter(Boolean);
            if (newArea.name.trim().length < 2 || !cities.length) return toast({ tone: "error", title: "Enter a name and at least one city" });
            run(() => data.adminUpsertServiceArea({ slug: slugify(newArea.name), name: newArea.name.trim(), cities, active: true }), "Service area added", () => { setNewArea({ name: "", cities: "" }); reloadAreas(true); });
          }}
        >
          <Field label="New service area"><input className="input" value={newArea.name} onChange={(e) => setNewArea({ ...newArea, name: e.target.value })} placeholder="e.g. San Pablo" /></Field>
          <Field label="Cities (comma-separated)"><input className="input" value={newArea.cities} onChange={(e) => setNewArea({ ...newArea, cities: e.target.value })} /></Field>
          <button type="submit" className="btn-primary"><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>
        </form>
      </Section>
    </AdminShell>
  );
}
