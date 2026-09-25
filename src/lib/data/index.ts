"use client";
import { isDemoMode } from "../config";
import type { DataClient } from "./types";
import { createMockClient } from "./mock";
import { createSupabaseClient } from "./supabase";

let instance: DataClient | null = null;

/** Returns the active data client: Supabase when configured, otherwise local demo mode. */
export function getDataClient(): DataClient {
  if (!instance) instance = isDemoMode ? createMockClient() : createSupabaseClient();
  return instance;
}

export * from "./types";
