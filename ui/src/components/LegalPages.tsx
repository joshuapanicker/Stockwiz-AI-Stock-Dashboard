import { ArrowLeft } from "lucide-react";

// ── Shared full-screen legal document shell ──────────────────────────────

interface DocProps {
  open: boolean;
  onClose: () => void;
}

function LegalShell({ open, onClose, title, updated, children }: DocProps & {
  title: string; updated: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] bg-bg flex flex-col anim-fade-in">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border/50 flex-shrink-0">
        <button onClick={onClose}
          className="flex items-center gap-1.5 text-muted hover:text-white text-sm transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="w-px h-5 bg-border/50" />
        <p className="text-white font-semibold">{title}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-5 text-sm text-white/70 leading-relaxed pb-16">
          <p className="text-muted text-xs">Last updated: {updated}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-white font-semibold text-base pt-2">{children}</h2>;
}

// ── Terms of Service ──────────────────────────────────────────────────────

export function TermsOfService({ open, onClose }: DocProps) {
  return (
    <LegalShell open={open} onClose={onClose} title="Terms of Service" updated="July 10, 2026">
      <p>
        These Terms of Service ("Terms") govern your use of Stockbrook (the "Service"),
        operated as an independent, personal project. By creating an account or
        using the Service, you agree to these Terms. If you don't agree, don't use
        the Service.
      </p>

      <H2>1. Not Financial Advice</H2>
      <p>
        Stockbrook provides stock screening, portfolio tracking, and AI-generated
        commentary for informational and educational purposes only. Nothing on
        this Service — including AI analysis, buy/sell verdicts, price
        predictions, or the public AI track record — constitutes financial,
        investment, tax, or legal advice, or a recommendation to buy, sell, or
        hold any security. Stockbrook is not a registered investment adviser,
        broker-dealer, or financial institution, and does not provide advice
        for compensation.
      </p>
      <p>
        AI-generated content is produced by large language models and may be
        incomplete, outdated, or wrong. Market data is sourced from third
        parties (e.g. Yahoo Finance) and may be delayed or inaccurate. You are
        solely responsible for your own investment decisions. Consult a
        licensed financial advisor before making decisions with real money.
      </p>

      <H2>2. No Warranty</H2>
      <p>
        The Service is provided "as is" and "as available," without warranties
        of any kind, express or implied, including fitness for a particular
        purpose, accuracy, or uninterrupted availability. We do not guarantee
        the Service will be error-free, secure, or continuously available.
      </p>

      <H2>3. Limitation of Liability</H2>
      <p>
        To the fullest extent permitted by law, Stockbrook and its operator will
        not be liable for any indirect, incidental, special, consequential, or
        punitive damages, or any loss of profits, revenue, or investment
        capital, arising from your use of (or inability to use) the Service —
        including losses resulting from AI-generated analysis, screening
        results, or predictions. Your use of the Service to inform real
        financial decisions is entirely at your own risk.
      </p>

      <H2>4. Your Account</H2>
      <p>
        You're responsible for keeping your login credentials secure and for
        all activity under your account. You must provide a valid email
        address and are responsible for the accuracy of information you
        provide (e.g. investment profile, screening criteria).
      </p>

      <H2>5. Brokerage Connections (Plaid)</H2>
      <p>
        If you connect a brokerage account via Plaid, you authorize Stockbrook to
        access read-only account and holdings data through Plaid's service to
        power the portfolio tracker. Stockbrook does not have the ability to
        place trades, move funds, or modify your brokerage account. Plaid's own
        terms and privacy practices also apply to that connection. Note: in
        its current form, brokerage connections use Plaid's sandbox
        environment and do not connect to real, live brokerage accounts.
      </p>

      <H2>6. Acceptable Use</H2>
      <p>
        You agree not to misuse the Service — including attempting to
        circumvent AI usage limits, scraping or bulk-extracting data,
        interfering with the Service's operation, or using it for unlawful
        purposes.
      </p>

      <H2>7. Changes to the Service or Terms</H2>
      <p>
        Stockbrook is an evolving personal project. Features, pricing, and these
        Terms may change at any time. Continued use after changes take effect
        constitutes acceptance of the updated Terms. If pricing changes affect
        your account, we'll aim to give reasonable notice.
      </p>

      <H2>8. Termination</H2>
      <p>
        You may stop using the Service and delete your account at any time. We
        may suspend or terminate access for violation of these Terms or
        misuse of the Service.
      </p>

      <H2>9. Contact</H2>
      <p>
        Questions about these Terms can be directed to the contact information
        provided in your account settings or the project's repository.
      </p>
    </LegalShell>
  );
}

// ── Privacy Policy ────────────────────────────────────────────────────────

export function PrivacyPolicy({ open, onClose }: DocProps) {
  return (
    <LegalShell open={open} onClose={onClose} title="Privacy Policy" updated="July 10, 2026">
      <p>
        This Privacy Policy explains what information Stockbrook collects, how
        it's used, and your choices. Stockbrook is a personal project operated
        by an individual developer, not a company with a dedicated legal or
        privacy team — but we take reasonable, good-faith steps to protect
        your data.
      </p>

      <H2>1. Information We Collect</H2>
      <p><strong className="text-white/85">Account information:</strong> email
        address and password (if you sign up directly), or your name, email,
        and profile identifier if you sign in with Google. Authentication is
        handled by Supabase.</p>
      <p><strong className="text-white/85">Investment data you provide:</strong> portfolio
        holdings, screening criteria, investment profile (risk tolerance,
        preferred sectors, etc.), and price alerts you configure.</p>
      <p><strong className="text-white/85">Brokerage data (optional):</strong> if
        you connect a brokerage account via Plaid, we receive read-only
        account and holdings data through Plaid to power the portfolio
        tracker. We do not receive your brokerage login credentials — Plaid
        handles that authentication directly.</p>
      <p><strong className="text-white/85">AI interaction data:</strong> messages
        you send to the AI assistant, and stock analyses you request, are sent
        to Anthropic's Claude API to generate responses. If you use your own
        Anthropic API key, that key is stored so we can use it on your behalf,
        and requests are billed to your own Anthropic account instead of
        ours.</p>
      <p><strong className="text-white/85">Usage data:</strong> basic
        operational data such as AI token usage (to enforce free-tier limits)
        and, in aggregate, application logs needed to operate and debug the
        Service.</p>

      <H2>2. How We Use Information</H2>
      <p>
        To operate the Service (screening, portfolio tracking, AI analysis,
        alerts), to authenticate you, to enforce usage limits, to improve the
        Service, and to communicate with you about your account. We do not
        sell your personal information.
      </p>
      <p>
        AI-generated stock analyses (not tied to your personal identity) may
        be used to build and improve future AI models that power the Service.
        Your personal account data, portfolio holdings, and brokerage
        connection are never included in that process — only the
        depersonalized analysis text itself.
      </p>

      <H2>3. Third Parties We Use</H2>
      <p>
        <strong className="text-white/85">Supabase</strong> — authentication
        and database hosting. <strong className="text-white/85">Anthropic</strong> — AI
        analysis (Claude API). <strong className="text-white/85">Plaid</strong> — optional
        brokerage account connections. <strong className="text-white/85">Yahoo
        Finance</strong> — market data (no personal data shared).{" "}
        <strong className="text-white/85">Railway</strong> and{" "}
        <strong className="text-white/85">Vercel</strong> — application hosting.
        Each of these providers has its own privacy practices governing data
        they process on our behalf.
      </p>
      <p>
        <strong className="text-white/85">Plaid notice and consent.</strong> By
        connecting a financial account through the Service, you acknowledge and
        agree that Plaid Inc. ("Plaid") will collect, use, and share your
        information in accordance with the{" "}
        <a href="https://plaid.com/legal" target="_blank" rel="noopener noreferrer"
          className="text-green hover:underline">Plaid End User Privacy Policy</a>{" "}
        (available at https://plaid.com/legal). We encourage you to review that
        policy to understand how Plaid handles your data.
      </p>

      <H2>4. Data Security</H2>
      <p>
        Your data is protected with row-level security so that, by default,
        only you (and Stockbrook's backend) can access your account records.
        Passwords are never stored by us directly — authentication is handled
        by Supabase. No method of transmission or storage is 100% secure, and
        we can't guarantee absolute security.
      </p>

      <H2>5. Your Choices</H2>
      <p>
        You can update or delete your investment profile, criteria, and
        portfolio holdings at any time from within the app. You can
        disconnect a linked brokerage account at any time from Settings. You
        can request full account deletion by contacting us — this removes
        your account and associated personal data, subject to any data we're
        required to retain for legal or security purposes.
      </p>

      <H2>6. Data Retention</H2>
      <p>
        We retain your account data for as long as your account is active.
        Depersonalized AI analysis logs (used for future model improvement,
        see Section 2) are retained separately from your personal account
        data and are not linked back to your identity.
      </p>

      <H2>7. Children's Privacy</H2>
      <p>
        The Service is not directed to individuals under 18, and we do not
        knowingly collect data from children.
      </p>

      <H2>8. Changes to This Policy</H2>
      <p>
        We may update this Privacy Policy as the Service evolves. Material
        changes will be reflected by updating the "Last updated" date above.
      </p>

      <H2>9. Contact</H2>
      <p>
        Questions about this Privacy Policy or requests regarding your data
        can be directed to the contact information provided in your account
        settings or the project's repository.
      </p>
    </LegalShell>
  );
}
