export default function PolicyPage() {
  return (
    <section className="grid">
      <div className="card">
        <h1>Transparent Data Use</h1>
        <p className="muted">
          Life-n-Grace exists to support prayer, not to distract or manipulate.
        </p>
        <div className="grid">
          <div className="card-soft">
            <h3>What we store</h3>
            <p>
              Account email and encrypted journal entries. Your journal text is
              encrypted before it reaches the database.
            </p>
          </div>
          <div className="card-soft">
            <h3>How we use AI</h3>
            <p>
              Prayer chat guidance is generated on-demand with the Apologist
              model. We do not use your content to train models.
            </p>
          </div>
          <div className="card-soft">
            <h3>Account control</h3>
            <p>
              You can sign in, sign out, and manage profile and reminder settings
              from your account pages at any time.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
