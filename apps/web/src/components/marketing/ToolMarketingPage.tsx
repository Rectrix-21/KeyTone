import Link from "next/link";
import { ScrollReveal } from "@/components/layout/ScrollReveal";

interface ToolHighlight {
  title: string;
  description: string;
}

interface ToolMarketingPageProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  highlights: ToolHighlight[];
  ctaHref: string;
  ctaLabel: string;
  faq: { question: string; answer: string }[];
}

export function ToolMarketingPage({
  eyebrow,
  title,
  subtitle,
  highlights,
  ctaHref,
  ctaLabel,
  faq,
}: ToolMarketingPageProps) {
  return (
    <main className="home-landing-shell relative mx-auto w-full max-w-[1500px] px-4 py-12 sm:px-6 sm:py-16 xl:px-10">
      <div className="home-landing-aurora" aria-hidden="true" />

      <section className="relative overflow-hidden rounded-3xl border border-cyan-500/25 bg-black/35 px-6 py-12 backdrop-blur-sm sm:px-10 sm:py-16">
        <div className="home-hero-glow" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="home-hero-reveal text-sm uppercase tracking-[0.14em] text-cyan-200/80">
            {eyebrow}
          </p>
          <h1
            className="home-hero-reveal home-hero-title cyber-heading mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl"
            style={{ animationDelay: "40ms" }}
          >
            {title}
          </h1>
          <p
            className="home-hero-reveal mx-auto mt-5 max-w-3xl text-base text-foreground/75 sm:text-lg"
            style={{ animationDelay: "140ms" }}
          >
            {subtitle}
          </p>
          <div
            className="home-hero-reveal mt-8 flex flex-col justify-center gap-3 sm:flex-row"
            style={{ animationDelay: "240ms" }}
          >
            <Link
              href={ctaHref}
              className="cyber-btn-primary home-cta-primary px-6 py-3 text-center text-base font-medium"
            >
              {ctaLabel}
            </Link>
            <Link
              href={`/signup?next=${encodeURIComponent(ctaHref)}`}
              className="cyber-btn home-cta-secondary px-6 py-3 text-center text-base"
            >
              Sign up free
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <div className="mb-6 text-center">
          <p className="text-sm uppercase tracking-[0.14em] text-cyan-200/80">
            What it does
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {highlights.map((highlight, index) => (
            <ScrollReveal key={highlight.title} delayMs={(index % 3) * 70}>
              <article className="home-feature-card glass h-full rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-cyan-100">
                  {highlight.title}
                </h2>
                <p className="mt-2 text-base text-foreground/72">
                  {highlight.description}
                </p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <div className="mb-6 text-center">
          <p className="text-sm uppercase tracking-[0.14em] text-cyan-200/80">
            Frequently asked
          </p>
        </div>
        <div className="mx-auto max-w-3xl space-y-4">
          {faq.map((item) => (
            <article
              key={item.question}
              className="rounded-2xl border border-cyan-500/20 bg-black/35 p-5"
            >
              <h3 className="text-base font-semibold text-cyan-100">
                {item.question}
              </h3>
              <p className="mt-2 text-sm text-foreground/72">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <ScrollReveal>
        <section className="mt-16 rounded-3xl border border-[rgba(147,51,234,0.34)] bg-black/35 px-6 py-10 text-center backdrop-blur-sm sm:px-8">
          <p className="text-sm uppercase tracking-[0.14em] text-fuchsia-200/80">
            Start Now
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-fuchsia-100 sm:text-4xl">
            Try it free, no credit card required
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-foreground/72 sm:text-lg">
            Every free account gets weekly credits across all Create tools,
            and Discover tools are always free to use.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href={`/signup?next=${encodeURIComponent(ctaHref)}`}
              className="cyber-btn-primary home-cta-primary inline-flex px-7 py-3 text-base font-medium"
            >
              Sign up free
            </Link>
            <Link
              href={ctaHref}
              className="cyber-btn home-cta-secondary inline-flex px-7 py-3 text-base"
            >
              {ctaLabel}
            </Link>
          </div>
        </section>
      </ScrollReveal>
    </main>
  );
}
