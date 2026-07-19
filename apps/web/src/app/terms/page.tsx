import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | KeyTone",
  description:
    "The terms that govern your use of KeyTone's audio-to-MIDI, chord improvement, and music generation tools.",
  alternates: { canonical: "/terms" },
};

export default function TermsOfServicePage() {
  return (
    <main className="relative mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
      <h1 className="cyber-heading text-4xl font-semibold tracking-tight text-cyan-50 sm:text-5xl">
        Terms of Service
      </h1>
      <p className="mt-3 text-sm text-foreground/60">
        Last updated: July 19, 2026
      </p>

      <div className="prose-legal mt-10 space-y-10 text-base leading-relaxed text-foreground/80">
        <section>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of
            keytonestudio.com and the KeyTone Studio desktop companion app
            (together, the &ldquo;Service&rdquo;), operated by an individual
            based in Calgary, Alberta, Canada (&ldquo;KeyTone,&rdquo;
            &ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account or
            using the Service, you agree to these Terms. If you do not
            agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            1. Description of Service
          </h2>
          <p className="mt-2">
            KeyTone provides audio-to-MIDI transcription, chord progression
            generation and improvement, track analysis, and related music
            tools, available through your browser and an optional desktop
            companion app for local stem separation. Some features are free
            to use; others require a paid subscription (&ldquo;Pro
            plan&rdquo;).
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            2. Accounts and Eligibility
          </h2>
          <p className="mt-2">
            You must create an account to use most features of the Service.
            You are responsible for maintaining the confidentiality of your
            login credentials and for all activity under your account. You
            must be at least 13 years old (or the minimum age of digital
            consent in your jurisdiction) to use the Service. You agree to
            provide accurate account information and to keep it up to date.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            3. Subscriptions, Billing, and Cancellation
          </h2>
          <p className="mt-2">
            The Free plan includes limited weekly credits for Create tools
            and unlimited use of Discover tools. The Pro plan is billed on a
            recurring monthly basis through Stripe at the price displayed on
            our pricing page at the time of purchase. By subscribing, you
            authorize us (via Stripe) to charge your payment method on a
            recurring basis until you cancel.
          </p>
          <p className="mt-3">
            You may cancel your subscription at any time from your account
            settings; cancellation takes effect at the end of your current
            billing period, and you will retain Pro access until then.
            Except where required by law, payments are non-refundable. We
            may change subscription pricing with reasonable advance notice;
            continued use after a price change takes effect constitutes
            acceptance of the new price.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            4. Acceptable Use
          </h2>
          <p className="mt-2">You agree not to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              Upload content you do not have the legal right to use, or that
              infringes another person&apos;s copyright or other rights;
            </li>
            <li>
              Use the Service to generate content for unlawful purposes, or
              in a way that violates any applicable law;
            </li>
            <li>
              Attempt to circumvent credit limits, plan restrictions, or
              security measures, or interfere with the Service&apos;s normal
              operation;
            </li>
            <li>
              Reverse engineer, scrape, or resell access to the Service
              without our prior written consent.
            </li>
          </ul>
          <p className="mt-3">
            We may suspend or terminate accounts that violate these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            5. Your Content and Ownership
          </h2>
          <p className="mt-2">
            You retain all ownership rights to the audio and MIDI files you
            upload, and to the MIDI files and other output KeyTone generates
            for you. You grant us a limited license to store and process
            your content solely to provide and improve the Service. We do
            not claim ownership over your uploads or your generated output,
            and we do not use your content to train models without your
            separate consent.
          </p>
          <p className="mt-3">
            You are responsible for ensuring you have the necessary rights
            to any audio you upload, including for copyrighted commercial
            recordings.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            6. Accuracy of Generated Content
          </h2>
          <p className="mt-2">
            KeyTone&apos;s transcription, chord detection, and generation
            tools use automated audio analysis and algorithmic music
            generation. While we work to make results as accurate and
            musically useful as possible, transcription and generation
            quality can vary depending on the source material, and results
            may contain missed notes, extra notes, mislabeled chords, or
            other imperfections. Generated MIDI and analysis results are
            provided as a creative starting point, not a guaranteed
            accurate reproduction, and you should review and adjust output
            before relying on it.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            7. Third-Party Services
          </h2>
          <p className="mt-2">
            The Service relies on third-party providers, including Stripe
            for payments, Supabase for authentication and storage, and the
            Spotify Web API for track search in certain tools. Your use of
            features that rely on these providers is also subject to their
            own terms and policies. We are not responsible for the
            availability or performance of third-party services outside our
            control.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            8. Disclaimers and Limitation of Liability
          </h2>
          <p className="mt-2">
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as
            available,&rdquo; without warranties of any kind, express or
            implied, including warranties of merchantability, fitness for a
            particular purpose, or non-infringement. We do not guarantee the
            Service will be uninterrupted, error-free, or that generated
            content will meet your expectations.
          </p>
          <p className="mt-3">
            To the maximum extent permitted by law, KeyTone will not be
            liable for any indirect, incidental, special, consequential, or
            punitive damages, or for any loss of data, revenue, or profits,
            arising from your use of the Service. Our total liability for
            any claim relating to the Service will not exceed the amount
            you paid us in the twelve months before the claim arose.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            9. Termination
          </h2>
          <p className="mt-2">
            You may stop using the Service and delete your account at any
            time. We may suspend or terminate your access if you violate
            these Terms, with notice where reasonably practical. Upon
            termination, your right to use the Service ends, and we will
            handle any remaining data as described in our{" "}
            <a href="/privacy" className="text-cyan-300 hover:text-cyan-200">
              Privacy Policy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            10. Governing Law
          </h2>
          <p className="mt-2">
            These Terms are governed by the laws of the Province of Alberta
            and the federal laws of Canada applicable therein, without
            regard to conflict-of-law principles. Any dispute arising from
            these Terms or the Service will be subject to the exclusive
            jurisdiction of the courts of Alberta, Canada.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            11. Changes to These Terms
          </h2>
          <p className="mt-2">
            We may update these Terms from time to time. If we make
            material changes, we will update the &ldquo;Last updated&rdquo;
            date above. Continued use of the Service after changes take
            effect constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            12. Contact Us
          </h2>
          <p className="mt-2">
            Questions about these Terms can be sent to{" "}
            <a
              href="mailto:rectrix21@gmail.com"
              className="text-cyan-300 hover:text-cyan-200"
            >
              rectrix21@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
