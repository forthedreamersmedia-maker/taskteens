"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationStatus } from "@/lib/types";
import type { ParentLinkStatus } from "./consent";
import { must } from "./client";

export interface LinkedTeen {
  teen_id: string; full_name: string; age_range: string | null; city: string | null; status: ParentLinkStatus;
  paused: boolean; location_sharing_allowed: boolean; consent_version: string | null; consent_at: string | null;
}
export async function loadMyTeens(sb: SupabaseClient): Promise<LinkedTeen[]> {
  return (must(await sb.rpc("my_teens")) as LinkedTeen[]) ?? [];
}

export interface ParentApplication {
  id: string; teen_id: string; status: ApplicationStatus; created_at: string; status_updated_at: string; completed_at: string | null;
  job: { id: string; title: string; city: string; category: string; pay_type: string; pay_min: number; pay_max: number | null; start_date: string | null; start_time: string | null; duration_minutes: number | null } | null;
  employer: { display_name: string } | null;
}
export async function loadTeenApplications(sb: SupabaseClient): Promise<ParentApplication[]> {
  return (must(
    await sb
      .from("applications")
      .select("id, teen_id, status, created_at, status_updated_at, completed_at, job:jobs(id, title, city, category, pay_type, pay_min, pay_max, start_date, start_time, duration_minutes), employer:employer_profiles(display_name)")
      .order("status_updated_at", { ascending: false }),
  ) as unknown as ParentApplication[]) ?? [];
}
