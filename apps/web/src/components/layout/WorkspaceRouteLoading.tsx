import {
  ToolPageShell,
  type ToolShellRoute,
} from "@/components/layout/ToolPageShell";

interface WorkspaceRouteLoadingProps {
  label: string;
  active: ToolShellRoute;
}

export function WorkspaceRouteLoading({
  label,
  active,
}: WorkspaceRouteLoadingProps) {
  return (
    <ToolPageShell active={active}>
      <article className="glass rounded-xl p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/80">
          Loading
        </p>
        <h1 className="mt-1 text-xl font-semibold text-cyan-100 sm:text-2xl">
          {label}
        </h1>
        <div className="mt-5 inline-flex items-center gap-2">
          <span className="tool-route-loading-dot" />
          <span className="tool-route-loading-dot" />
          <span className="tool-route-loading-dot" />
        </div>
        <p className="mt-3 text-xs uppercase tracking-[0.12em] text-cyan-100/90">
          Preparing workspace...
        </p>
      </article>
    </ToolPageShell>
  );
}
