export default function FaqPage() {
  return (
    <section className="grid">
      <div className="card">
        <h1>FAQ</h1>
        <div className="grid">
          <div className="card-soft">
            <h3>How is this different from a notes app?</h3>
            <p>
              Life-n-Grace combines prayer tracking, journal linking, and reminder
              support in one workflow so your entries stay connected to your prayer
              journey.
            </p>
          </div>
          <div className="card-soft">
            <h3>Can I track answered prayers and changes over time?</h3>
            <p>
              Yes. The prayer wall supports lane movement (active, accomplished,
              re-routed, and praise/gratitude), and journal entries can link back to
              related prayers.
            </p>
          </div>
          <div className="card-soft">
            <h3>Can I update my account password?</h3>
            <p>
              Yes. Go to Profile and use the Change password form with your current
              password and a new password.
            </p>
          </div>
          <div className="card-soft">
            <h3>Where did the idea for reminder-driven prayer flow come from?</h3>
            <p>
              The experience follows patterns seen in mature prayer apps that
              emphasize daily habits and reminders, including Echo Prayer.
            </p>
            <p>
              <a href="https://www.echoprayer.com/" target="_blank" rel="noreferrer">
                See Echo Prayer
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
