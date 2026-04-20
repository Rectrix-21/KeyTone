import Link from "next/link";

export type ToolShellRoute =
  | "dashboard"
  | "analyzer"
  | "similar"
  | "bpm"
  | "extract"
  | "chords"
  | "generator";

const TOOL_NAV_ITEMS: Array<{
  href: string;
  label: string;
  route: ToolShellRoute;
}> = [
  { href: "/dashboard", label: "Dashboard Hub", route: "dashboard" },
  { href: "/analyzer", label: "Track Analyzer", route: "analyzer" },
  { href: "/similar", label: "Similar Songs", route: "similar" },
  { href: "/bpm", label: "BPM Finder", route: "bpm" },
  { href: "/extract", label: "MIDI Tools", route: "extract" },
  { href: "/chords", label: "Chord Improver", route: "chords" },
  { href: "/generator", label: "Track Generator", route: "generator" },
];

interface ToolPageShellProps {
  active: ToolShellRoute;
  children: React.ReactNode;
}

export function ToolPageShell({ active, children }: ToolPageShellProps) {
  return (
    <div className="tool-scale w-full px-3 py-6 sm:px-5 sm:py-8 xl:px-8">
      <div className="grid gap-6 md:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-8">
        <aside className="tool-sidebar glass hidden rounded-xl p-3 md:block">
          <p className="px-2 pb-2 text-xs uppercase tracking-[0.14em] text-cyan-200/75">
            Tools
          </p>
          <nav className="space-y-1.5">
            {TOOL_NAV_ITEMS.map((item) => (
              <Link
                key={item.route}
                href={item.href}
                className={`tool-sidebar-link block rounded-lg px-3 py-2 text-base transition ${
                  active === item.route
                    ? "border border-cyan-300/55 bg-cyan-500/16 text-cyan-100"
                    : "border border-transparent text-foreground/75 hover:border-cyan-700/45 hover:bg-cyan-500/8 hover:text-cyan-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="page-enter min-w-0">{children}</section>
      </div>
    </div>
  );
}
