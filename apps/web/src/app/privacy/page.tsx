import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | KeyTone",
  description:
    "How KeyTone collects, uses, stores, and protects your information, including account data, uploaded audio, and generated MIDI.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="relative mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
      <h1 className="cyber-heading text-4xl font-semibold tracking-tight text-cyan-50 sm:text-5xl">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-foreground/60">
        Last updated: July 19, 2026
      </p>

      <div className="prose-legal mt-10 space-y-10 text-base leading-relaxed text-foreground/80">
        <section>
          <p>
            KeyTone (&ldquo;KeyTone,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
            or &ldquo;our&rdquo;) is operated by an individual based in
            Calgary, Alberta, Canada. This Privacy Policy explains what
            information we collect when you use keytonestudio.com and the
            KeyTone Studio desktop companion app (together, the
            &ldquo;Service&rdquo;), how we use it, and the choices you have.
          </p>
          <p className="mt-3">
            By using the Service, you agree to the collection and use of
            information as described in this policy. If you do not agree,
            please do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            1. Information We Collect
          </h2>

          <h3 className="mt-5 text-lg font-semibold text-cyan-100/90">
            Account information
          </h3>
          <p className="mt-2">
            When you create an account, we collect your email address and a
            securely hashed password, or, if you sign in with Google, your
            name, email address, and profile picture as provided by Google.
            We never see or store your Google password.
          </p>

          <h3 className="mt-5 text-lg font-semibold text-cyan-100/90">
            Content you upload or generate
          </h3>
          <p className="mt-2">
            When you use a tool such as Audio to MIDI, Chord Improver, or
            Key &amp; BPM Changer, we process the audio or MIDI file you
            provide and store the file and the resulting output (MIDI files,
            analysis data) in your private account storage. This content is
            access-controlled so that only your account can read it.
          </p>

          <h3 className="mt-5 text-lg font-semibold text-cyan-100/90">
            Payment information
          </h3>
          <p className="mt-2">
            If you upgrade to a paid plan, your payment is processed by
            Stripe. We do not collect or store your full card number, CVC, or
            other card details on our servers &mdash; Stripe handles that
            directly and is responsible for its own PCI-compliant handling
            of your payment data. We receive and store your subscription
            status and billing history metadata (for example, whether your
            subscription is active) from Stripe.
          </p>

          <h3 className="mt-5 text-lg font-semibold text-cyan-100/90">
            Usage and log data
          </h3>
          <p className="mt-2">
            We keep a record of the tools you&apos;ve used, your project
            history, and your remaining credits, so the app can show you
            your history and enforce plan limits. Our infrastructure
            providers (see Section 3) may also automatically log standard
            technical data such as IP address, browser type, and request
            timestamps for security and reliability purposes.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            2. Cookies
          </h2>
          <p className="mt-2">
            KeyTone does not use advertising or analytics cookies, and we do
            not currently run any third-party analytics or tracking
            scripts. The only cookies we set are strictly necessary session
            cookies used to keep you signed in, managed by our
            authentication provider, Supabase. These essential cookies are
            required for the Service to function and cannot be disabled
            without also disabling sign-in.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            3. Third-Party Services
          </h2>
          <p className="mt-2">
            We rely on the following third-party providers to operate the
            Service. Each processes data on our behalf under their own
            privacy and security terms:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <span className="font-medium text-cyan-100/90">Supabase</span>{" "}
              &mdash; authentication, database, and encrypted file storage
              for your account, uploads, and generated files.
            </li>
            <li>
              <span className="font-medium text-cyan-100/90">Stripe</span>{" "}
              &mdash; payment processing and subscription billing.
            </li>
            <li>
              <span className="font-medium text-cyan-100/90">
                Spotify Web API
              </span>{" "}
              &mdash; used only when you search for a track in Similar Songs
              or Track Analyzer, to retrieve track metadata and preview
              audio. We do not access or require your personal Spotify
              account.
            </li>
            <li>
              <span className="font-medium text-cyan-100/90">
                Vercel and Railway
              </span>{" "}
              &mdash; hosting for our website and backend API.
            </li>
          </ul>
          <p className="mt-3">
            We do not sell your personal information, and we do not share it
            with third parties for their own marketing purposes.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            4. Data Retention
          </h2>
          <p className="mt-2">
            We retain your account information and content for as long as
            your account is active. If you delete your account, your
            account record, uploaded files, and generated content are
            deleted from our active systems. Some information may persist
            briefly in backups or with our infrastructure providers before
            being fully purged, and billing records may be retained longer
            where required for tax or accounting purposes.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            5. Your Rights and Choices
          </h2>
          <p className="mt-2">
            Wherever you&apos;re located, we offer the same core controls
            over your information:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <span className="font-medium text-cyan-100/90">
                Access and correction
              </span>{" "}
              &mdash; you can review and update your account details (name,
              profile picture) from your account menu at any time.
            </li>
            <li>
              <span className="font-medium text-cyan-100/90">Deletion</span>{" "}
              &mdash; you can permanently delete your account and associated
              content directly from your account settings, or by emailing
              us using the contact details below.
            </li>
            <li>
              <span className="font-medium text-cyan-100/90">
                Portability
              </span>{" "}
              &mdash; you can download the MIDI files and results generated
              from your projects directly from the app. For a copy of other
              account data, contact us below.
            </li>
          </ul>
          <p className="mt-3">
            If you are located in the European Economic Area or United
            Kingdom, you have rights under the GDPR, including the right to
            object to or restrict certain processing. If you are a
            California resident, you have rights under the CCPA, including
            the right to know what personal information we hold about you.
            If you are in Canada, we handle your personal information in
            accordance with PIPEDA. To exercise any of these rights, contact
            us using the details in Section 9.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            6. Data Security
          </h2>
          <p className="mt-2">
            We use industry-standard measures to protect your information,
            including encrypted storage, access-controlled file buckets so
            only your account can read your own uploads and generated
            files, and secure, hashed password storage. No method of
            transmission or storage is 100% secure, and we cannot guarantee
            absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            7. Children&apos;s Privacy
          </h2>
          <p className="mt-2">
            The Service is not directed to children under the age of 13 (or
            the applicable minimum age in your jurisdiction), and we do not
            knowingly collect personal information from children. If you
            believe a child has provided us with personal information,
            please contact us and we will delete it.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            8. Changes to This Policy
          </h2>
          <p className="mt-2">
            We may update this Privacy Policy from time to time. If we make
            material changes, we will update the &ldquo;Last updated&rdquo;
            date above. Continued use of the Service after changes take
            effect constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-cyan-100">
            9. Contact Us
          </h2>
          <p className="mt-2">
            If you have questions about this Privacy Policy or want to
            exercise any of your rights, contact us at{" "}
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
