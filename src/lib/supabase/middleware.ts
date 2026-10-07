import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";

const ROLE_PREFIX: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/dashboard/teen", roles: ["teen"] },
  { prefix: "/dashboard/employer", roles: ["employer"] },
  { prefix: "/dashboard/parent", roles: ["parent"] },
  { prefix: "/onboarding/employer", roles: ["employer"] },
  { prefix: "/incidents", roles: ["teen", "parent", "employer", "admin"] },
];

/** Refreshes the Supabase session cookie and enforces role-based route access server-side. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const rule = ROLE_PREFIX.find((r) => path.startsWith(r.prefix)) ?? (path.startsWith("/dashboard") ? { prefix: "/dashboard", roles: ["teen", "parent", "employer", "admin"] } : null);
  if (!rule) return response;

  if (!data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  // Role comes from the database (RLS: users can read only their own row), never from client state.
  const { data: row } = await supabase.from("users").select("role,status").eq("id", data.user.id).maybeSingle();
  if (!row || row.status !== "active" || !rule.roles.includes(row.role)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    if (path === "/dashboard") return response;
    return NextResponse.redirect(url);
  }
  // Administrators need a second factor (aal2) — the database enforces the same rule for admin data.
  if (row.role === "admin" && path.startsWith("/admin")) {
    const { data: pending } = await supabase.rpc("is_admin_pending_mfa");
    if (pending) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/mfa";
      url.search = "";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
  }
  return response;
}
