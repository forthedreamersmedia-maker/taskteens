"use client";
import { ChevronDown, LayoutDashboard, LogOut, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { dashboardPathFor, useAuth } from "@/lib/auth-context";
import { cn, initials } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";

const NAV = [
  { href: "/jobs", label: "Find Jobs" },
  { href: "/hire", label: "Hire Teens" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/safety", label: "Safety" },
];

export function postJobHref(role?: string) {
  if (role === "employer") return "/dashboard/employer/listings/new";
  return "/auth/sign-up?role=employer&next=/dashboard/employer/listings/new";
}

export function SiteHeader() {
  const { session, data } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [scrolled, setScrolled] = useState(false);
  // On the homepage the bar floats transparently over the Bay photo until you scroll.
  const overHero = pathname === "/" && !scrolled && !mobileOpen;
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const signOut = async () => {
    await data.signOut();
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  };

  const role = session?.user.role;

  return (
    <header className={cn("sticky top-0 z-40 transition-colors duration-300", overHero ? "border-b border-transparent bg-transparent" : "border-b border-navy-100/70 bg-cream-100/85 backdrop-blur-md")}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo light={overHero} />
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn("rounded-full px-3.5 py-2 text-sm font-medium transition", overHero ? "text-white/90 hover:bg-white/15 hover:text-white" : "text-navy-600 hover:bg-white hover:text-navy-800", pathname.startsWith(n.href) && "bg-white text-navy-800 shadow-sm")}
              aria-current={pathname.startsWith(n.href) ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {role !== "teen" && role !== "admin" && (
            <Link href={postJobHref(role)} className="btn-coral hidden sm:inline-flex">
              <Plus className="h-4 w-4" aria-hidden="true" /> Post a Job
            </Link>
          )}
          {session ? (
            <>
              <NotificationBell light={overHero} />
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className={cn("flex items-center gap-1.5 rounded-full p-1 pr-2", overHero ? "hover:bg-white/15" : "hover:bg-white")}
                  aria-expanded={menuOpen}
                  aria-haspopup="true"
                  aria-label="Account menu"
                >
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold", overHero ? "bg-white text-navy-800" : "bg-navy-800 text-white")}>{initials(session.user.full_name || "U")}</span>
                  <ChevronDown className={cn("hidden h-4 w-4 sm:block", overHero ? "text-white" : "text-navy-500")} aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-56 animate-fade-up rounded-2xl border border-navy-100 bg-white p-1.5 shadow-lift">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-semibold">{session.user.full_name}</p>
                      <p className="truncate text-xs capitalize text-navy-400">{role} account</p>
                    </div>
                    <Link href={dashboardPathFor(role)} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-cream-100">
                      <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Dashboard
                    </Link>
                    <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-cream-100">
                      <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link href="/auth/sign-in" className={cn("btn-ghost hidden sm:inline-flex", overHero && "text-white hover:bg-white/15")}>
              Sign In
            </Link>
          )}
          <button
            type="button"
            className={cn("rounded-full p-2 lg:hidden", overHero ? "text-white hover:bg-white/15" : "text-navy-700 hover:bg-white")}
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav id="mobile-nav" aria-label="Mobile" className="animate-fade-up border-t border-navy-100 bg-cream-100 lg:hidden">
          <div className="container-page flex flex-col gap-1 py-4">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-xl px-3 py-3 text-base font-medium hover:bg-white" aria-current={pathname.startsWith(n.href) ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {session ? (
                <Link href={dashboardPathFor(role)} className="btn-outline">Dashboard</Link>
              ) : (
                <Link href="/auth/sign-in" className="btn-outline">Sign In</Link>
              )}
              {role !== "teen" && role !== "admin" ? (
                <Link href={postJobHref(role)} className="btn-coral">Post a Job</Link>
              ) : (
                <Link href="/jobs" className="btn-primary">Browse jobs</Link>
              )}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
