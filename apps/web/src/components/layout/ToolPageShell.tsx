"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ContactModal } from "@/components/layout/ContactModal";

export type ToolShellRoute =
  | "dashboard"
  | "analyzer"
  | "similar"
  | "bpm"
  | "extract"
  | "chords"
  | "generator";

type ToolNavItem = {
  href: string;
  label: string;
  route: ToolShellRoute;
};

const DASHBOARD_NAV_ITEM: ToolNavItem = {
  href: "/dashboard",
  label: "Dashboard Hub",
  route: "dashboard",
};

const CREATE_NAV_ITEMS: ToolNavItem[] = [
  { href: "/extract", label: "Stem and MIDI Extraction", route: "extract" },
  { href: "/chords", label: "Chord Improver", route: "chords" },
  { href: "/generator", label: "Track Generator", route: "generator" },
];

const DISCOVER_NAV_ITEMS: ToolNavItem[] = [
  { href: "/analyzer", label: "Track Analyzer", route: "analyzer" },
  { href: "/similar", label: "Similar Songs", route: "similar" },
  { href: "/bpm", label: "BPM Finder", route: "bpm" },
];

const TOOL_NAV_ITEMS: ToolNavItem[] = [
  DASHBOARD_NAV_ITEM,
  ...CREATE_NAV_ITEMS,
  ...DISCOVER_NAV_ITEMS,
];

interface ToolPageShellProps {
  active: ToolShellRoute;
  children: React.ReactNode;
}

export function ToolPageShell({ active, children }: ToolPageShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const [optimisticActiveRoute, setOptimisticActiveRoute] =
    useState<ToolShellRoute | null>(null);
  const [isContactOpen, setIsContactOpen] = useState(false);

  const visibleActiveRoute = optimisticActiveRoute ?? active;

  const activeHref = useMemo(() => {
    return (
      TOOL_NAV_ITEMS.find((item) => item.route === visibleActiveRoute)?.href ??
      null
    );
  }, [visibleActiveRoute]);

  useEffect(() => {
    for (const item of TOOL_NAV_ITEMS) {
      router.prefetch(item.href);
    }
  }, [router]);

  useEffect(() => {
    setIsNavigating(false);
    setOptimisticActiveRoute(null);
  }, [pathname]);

  return (
    <div className="tool-scale w-full px-3 py-6 sm:px-5 sm:py-8 xl:px-8">
      <div className="grid gap-6 md:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-8">
        <div className="hidden flex-col gap-4 md:flex">
          <aside className="tool-sidebar glass rounded-xl p-3">
            <p className="px-2 pb-1 text-[11px] uppercase tracking-[0.14em] text-cyan-200/70">
              Workspace
            </p>
            <nav className="space-y-1.5">
              {[DASHBOARD_NAV_ITEM].map((item) => (
                <Link
                  key={item.route}
                  href={item.href}
                  prefetch
                  onClick={() => {
                    if (item.href === activeHref) {
                      return;
                    }
                    setOptimisticActiveRoute(item.route);
                    setIsNavigating(true);
                  }}
                  className={`tool-sidebar-link block rounded-lg px-3 py-2 text-base transition ${
                    visibleActiveRoute === item.route
                      ? "border border-cyan-300/55 bg-cyan-500/16 text-cyan-100"
                      : "border border-transparent text-foreground/75 hover:border-cyan-700/45 hover:bg-cyan-500/8 hover:text-cyan-100"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-4">
              <p className="px-2 pb-1 text-[11px] uppercase tracking-[0.14em] text-fuchsia-200/75">
                Create
              </p>
              <nav className="space-y-1.5">
                {CREATE_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.route}
                    href={item.href}
                    prefetch
                    onClick={() => {
                      if (item.href === activeHref) {
                        return;
                      }
                      setOptimisticActiveRoute(item.route);
                      setIsNavigating(true);
                    }}
                    className={`tool-sidebar-link block rounded-lg px-3 py-2 text-base transition ${
                      visibleActiveRoute === item.route
                        ? "border border-cyan-300/55 bg-cyan-500/16 text-cyan-100"
                        : "border border-transparent text-foreground/75 hover:border-cyan-700/45 hover:bg-cyan-500/8 hover:text-cyan-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="mt-4">
              <p className="px-2 pb-1 text-[11px] uppercase tracking-[0.14em] text-cyan-200/75">
                Discover
              </p>
              <nav className="space-y-1.5">
                {DISCOVER_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.route}
                    href={item.href}
                    prefetch
                    onClick={() => {
                      if (item.href === activeHref) {
                        return;
                      }
                      setOptimisticActiveRoute(item.route);
                      setIsNavigating(true);
                    }}
                    className={`tool-sidebar-link block rounded-lg px-3 py-2 text-base transition ${
                      visibleActiveRoute === item.route
                        ? "border border-cyan-300/55 bg-cyan-500/16 text-cyan-100"
                        : "border border-transparent text-foreground/75 hover:border-cyan-700/45 hover:bg-cyan-500/8 hover:text-cyan-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          <aside className="tool-sidebar glass rounded-xl p-3">
            <p className="px-2 pb-1 text-[11px] uppercase tracking-[0.14em] text-cyan-200/75">
              Support
            </p>
            <nav className="space-y-1.5">
              <button
                type="button"
                onClick={() => setIsContactOpen(true)}
                className="tool-sidebar-link block w-full rounded-lg border border-transparent px-3 py-2 text-left text-base text-foreground/75 transition hover:border-cyan-700/45 hover:bg-cyan-500/8 hover:text-cyan-100"
              >
                Contact Me
              </button>
            </nav>
          </aside>
        </div>

        <section className="page-enter relative min-w-0">
          {isNavigating ? (
            <div
              className="tool-route-loading"
              aria-live="polite"
              role="status"
            >
              <div className="tool-route-loading-shell">
                <span className="tool-route-loading-dot" />
                <span className="tool-route-loading-dot" />
                <span className="tool-route-loading-dot" />
              </div>
              <p className="tool-route-loading-text">Opening workspace...</p>
            </div>
          ) : null}
          {children}
        </section>
      </div>

      <ContactModal
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
      />
    </div>
  );
}
