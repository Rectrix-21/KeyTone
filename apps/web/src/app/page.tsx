import Link from "next/link";

const LANDING_FEATURES = [
  {
    title: "MIDI Generator",
    description: "Generate structured MIDI ideas in seconds.",
    label: "MG",
  },
  {
    title: "Chord Improver",
    description: "Upgrade progressions with smarter voicing.",
    label: "CI",
  },
  {
    title: "Stem Extraction",
    description: "Split tracks into focused production stems.",
    label: "SE",
  },
  {
    title: "Track Analyzer",
    description: "Detect BPM, key, sections, and harmonic flow.",
    label: "TA",
  },
  {
    title: "Similar Songs",
    description: "Find references with matching vibe and texture.",
    label: "SS",
  },
  {
    title: "BPM Tools",
    description: "Tap tempo and lock groove with confidence.",
    label: "BT",
  },
] as const;

const HOW_STEPS = [
  {
    title: "Pick A Tool",
    description: "Open analyzer, generator, or chord workspace.",
  },
  {
    title: "Shape Your Idea",
    description: "Tune key, mood, and complexity in context.",
  },
  {
    title: "Export Fast",
    description: "Download production-ready MIDI and assets.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="home-landing-shell relative mx-auto w-full max-w-[1500px] px-4 py-12 sm:px-6 sm:py-16 xl:px-10">
      <div className="home-landing-aurora" aria-hidden="true" />
      <div className="home-landing-grid" aria-hidden="true" />
      <div className="home-landing-particles" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, index) => (
          <span key={`landing-particle-${index}`} />
        ))}
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-cyan-500/25 bg-black/35 px-6 py-12 backdrop-blur-sm sm:px-10 sm:py-16">
        <div className="home-hero-glow" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="home-hero-title cyber-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Create better music. Faster.
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base text-foreground/75 sm:text-lg">
            KeyTone combines AI-powered MIDI generation, chord enhancement, stem
            extraction, and music discovery tools into one premium creative
            studio.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="cyber-btn-primary home-cta-primary px-6 py-3 text-center text-base font-medium"
            >
              Enter Studio
            </Link>
            <a
              href="#features"
              className="cyber-btn home-cta-secondary px-6 py-3 text-center text-base"
            >
              Explore Features
            </a>
          </div>
        </div>
      </section>

      <section id="features" className="relative mt-16">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.14em] text-cyan-200/80">
            Features
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-cyan-100 sm:text-3xl">
            Built for modern music workflows
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {LANDING_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="home-feature-card glass rounded-2xl p-5"
            >
              <span className="home-feature-icon">{feature.label}</span>
              <h3 className="mt-4 text-xl font-semibold text-cyan-100">
                {feature.title}
              </h3>
              <p className="mt-2 text-base text-foreground/72">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.14em] text-cyan-200/80">
            How It Works
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {HOW_STEPS.map((step, index) => (
            <article
              key={step.title}
              className="home-step-card rounded-2xl border border-cyan-500/20 bg-black/35 p-5"
            >
              <p className="text-sm uppercase tracking-[0.12em] text-cyan-300/80">
                Step {index + 1}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-cyan-100">
                {step.title}
              </h3>
              <p className="mt-2 text-base text-foreground/72">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-3xl border border-fuchsia-500/24 bg-black/35 px-6 py-10 text-center backdrop-blur-sm sm:px-8">
        <p className="text-sm uppercase tracking-[0.14em] text-fuchsia-200/80">
          Start Now
        </p>
        <h2 className="mt-2 text-3xl font-semibold text-fuchsia-100 sm:text-4xl">
          Start creating in seconds
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base text-foreground/72 sm:text-lg">
          Open your workspace, pick a tool, and turn ideas into musical output
          without friction.
        </p>
        <div className="mt-7">
          <Link
            href="/dashboard"
            className="cyber-btn-primary home-cta-primary inline-flex px-7 py-3 text-base font-medium"
          >
            Enter Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
