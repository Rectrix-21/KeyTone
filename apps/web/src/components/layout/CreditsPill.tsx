import { UserSummary } from "@/types/api";

interface CreditsPillProps {
  me: UserSummary | null;
  loading: boolean;
}

export function CreditsPill({ me, loading }: CreditsPillProps) {
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-cyan-500/30 bg-black/35 px-2.5 py-1 text-xs text-cyan-100/90 sm:inline-flex"
      title="Credits remaining"
    >
      <span className="uppercase tracking-wide text-cyan-200/70">
        Credits
      </span>
      <span className="font-semibold">
        {loading
          ? "..."
          : me?.unlimited_credits
            ? "Unlimited"
            : (me?.remaining_credits ?? 0)}
      </span>
    </span>
  );
}
