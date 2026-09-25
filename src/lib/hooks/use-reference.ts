"use client";
import { useEffect, useState } from "react";
import { useData } from "../auth-context";
import { CATEGORIES, SERVICE_AREAS } from "../constants";
import type { Category, ServiceArea } from "../types";

/** Admin-managed categories (falls back to built-in defaults while loading). */
export function useCategories(): Category[] {
  const data = useData();
  const [cats, setCats] = useState<Category[]>(CATEGORIES);
  useEffect(() => {
    data.listCategories().then((c) => c.length && setCats(c)).catch(() => {});
  }, [data]);
  return cats;
}

export function useServiceAreas(): ServiceArea[] {
  const data = useData();
  const [areas, setAreas] = useState<ServiceArea[]>(SERVICE_AREAS);
  useEffect(() => {
    data.listServiceAreas().then((a) => a.length && setAreas(a)).catch(() => {});
  }, [data]);
  return areas;
}
