import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — DanceAI" },
      { name: "description", content: "How DanceAI collects, uses, and protects your data." },
      { property: "og:title", content: "Privacy Policy — DanceAI" },
      { property: "og:description", content: "How DanceAI collects, uses, and protects your data." },
      { property: "og:type", content: "article" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: "var(--gradient-glow)" }} />
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</Link>
        <h1 className="mt-6 font-display text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="font-display text-xl text-foreground">What we collect</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Account info:</strong> email address, display name, and (if provided) avatar.</li>
              <li><strong>Content:</strong> dance videos you upload and any practice recordings.</li>
              <li><strong>Payments:</strong> Mobile Money transaction ID and payment screenshot you submit for manual verification.</li>
              <li><strong>Usage:</strong> basic technical logs (browser, timestamps, error reports) to keep the Service running.</li>
            </ul>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">How we use it</h2>
            <p>To provide the Service — including AI pose extraction, generating lessons, scoring your practice, delivering notifications, and verifying manual payments. We do not sell your personal data.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">Where it lives</h2>
            <p>Data is stored with our infrastructure providers (Supabase for auth, database, and storage). Videos and screenshots are kept in private buckets accessible only to you and, for payments, our admin reviewers.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">AI processing</h2>
            <p>Uploaded videos may be processed by AI models (e.g. pose estimation and language models) strictly to generate lessons and feedback for you. We do not use your content to train third-party foundation models.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">Your rights</h2>
            <p>You can request access to, correction of, or deletion of your account and content at any time by contacting us in the app.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">Retention</h2>
            <p>We retain your data while your account is active. When you delete your account, associated videos and profile data are removed within a reasonable period, except where retention is legally required.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">Children</h2>
            <p>DanceAI is not directed to children under 13. If you believe a child has provided us data, contact us and we will remove it.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">Changes</h2>
            <p>We may update this policy. Material changes will be announced in the app.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">Contact</h2>
            <p>Questions about privacy? Reach out via the contact channel listed in the app.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
