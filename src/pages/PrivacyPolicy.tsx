import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg px-4 pt-6 pb-3 border-b border-border">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Privacy Policy</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="prose prose-sm dark:prose-invert max-w-none">

          <p className="text-muted-foreground text-sm">Last updated: 28 March 2026</p>

          <p>
            DINNR ("we", "us", "our") is committed to protecting your privacy. This policy explains what
            data we collect, why we collect it, how it is processed, and your rights under the General Data
            Protection Regulation (GDPR) and applicable EU/EEA data protection law.
          </p>

          <h2>1. Who we are (Data Controller)</h2>
          <p>
            The data controller responsible for your personal data is:<br />
            <strong>DINNR</strong><br />
            Email: <a href="mailto:privacy@dinnr.app">privacy@dinnr.app</a>
          </p>

          <h2>2. What data we collect and why</h2>

          <h3>2.1 Account &amp; recipe data</h3>
          <p>
            When you create an account we collect your <strong>email address</strong> and a securely hashed
            password (or, if you sign in with Google, a token from Google). Your recipes, meal plans, and
            grocery lists are stored on our behalf by <strong>Supabase</strong> (see section 5).
          </p>
          <p>
            <strong>Legal basis:</strong> Article 6(1)(b) GDPR — processing is necessary to perform the
            contract (providing the DINNR service to you).
          </p>

          <h3>2.2 Usage analytics (PostHog)</h3>
          <p>
            We use <strong>PostHog</strong> to understand how people use DINNR — for example, which pages
            are visited, when recipes are created, and which client (web or desktop) is being used. This
            helps us prioritise improvements.
          </p>
          <ul>
            <li>We <strong>do not</strong> send your email address, name, or any other directly identifying
              information to PostHog.</li>
            <li>You are identified only by a <strong>random internal ID</strong> (your Supabase user UUID).</li>
            <li>We <strong>do not</strong> collect your IP address (PostHog is configured with{" "}
              <code>ip: false</code>).</li>
            <li>PostHog stores a small token in your browser's <strong>localStorage</strong> to maintain
              session continuity across visits.</li>
            <li>All analytics data is stored on PostHog's <strong>EU-hosted infrastructure</strong> and
              does not leave the European Economic Area.</li>
          </ul>
          <p>
            <strong>Legal basis:</strong> Article 6(1)(f) GDPR — our legitimate interest in improving
            product quality and reliability. This processing uses no directly identifying data and is limited
            to aggregated behavioural signals.
          </p>

          <h3>2.3 Crash &amp; error reporting (Sentry)</h3>
          <p>
            We use <strong>Sentry</strong> to automatically capture errors and crashes so we can fix them
            quickly.
          </p>
          <ul>
            <li>Error reports include stack traces, browser/OS information, and the page you were on when
              the error occurred.</li>
            <li>If you are logged in, error reports are tagged with your <strong>Supabase UUID</strong> so
              we can correlate errors to specific accounts if needed for support. Your email address is
              never sent to Sentry.</li>
            <li>All error data is stored on Sentry's <strong>EU-hosted infrastructure (Germany)</strong>
              and does not leave the EEA.</li>
          </ul>
          <p>
            <strong>Legal basis:</strong> Article 6(1)(f) GDPR — our legitimate interest in maintaining the
            security and stability of the service.
          </p>

          <h2>3. Cookies and local storage</h2>
          <p>
            DINNR uses <strong>browser localStorage</strong> (not traditional cookies) for:
          </p>
          <ul>
            <li>Keeping you logged in (Supabase session token)</li>
            <li>Storing your language preference</li>
            <li>PostHog anonymous session identifier</li>
            <li>A flag indicating you have previously opened the app (used for onboarding analytics only)</li>
          </ul>
          <p>
            None of this data is shared with third parties beyond the processors listed in section 5.
          </p>

          <h2>4. How long we keep your data</h2>
          <table>
            <thead>
              <tr><th>Data</th><th>Retention period</th></tr>
            </thead>
            <tbody>
              <tr><td>Account &amp; recipe data</td><td>Until you delete your account</td></tr>
              <tr><td>PostHog analytics events</td><td>12 months (PostHog default)</td></tr>
              <tr><td>Sentry error events</td><td>90 days (Sentry default)</td></tr>
            </tbody>
          </table>
          <p>
            When you delete your account via Settings → Delete Account, all your recipes, meal plans,
            and grocery items are permanently deleted from our database. Your PostHog and Sentry records
            are identified only by UUID; you may request deletion of those records by contacting us (see
            section 7).
          </p>

          <h2>5. Data processors (third parties)</h2>
          <p>
            We use the following sub-processors to deliver the service. Each has been assessed for GDPR
            compliance and processes data only as instructed by us.
          </p>
          <table>
            <thead>
              <tr><th>Processor</th><th>Purpose</th><th>Data location</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Supabase</strong></td>
                <td>Database &amp; authentication hosting</td>
                <td>EU (Ireland)</td>
              </tr>
              <tr>
                <td><strong>PostHog</strong></td>
                <td>Product analytics</td>
                <td>EU (PostHog Cloud EU)</td>
              </tr>
              <tr>
                <td><strong>Sentry</strong></td>
                <td>Error &amp; crash monitoring</td>
                <td>EU (Germany)</td>
              </tr>
            </tbody>
          </table>
          <p>
            We do not sell your data to any third party, and we do not use it for advertising.
          </p>

          <h2>6. International transfers</h2>
          <p>
            All of our data processors are hosted within the EEA. No personal data is transferred to
            countries outside the EEA.
          </p>

          <h2>7. Your rights under GDPR</h2>
          <p>You have the following rights regarding your personal data:</p>
          <ul>
            <li><strong>Right of access</strong> — request a copy of the data we hold about you.</li>
            <li><strong>Right to rectification</strong> — ask us to correct inaccurate data.</li>
            <li><strong>Right to erasure</strong> — ask us to delete your data ("right to be forgotten").
              You can delete your account and all associated data directly in Settings.</li>
            <li><strong>Right to data portability</strong> — export your recipe data as JSON at any time
              via Settings → Backup Recipes.</li>
            <li><strong>Right to restrict processing</strong> — ask us to limit how we use your data.</li>
            <li><strong>Right to object</strong> — object to processing based on legitimate interests
              (analytics and crash reporting).</li>
            <li><strong>Right to lodge a complaint</strong> — you may lodge a complaint with your local
              supervisory authority. In the EU you can find your authority at{" "}
              <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en" target="_blank" rel="noopener noreferrer">
                edpb.europa.eu
              </a>.
            </li>
          </ul>
          <p>
            To exercise any of the above rights, contact us at{" "}
            <a href="mailto:privacy@dinnr.app">privacy@dinnr.app</a>. We will respond within 30 days.
          </p>

          <h2>8. Security</h2>
          <p>
            Passwords are hashed by Supabase and never stored in plain text. All data in transit is
            encrypted using TLS. We follow industry-standard security practices and monitor for errors
            via Sentry.
          </p>

          <h2>9. Children</h2>
          <p>
            DINNR is not directed at children under 16. We do not knowingly collect personal data from
            children. If you believe a child has provided us with personal data, please contact us and
            we will delete it promptly.
          </p>

          <h2>10. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Material changes will be communicated via the
            app. The date at the top of this page reflects when the policy was last updated.
          </p>

          <h2>11. Contact</h2>
          <p>
            For any privacy-related questions or GDPR requests:<br />
            <strong>Email:</strong> <a href="mailto:privacy@dinnr.app">privacy@dinnr.app</a>
          </p>

        </div>
      </div>
    </div>
  );
}
