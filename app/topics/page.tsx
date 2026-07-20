import Link from "next/link";
import { listTopics } from "@/lib/prayer-topics/topics";

export const metadata = {
  title: "Prayer topics — Life 'n' Grace"
};

export default function TopicsPage() {
  const topics = listTopics();
  return (
    <section className="grid">
      <div className="hero-panel">
        <h1>Prayer topics</h1>
        <p className="muted">
          Browse Scripture by theme, then let Companion shape a short prayer
          around the verse that speaks to you.
        </p>
      </div>
      <div className="grid grid-2">
        {topics.map((topic) => (
          <Link
            key={topic.slug}
            href={`/topics/${topic.slug}`}
            className="card"
            style={{ textDecoration: "none" }}
          >
            <h3 style={{ marginTop: 0 }}>{topic.title}</h3>
            <p className="muted">{topic.description}</p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {topic.verses.length} verses ·{" "}
              {topic.verses
                .slice(0, 3)
                .map((verse) => verse.reference)
                .join(" · ")}
              {topic.verses.length > 3 && ` · +${topic.verses.length - 3} more`}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
