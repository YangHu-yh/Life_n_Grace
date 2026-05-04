export default function AboutPage() {
  return (
    <section className="grid">
      <div className="card">
        <h1>About Life-n-Grace</h1>
        <p className="muted">
          Life-n-Grace helps you keep prayer and journaling close in everyday life.
          The product is designed around calm reflection, practical reminder support,
          and clear tracking of prayer journeys.
        </p>
        <div className="grid">
          <div className="card-soft">
            <h3>What we focus on</h3>
            <p>
              We focus on prayer consistency, journaling context, and spiritual
              encouragement through Scripture-centered companion responses.
            </p>
          </div>
          <div className="card-soft">
            <h3>Design inspiration</h3>
            <p>
              We draw inspiration from proven prayer-product patterns such as habit
              reminders, list-based tracking, and community-centered language, similar
              to tools like Echo Prayer.
            </p>
            <p>
              <a href="https://www.echoprayer.com/" target="_blank" rel="noreferrer">
                Visit Echo Prayer
              </a>
            </p>
          </div>
          <div className="card-soft">
            <h3>Our commitment</h3>
            <p>
              Your journal stays user-scoped and encrypted, and your workflows are
              built to stay simple, focused, and encouraging.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
