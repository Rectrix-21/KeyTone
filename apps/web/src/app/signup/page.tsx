import { SignupForm } from "@/components/auth/AuthForms";

const SIGNUP_VALUE_PROPS = [
  "5 free credits every week for Create tools, no credit card required",
  "Track Analyzer, Similar Songs, and BPM Finder are free on every plan",
  "Audio to MIDI, chord improvement, and MIDI generation in one toolkit",
] as const;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto mt-10 grid w-full max-w-4xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
      <div className="hidden lg:block">
        <p className="text-sm uppercase tracking-[0.14em] text-cyan-200/80">
          Get started free
        </p>
        <h1 className="cyber-heading mt-2 text-3xl font-semibold text-cyan-50">
          Start turning songs into MIDI in minutes
        </h1>
        <ul className="mt-6 space-y-3 text-base text-foreground/75">
          {SIGNUP_VALUE_PROPS.map((prop) => (
            <li key={prop} className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>{prop}</span>
            </li>
          ))}
        </ul>
      </div>
      <SignupForm next={next} />
    </main>
  );
}
