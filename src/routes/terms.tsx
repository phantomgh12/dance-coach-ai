import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — DanceAI" },
      { name: "description", content: "The terms that govern your use of DanceAI." },
      { property: "og:title", content: "Terms of Service — DanceAI" },
      { property: "og:description", content: "The terms that govern your use of DanceAI." },
      { property: "og:type", content: "article" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: "var(--gradient-glow)" }} />
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</Link>
        <h1 className="mt-6 font-display text-4xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="font-display text-xl text-foreground">1. Acceptance</h2>
            <p>By creating an account or using DanceAI ("the Service"), you agree to these Terms. If you do not agree, do not use the Service.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">2. The Service</h2>
            <p>DanceAI lets you upload short dance videos and receive AI-generated learning content and practice feedback. Features may change as the product evolves.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">3. Your account</h2>
            <p>You are responsible for keeping your credentials secure and for all activity under your account. You must be at least 13 years old to use DanceAI.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">4. Your content</h2>
            <p>You retain ownership of videos and materials you upload. You grant DanceAI a limited license to store, process, and analyze that content solely to provide the Service to you.</p>
            <p>Do not upload content you do not have the right to use, or content that is unlawful, harmful, or infringes on others' rights.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">5. Payments</h2>
            <p>Paid plans are billed in Ghana Cedi (GHS) via manual Mobile Money transfer. Subscriptions activate after our team verifies your payment. Payments are non-refundable except where required by law.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">6. Acceptable use</h2>
            <p>You agree not to abuse, reverse engineer, or interfere with the Service, and not to use it to harass others or violate applicable law.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">7. Termination</h2>
            <p>We may suspend or terminate accounts that violate these Terms. You may stop using the Service at any time.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">8. Disclaimer</h2>
            <p>The Service is provided "as is" without warranties of any kind. AI feedback is for educational purposes only and is not a substitute for professional coaching or medical advice.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">9. Limitation of liability</h2>
            <p>To the maximum extent permitted by law, DanceAI is not liable for indirect, incidental, or consequential damages arising from your use of the Service.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">10. Changes</h2>
            <p>We may update these Terms. Continued use of the Service after changes means you accept the updated Terms.</p>
          </section>
          <section>
            <h2 className="font-display text-xl text-foreground">11. Contact</h2>
            <p>Questions? Reach out via the contact channel listed in the app.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
