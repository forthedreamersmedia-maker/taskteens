import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isDemoMode } from "./lib/config";
import { updateSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Demo mode has no server session; dashboards are guarded client-side by <RequireRole>.
  if (isDemoMode) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
