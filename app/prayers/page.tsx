"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PrayerLane = "ACTIVE" | "ACCOMPLISHED" | "REROUTED" | "PRAISE";

type Prayer = {
  id: string;
  topic: string;
  notes?: string | null;
  lane: PrayerLane;
  prayerCount?: number;
  lastPrayedAt?: string | null;
  createdAt: string;
};

type JournalEntry = {
  id: string;
  title: string;
  content: string;
  status: "ACTIVE" | "HISTORY";
  relatedPrayerId: string | null;
  sourceLinks: unknown;
  createdAt: string;
  updatedAt: string;
};

type HabitSummary = {
  prayerStreakDays: number;
  daysPrayedLast30: number;
  totalPrayerDays: number;
};

type PrayerBoard = Record<PrayerLane, Prayer[]>;

const EMPTY_PRAYER_BOARD: PrayerBoard = {
  ACTIVE: [],
  ACCOMPLISHED: [],
  REROUTED: [],
  PRAISE: []
};

const PRAYER_LANES: Array<{
  key: PrayerLane;
  label: string;
  emptyText: string;
}> = [
  { key: "ACTIVE", label: "Active prayers", emptyText: "No active prayers yet." },
  {
    key: "ACCOMPLISHED",
    label: "Prayers accomplished",
    emptyText: "No accomplished prayers yet."
  },
  {
    key: "REROUTED",
    label: "Prayers re-routed",
    emptyText: "No re-routed prayers yet."
  },
  {
    key: "PRAISE",
    label: "Praise / gratitude",
    emptyText: "No praise or gratitude cards yet."
  }
];

function toPrayerBoard(payload: unknown): PrayerBoard {
  const fallback = EMPTY_PRAYER_BOARD;

  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const data = payload as {
    prayerBoard?: {
      active?: Prayer[];
      accomplished?: Prayer[];
      rerouted?: Prayer[];
      praise?: Prayer[];
    };
    activePrayers?: Prayer[];
    pastPrayers?: Prayer[];
  };

  return {
    ACTIVE: data.prayerBoard?.active ?? data.activePrayers ?? [],
    ACCOMPLISHED: data.prayerBoard?.accomplished ?? data.pastPrayers ?? [],
    REROUTED: data.prayerBoard?.rerouted ?? [],
    PRAISE: data.prayerBoard?.praise ?? []
  };
}

export default function PrayersPage() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [prayerBoard, setPrayerBoard] = useState<PrayerBoard>(EMPTY_PRAYER_BOARD);
  const [historyJournals, setHistoryJournals] = useState<JournalEntry[]>([]);
  const [activeJournals, setActiveJournals] = useState<JournalEntry[]>([]);
  const [habitSummary, setHabitSummary] = useState<HabitSummary>({
    prayerStreakDays: 0,
    daysPrayedLast30: 0,
    totalPrayerDays: 0
  });
  const [journalFilter, setJournalFilter] = useState<
    "all" | "active" | "history" | "prayer-linked"
  >("all");

  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [journalStatus, setJournalStatus] = useState<"ACTIVE" | "HISTORY">(
    "ACTIVE"
  );
  const [journalRelatedPrayerId, setJournalRelatedPrayerId] = useState("");
  const [journalSourceLinksText, setJournalSourceLinksText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [draggedPrayerId, setDraggedPrayerId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<PrayerLane | null>(null);
  const [collapsedPrayerCards, setCollapsedPrayerCards] = useState<Record<string, boolean>>(
    {}
  );
  const [collapsedJournalCards, setCollapsedJournalCards] = useState<Record<string, boolean>>(
    {}
  );

  const allJournals = useMemo(
    () => [...historyJournals, ...activeJournals],
    [historyJournals, activeJournals]
  );
  const allPrayers = useMemo(
    () => [
      ...prayerBoard.ACTIVE,
      ...prayerBoard.ACCOMPLISHED,
      ...prayerBoard.REROUTED,
      ...prayerBoard.PRAISE
    ],
    [prayerBoard]
  );

  const filteredJournals = useMemo(() => {
    if (journalFilter === "active") return activeJournals;
    if (journalFilter === "history") return historyJournals;
    if (journalFilter === "prayer-linked") {
      return allJournals.filter((entry) => !!entry.relatedPrayerId);
    }
    return allJournals;
  }, [journalFilter, activeJournals, historyJournals, allJournals]);

  async function loadOverview() {
    const response = await fetch("/api/prayers/overview");
    if (response.status === 401) {
      setIsAuthed(false);
      return;
    }
    if (!response.ok) {
      setNotice("Could not load your prayers right now.");
      return;
    }

    const data = await response.json();
    setPrayerBoard(toPrayerBoard(data));
    setHistoryJournals(data.historyJournals ?? []);
    setActiveJournals(data.activeJournals ?? []);
    setHabitSummary(
      data.habitSummary ?? {
        prayerStreakDays: 0,
        daysPrayedLast30: 0,
        totalPrayerDays: 0
      }
    );
    setIsAuthed(true);
  }

  async function updatePrayerLane(
    prayerId: string,
    lane: PrayerLane
  ) {
    const response = await fetch("/api/prayers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prayerId, lane })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setNotice(data.error ?? "Could not move prayer card.");
      return;
    }
    setNotice(null);
    await loadOverview();
  }

  async function markPrayerPrayed(prayerId: string) {
    const response = await fetch("/api/prayers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prayerId, markPrayed: true })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setNotice(data.error ?? "Could not record prayer count.");
      return;
    }
    setNotice("Recorded this prayer.");
    await loadOverview();
  }

  function handlePrayerDragStart(event: React.DragEvent<HTMLDivElement>, prayerId: string) {
    event.dataTransfer.setData("text/prayer-id", prayerId);
    event.dataTransfer.effectAllowed = "move";
    setDraggedPrayerId(prayerId);
  }

  async function handlePrayerDrop(
    event: React.DragEvent<HTMLDivElement>,
    targetLane: PrayerLane
  ) {
    event.preventDefault();
    const prayerId = event.dataTransfer.getData("text/prayer-id") || draggedPrayerId;
    setDragOverLane(null);
    setDraggedPrayerId(null);

    if (!prayerId) {
      return;
    }

    const prayer = allPrayers.find((item) => item.id === prayerId);
    if (!prayer || prayer.lane === targetLane) {
      return;
    }

    await updatePrayerLane(prayerId, targetLane);
  }

  function handlePrayerDragEnd() {
    setDraggedPrayerId(null);
    setDragOverLane(null);
  }

  async function movePrayerWithSelect(
    event: React.ChangeEvent<HTMLSelectElement>,
    prayerId: string
  ) {
    const nextLane = event.target.value as PrayerLane;
    await updatePrayerLane(prayerId, nextLane);
  }

  function openJournalModal() {
    setIsJournalModalOpen(true);
  }

  function togglePrayerCardCollapsed(prayerId: string) {
    setCollapsedPrayerCards((prev) => ({ ...prev, [prayerId]: !prev[prayerId] }));
  }

  function toggleJournalCardCollapsed(entryId: string) {
    setCollapsedJournalCards((prev) => ({ ...prev, [entryId]: !prev[entryId] }));
  }

  async function createJournalEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceLinks = journalSourceLinksText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const response = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: journalTitle,
        content: journalContent,
        status: journalStatus,
        relatedPrayerId: journalRelatedPrayerId || null,
        sourceLinks
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "Could not create prayer journal.");
      return;
    }

    setIsJournalModalOpen(false);
    setJournalTitle("");
    setJournalContent("");
    setJournalStatus("ACTIVE");
    setJournalRelatedPrayerId("");
    setJournalSourceLinksText("");
    setNotice("Prayer journal saved.");
    await loadOverview();
  }

  async function updateJournalStatus(
    journalId: string,
    status: "ACTIVE" | "HISTORY"
  ) {
    const response = await fetch(`/api/journal/${journalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (response.ok) {
      await loadOverview();
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  if (isAuthed === null) {
    return (
      <section className="grid">
        <div className="card">
          <h2>Loading prayer journal workspace...</h2>
        </div>
      </section>
    );
  }

  if (!isAuthed) {
    return (
      <section className="grid">
        <div className="card">
          <h2>Please sign in</h2>
          <p className="muted">
            Create an account or sign in to view your Prayers workspace.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="button" href="/login">
              Sign in
            </Link>
            <Link className="button button-outline" href="/signup">
              Create account
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid">
      <div className="hero-panel">
        <h1>Prayers</h1>
        <p className="muted">
          Your prayer wall and prayer journal are centralized here so you can track the
          full journey in one place.
        </p>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <span className="pill">Active: {prayerBoard.ACTIVE.length}</span>
          <span className="pill">Accomplished: {prayerBoard.ACCOMPLISHED.length}</span>
          <span className="pill">Re-routed: {prayerBoard.REROUTED.length}</span>
          <span className="pill">Praise: {prayerBoard.PRAISE.length}</span>
          <span className="pill">Prayer journals: {allJournals.length}</span>
          <span className="pill">Prayer streak: {habitSummary.prayerStreakDays} days</span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <button className="button" type="button" onClick={openJournalModal}>
            Create new prayer journal
          </button>
        </div>
      </div>

      {notice && (
        <div className="card-soft">
          <p className="muted">{notice}</p>
        </div>
      )}

      <div className="card">
        <h3>Prayer wall</h3>
        <p className="muted">
          Drag any prayer journal card into the lane that matches its current stage.
        </p>
        <div className="kanban-board">
          {PRAYER_LANES.map((lane) => (
            <div
              key={lane.key}
              className={`kanban-column ${dragOverLane === lane.key ? "is-drop-target" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragOverLane !== lane.key) {
                  setDragOverLane(lane.key);
                }
              }}
              onDragLeave={() => {
                if (dragOverLane === lane.key) {
                  setDragOverLane(null);
                }
              }}
              onDrop={(event) => {
                void handlePrayerDrop(event, lane.key);
              }}
            >
              <div className="kanban-column-header">
                <strong>{lane.label}</strong>
                <span className="pill">{prayerBoard[lane.key].length}</span>
              </div>
              <div className="grid" style={{ gap: 12 }}>
                {prayerBoard[lane.key].map((prayer) => (
                  <div
                    key={prayer.id}
                    className="sticker prayer-card"
                    draggable
                    onDragStart={(event) => handlePrayerDragStart(event, prayer.id)}
                    onDragEnd={handlePrayerDragEnd}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 10
                      }}
                    >
                      <strong>{prayer.topic}</strong>
                      <button
                        className="button button-outline"
                        type="button"
                        style={{ padding: "6px 12px" }}
                        onClick={() => togglePrayerCardCollapsed(prayer.id)}
                      >
                        {collapsedPrayerCards[prayer.id] ? "Expand" : "Collapse"}
                      </button>
                    </div>
                    {collapsedPrayerCards[prayer.id] ? (
                      <p className="muted">
                        {prayer.notes ? prayer.notes.slice(0, 80) : "No notes yet."}
                      </p>
                    ) : (
                      <>
                        {prayer.notes && <p className="muted">{prayer.notes}</p>}
                        <p className="muted">
                          Prayed {prayer.prayerCount ?? 0} time
                          {(prayer.prayerCount ?? 0) === 1 ? "" : "s"}
                        </p>
                        {prayer.lastPrayedAt && (
                          <small className="muted">
                            Last prayed: {new Date(prayer.lastPrayedAt).toLocaleString()}
                          </small>
                        )}
                        <small>{new Date(prayer.createdAt).toLocaleString()}</small>
                        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                          <button
                            className="button button-outline"
                            type="button"
                            onClick={() => {
                              void markPrayerPrayed(prayer.id);
                            }}
                          >
                            I prayed this
                          </button>
                          <div>
                            <label htmlFor={`lane-${prayer.id}`}>Move card</label>
                            <select
                              id={`lane-${prayer.id}`}
                              value={prayer.lane}
                              onChange={(event) => {
                                void movePrayerWithSelect(event, prayer.id);
                              }}
                            >
                              <option value="ACTIVE">Active prayers</option>
                              <option value="ACCOMPLISHED">Prayers accomplished</option>
                              <option value="REROUTED">Prayers re-routed</option>
                              <option value="PRAISE">Praise / gratitude</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!prayerBoard[lane.key].length && (
                  <p className="muted">{lane.emptyText}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap"
          }}
        >
          <div>
            <h3 style={{ marginTop: 0 }}>Prayer journal workspace</h3>
            <p className="muted" style={{ marginBottom: 0 }}>
              View history and active entries, then create new prayer journal entries in a
              focused modal without leaving this page.
            </p>
          </div>
          <button className="button" type="button" onClick={openJournalModal}>
            Create new prayer journal
          </button>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 16
          }}
        >
          <span className="muted">Filter entries:</span>
          <button
            className={`button ${journalFilter === "all" ? "" : "button-outline"}`}
            type="button"
            onClick={() => setJournalFilter("all")}
          >
            All
          </button>
          <button
            className={`button ${journalFilter === "history" ? "" : "button-outline"}`}
            type="button"
            onClick={() => setJournalFilter("history")}
          >
            History
          </button>
          <button
            className={`button ${journalFilter === "active" ? "" : "button-outline"}`}
            type="button"
            onClick={() => setJournalFilter("active")}
          >
            Active
          </button>
          <button
            className={`button ${journalFilter === "prayer-linked" ? "" : "button-outline"}`}
            type="button"
            onClick={() => setJournalFilter("prayer-linked")}
          >
            Wall-linked
          </button>
        </div>
        <div className="grid" style={{ marginTop: 16 }}>
          {filteredJournals.map((entry) => (
            <div key={entry.id} className="card-soft">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12
                }}
              >
                <div>
                  <strong>{entry.title}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {entry.status}
                  </p>
                </div>
                <button
                  className="button button-outline"
                  type="button"
                  style={{ padding: "6px 12px" }}
                  onClick={() => toggleJournalCardCollapsed(entry.id)}
                >
                  {collapsedJournalCards[entry.id] ? "Expand" : "Collapse"}
                </button>
              </div>
              {collapsedJournalCards[entry.id] ? (
                <p className="muted">{entry.content.slice(0, 100)}</p>
              ) : (
                <>
                  <p style={{ whiteSpace: "pre-wrap" }}>{entry.content}</p>
                  {entry.relatedPrayerId && (
                    <p className="muted">
                      Linked to wall card: {allPrayers.find((p) => p.id === entry.relatedPrayerId)?.topic ?? entry.relatedPrayerId}
                    </p>
                  )}
                  <small>{new Date(entry.createdAt).toLocaleString()}</small>
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() =>
                        updateJournalStatus(
                          entry.id,
                          entry.status === "ACTIVE" ? "HISTORY" : "ACTIVE"
                        )
                      }
                    >
                      Mark {entry.status === "ACTIVE" ? "History" : "Active"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {!filteredJournals.length && (
            <div className="card-soft">
              <p className="muted">No prayer journal entries for this filter.</p>
              <button className="button" type="button" onClick={openJournalModal}>
                Create new prayer journal
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Prayer day streak</h3>
        <p className="muted">Current streak: {habitSummary.prayerStreakDays} day(s)</p>
        <p className="muted">Days prayed in last 30 days: {habitSummary.daysPrayedLast30}</p>
        <p className="muted">Total prayer days: {habitSummary.totalPrayerDays}</p>
      </div>

      {isJournalModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11, 31, 58, 0.4)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="card"
            style={{ width: "min(680px, 100%)", maxHeight: "90vh", overflow: "auto" }}
          >
            <h3>Create new prayer journal</h3>
            <form className="grid" onSubmit={createJournalEntry}>
              <div>
                <label htmlFor="journalTitle">Title</label>
                <input
                  id="journalTitle"
                  value={journalTitle}
                  onChange={(event) => setJournalTitle(event.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="journalContent">Entry</label>
                <textarea
                  id="journalContent"
                  rows={7}
                  value={journalContent}
                  onChange={(event) => setJournalContent(event.target.value)}
                  required
                />
              </div>
              <div className="grid grid-2">
                <div>
                  <label htmlFor="journalStatus">Status</label>
                  <select
                    id="journalStatus"
                    value={journalStatus}
                    onChange={(event) =>
                      setJournalStatus(event.target.value as "ACTIVE" | "HISTORY")
                    }
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="HISTORY">History</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="relatedPrayerId">Link to existing wall card (optional)</label>
                  <select
                    id="relatedPrayerId"
                    value={journalRelatedPrayerId}
                    onChange={(event) => setJournalRelatedPrayerId(event.target.value)}
                  >
                    <option value="">Create new – appears on wall and here</option>
                    {allPrayers.map((prayer) => (
                      <option key={prayer.id} value={prayer.id}>
                        {prayer.topic}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="sourceLinks">
                  Source links (optional, one per line)
                </label>
                <textarea
                  id="sourceLinks"
                  rows={3}
                  value={journalSourceLinksText}
                  onChange={(event) => setJournalSourceLinksText(event.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="button" type="submit">
                  Save prayer journal
                </button>
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => setIsJournalModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
