"use client";

import { createCheckout, getMe } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [startFreeLoading, setStartFreeLoading] = useState(false);
  const [checkingPlan, setCheckingPlan] = useState(true);
  const [isActivePro, setIsActivePro] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        if (mounted) {
          setIsActivePro(false);
          setCheckingPlan(false);
        }
        return;
      }

      try {
        const me = await getMe(accessToken);
        if (mounted) {
          setIsActivePro(me.subscription_status === "active");
        }
      } catch {
        if (mounted) {
          setIsActivePro(false);
        }
      } finally {
        if (mounted) {
          setCheckingPlan(false);
        }
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, []);

  const onStartFree = async () => {
    setError(null);
    setStartFreeLoading(true);

    const supabase = createClient();
    const { data } = await supabase.auth.getSession();

    if (data.session?.access_token) {
      router.push("/dashboard");
      return;
    }

    router.push("/login");
  };

  const onUpgrade = async () => {
    setError(null);

    if (isActivePro) {
      router.push("/dashboard");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();

    if (!data.session?.access_token) {
      setLoading(false);
      router.push("/login");
      return;
    }

    try {
      const response = await createCheckout(data.session.access_token);
      window.location.href = response.checkout_url;
    } catch (checkoutError) {
      const isFetchFailure =
        checkoutError instanceof TypeError &&
        checkoutError.message.toLowerCase().includes("fetch");
      setError(
        isFetchFailure
          ? "Could not reach billing server. Ensure API is running and CORS allows your frontend origin."
          : checkoutError instanceof Error
            ? checkoutError.message
            : "Failed to start checkout",
      );
      setLoading(false);
    }
  };

  return (
    <main className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div className="absolute left-[-7%] top-[8%] h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute right-[-5%] top-[14%] h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute bottom-[8%] left-[36%] h-60 w-60 rounded-full bg-cyan-500/16 blur-3xl" />
      </div>

      <section className="mx-auto max-w-3xl text-center">
        <h1 className="cyber-heading text-4xl font-semibold tracking-tight text-cyan-50 sm:text-5xl">
          Simple, creator-friendly pricing
        </h1>
        <p className="mt-4 text-base text-foreground/70 sm:text-lg">
          Start free. Unlock full creative control when you&apos;re ready.
        </p>
      </section>

      <section className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-2 lg:items-stretch">
        <article className="glass rounded-2xl border-cyan-500/22 p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/38 hover:shadow-[0_0_30px_rgba(34,211,238,0.12)]">
          <p className="text-sm uppercase tracking-[0.14em] text-cyan-200/80">
            Free
          </p>
          <p className="mt-3 text-4xl font-semibold text-cyan-50">$0</p>
          <ul className="mt-6 space-y-3 text-sm text-foreground/75 sm:text-base">
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>
                Access to all Discover tools (Track Analyzer, Similar Songs, BPM
                Finder)
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>5 credits per month for Create tools</span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>Track Starter: Safe mode only</span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>Standard MIDI and chord generation</span>
            </li>
          </ul>
          <div className="mt-8">
            <button
              type="button"
              onClick={() => void onStartFree()}
              disabled={startFreeLoading}
              className="cyber-btn inline-flex w-full justify-center rounded-xl px-4 py-3 text-base font-medium"
            >
              {startFreeLoading ? "Checking account..." : "Start Free"}
            </button>
          </div>
        </article>

        <div className="rounded-2xl bg-gradient-to-br from-fuchsia-400/60 via-indigo-400/55 to-cyan-400/60 p-[1px] shadow-[0_0_34px_rgba(139,92,246,0.28)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_42px_rgba(139,92,246,0.36)] lg:scale-[1.03]">
          <article className="glass relative h-full rounded-2xl border-transparent bg-black/55 p-6 sm:p-7">
            <span className="absolute right-5 top-5 rounded-full border border-fuchsia-300/45 bg-fuchsia-500/20 px-3 py-1 text-xs uppercase tracking-[0.12em] text-fuchsia-100">
              Most Popular
            </span>

            <p className="text-sm uppercase tracking-[0.14em] text-fuchsia-200/85">
              Pro
            </p>
            <p className="mt-3 text-4xl font-semibold text-cyan-50">
              $9.99
              <span className="ml-1 text-lg font-medium text-foreground/65">
                /month
              </span>
            </p>

            <ul className="mt-6 space-y-3 text-sm text-foreground/75 sm:text-base">
              <li className="flex gap-2">
                <span className="text-fuchsia-300">•</span>
                <span>100 credits per month for Create tools</span>
              </li>
              <li className="flex gap-2">
                <span className="text-fuchsia-300">•</span>
                <span>Track Starter: Safe, Fresh, and Experimental modes</span>
              </li>
              <li className="flex gap-2">
                <span className="text-fuchsia-300">•</span>
                <span>
                  Advanced chord improver styles and stronger variations
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-fuchsia-300">•</span>
                <span>Full MIDI variation access</span>
              </li>
              <li className="flex gap-2">
                <span className="text-fuchsia-300">•</span>
                <span>Early access to new features</span>
              </li>
            </ul>

            <div className="mt-8">
              <button
                onClick={onUpgrade}
                disabled={loading || checkingPlan || isActivePro}
                className="cyber-btn-primary inline-flex w-full justify-center rounded-xl px-4 py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-70"
              >
                {checkingPlan
                  ? "Checking plan..."
                  : isActivePro
                    ? "Already on Pro"
                    : loading
                      ? "Redirecting..."
                      : "Upgrade to Pro"}
              </button>
            </div>

            {isActivePro ? (
              <p className="mt-3 text-sm text-cyan-100/85">
                Your Pro subscription is active.
              </p>
            ) : null}

            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          </article>
        </div>
      </section>

      <p className="mt-10 text-center text-sm text-foreground/65">
        Discover tools are always free. Pay only for creative power.
      </p>
    </main>
  );
}
