export const metadata = {
  title: "Privacy & Data Use — Life 'n' Grace"
};

export default function PolicyPage() {
  return (
    <section className="grid">
      <div className="card">
        <span className="pill">Privacy &amp; data use</span>
        <h1>Transparent Data Use</h1>
        <p className="muted">
          Life-n-Grace exists to support prayer, not to distract or manipulate.
          This page explains what we collect, why, and the control you have.
        </p>
        <p className="muted">
          <em>
            This is a preview/demo build. It is shared with a limited group and
            is not yet a public launch. Do not enter information you would not
            want stored in a demo environment.
          </em>
        </p>

        <div className="grid">
          <div className="card-soft">
            <h3>What we store</h3>
            <p>
              Your account email, a securely hashed password (bcrypt — never
              stored in plain text), your prayer cards, habit/streak activity,
              and your journal entries.
            </p>
          </div>

          <div className="card-soft">
            <h3>Sensitive-data notice</h3>
            <p>
              Prayers and journal entries can reveal religious beliefs, which
              privacy laws such as the GDPR (Art. 9) treat as a special
              category of personal data. We handle this content with that
              sensitivity in mind and never sell it or use it for advertising.
            </p>
          </div>

          <div className="card-soft">
            <h3>How your journal is protected</h3>
            <p>
              Journal entries are encrypted with AES-256-GCM before they are
              written to the database, and they live in a database separate
              from your account record. Data is encrypted at rest and in
              transit (HTTPS).
            </p>
          </div>

          <div className="card-soft">
            <h3>How we use AI</h3>
            <p>
              Prayer companion guidance is generated on demand through the
              Apologist model provider. Your content is sent only to produce a
              response to you. We do not use your content to train models. (The
              companion may be temporarily unavailable during the preview.)
            </p>
          </div>

          <div className="card-soft">
            <h3>Your control &amp; rights</h3>
            <p>
              You can view, edit, and delete individual prayers and journal
              entries at any time; deleting an entry removes it from the active
              database. You can sign out and manage profile and reminder
              settings from your account pages. To request full account
              deletion or a copy of your data during the preview, contact us
              using the email below.
            </p>
          </div>

          <div className="card-soft">
            <h3>Retention &amp; contact</h3>
            <p>
              We keep your data while your account is active. Encrypted database
              backups are retained for up to 7 days for disaster recovery, then
              rotated out. Questions or data requests:{" "}
              <a href="mailto:privacy@lifengrace.app">privacy@lifengrace.app</a>.
            </p>
          </div>
        </div>

        <p className="muted" style={{ marginTop: 16 }}>
          Last updated: preview build. This notice will be finalized with a
          named data controller and effective date before public launch.
        </p>
      </div>
    </section>
  );
}
