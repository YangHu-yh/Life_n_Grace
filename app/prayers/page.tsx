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
  ownsLinkedPrayer?: boolean;
  orphaned?: boolean;
  sourceLinks: unknown;
  createdAt: string;
  updatedAt: string;
};

type ViewMode = "columns" | "list" | "rows";

const VIEW_MODES: Array<{ key: ViewMode; label: string }> = [
  { key: "columns", label: "Columns" },
  { key: "list", label: "List" },
  { key: "rows", label: "Rows" }
];

const LANE_LABELS: Record<PrayerLane, string> = {
  ACTIVE: "Active",
  ACCOMPLISHED: "Accomplished",
  REROUTED: "Re-routed",
  PRAISE: "Praise"
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

function shortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

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
  // "list" is the default: it interleaves each prayer with its linked
  // journal entry in one view, avoiding the wall-vs-workspace duplicate-look
  // that "columns" (kanban + a separate journal section) still shows.
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [journalStatus, setJournalStatus] = useState<"ACTIVE" | "HISTORY">(
    "ACTIVE"
  );
  const [journalRelatedPrayerId, setJournalRelatedPrayerId] = useState("");
  const [journalSourceLinksText, setJournalSourceLinksText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSavingJournal, setIsSavingJournal] = useState(false);
  const [draggedPrayerId, setDraggedPrayerId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<PrayerLane | null>(null);
  const [collapsedPrayerCards, setCollapsedPrayerCards] = useState<Record<string, boolean>>(
    {}
  );
  const [collapsedJournalCards, setCollapsedJournalCards] = useState<Record<string, boolean>>(
    {}
  );
  // Touch-friendly move: tap a card's "Move" button to select it, then tap
  // "Move here" on a lane. Works where drag-and-drop can't (mobile).
  const [selectedForMove, setSelectedForMove] = useState<string | null>(null);

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

  // list/rows modes interleave prayers with their linked journal entries in
  // one list (newest prayers first), with journal-only entries at the end.
  const journalsByPrayerId = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const entry of allJournals) {
      if (!entry.relatedPrayerId) continue;
      const list = map.get(entry.relatedPrayerId) ?? [];
      list.push(entry);
      map.set(entry.relatedPrayerId, list);
    }
    return map;
  }, [allJournals]);

  const unlinkedJournals = useMemo(
    () => allJournals.filter((entry) => !entry.relatedPrayerId),
    [allJournals]
  );

  const prayersNewestFirst = useMemo(
    () =>
      [...allPrayers].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [allPrayers]
  );

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

  // Optimistic: move the card in local state immediately, roll back if the
  // request fails. On success a non-blocking reload picks up the linked
  // journal entry's cascaded status.
  async function updatePrayerLane(
    prayerId: string,
    lane: PrayerLane
  ) {
    const previousBoard = prayerBoard;
    const prayer = allPrayers.find((item) => item.id === prayerId);
    if (!prayer) return;

    setPrayerBoard((board) => {
      const next: PrayerBoard = {
        ACTIVE: board.ACTIVE.filter((p) => p.id !== prayerId),
        ACCOMPLISHED: board.ACCOMPLISHED.filter((p) => p.id !== prayerId),
        REROUTED: board.REROUTED.filter((p) => p.id !== prayerId),
        PRAISE: board.PRAISE.filter((p) => p.id !== prayerId)
      };
      next[lane] = [{ ...prayer, lane }, ...next[lane]];
      return next;
    });
    setNotice(null);

    try {
      const response = await fetch("/api/prayers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prayerId, lane })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPrayerBoard(previousBoard);
        setNotice(data.error ?? "Could not move prayer card.");
        return;
      }
      if (data.syncWarning) setNotice(data.syncWarning);
      // Linked journal statuses follow the lane — refresh without blocking.
      void loadOverview();
    } catch {
      setPrayerBoard(previousBoard);
      setNotice("Could not reach the server. The card was not moved.");
    }
  }

  // Optimistic: bump the count locally, refresh streak stats in the
  // background, roll back on failure.
  async function markPrayerPrayed(prayerId: string) {
    const previousBoard = prayerBoard;

    setPrayerBoard((board) => {
      const bump = (list: Prayer[]) =>
        list.map((p) =>
          p.id === prayerId
            ? {
                ...p,
                prayerCount: (p.prayerCount ?? 0) + 1,
                lastPrayedAt: new Date().toISOString()
              }
            : p
        );
      return {
        ACTIVE: bump(board.ACTIVE),
        ACCOMPLISHED: bump(board.ACCOMPLISHED),
        REROUTED: bump(board.REROUTED),
        PRAISE: bump(board.PRAISE)
      };
    });
    setNotice("Recorded this prayer.");

    try {
      const response = await fetch("/api/prayers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prayerId, markPrayed: true })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setPrayerBoard(previousBoard);
        setNotice(data.error ?? "Could not record prayer count.");
        return;
      }
      // Streak/habit numbers changed server-side — refresh without blocking
      void loadOverview();
    } catch {
      setPrayerBoard(previousBoard);
      setNotice("Could not reach the server. The prayer was not recorded.");
    }
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

  async function moveSelectedToLane(lane: PrayerLane) {
    if (!selectedForMove) return;
    const prayerId = selectedForMove;
    setSelectedForMove(null);
    await updatePrayerLane(prayerId, lane);
  }

  async function deletePrayer(prayerId: string) {
    if (!window.confirm("Delete this prayer card? This cannot be undone.")) {
      return;
    }
    const response = await fetch(`/api/prayers/${prayerId}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(data.error ?? "Could not delete prayer card.");
      return;
    }
    if (selectedForMove === prayerId) setSelectedForMove(null);
    setNotice(data.syncWarning ?? "Prayer card deleted.");
    await loadOverview();
  }

  async function deleteJournalEntry(journalId: string) {
    if (!window.confirm("Delete this journal entry? This cannot be undone.")) {
      return;
    }
    const response = await fetch(`/api/journal/${journalId}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(data.error ?? "Could not delete journal entry.");
      return;
    }
    setNotice(data.syncWarning ?? "Journal entry deleted.");
    await loadOverview();
  }

  function openJournalModal() {
    setIsJournalModalOpen(true);
  }

  // Takes the current *effective* collapsed state — in rows mode cards are
  // collapsed by default without a stored entry, so flipping the raw stored
  // value would be a no-op on first click.
  function togglePrayerCardCollapsed(prayerId: string, currentlyCollapsed: boolean) {
    setCollapsedPrayerCards((prev) => ({ ...prev, [prayerId]: !currentlyCollapsed }));
  }

  function toggleJournalCardCollapsed(entryId: string, currentlyCollapsed: boolean) {
    setCollapsedJournalCards((prev) => ({ ...prev, [entryId]: !currentlyCollapsed }));
  }

  function expandAllCards() {
    // Explicit false (not just clearing) so rows mode's collapsed-by-default
    // cards expand too.
    setCollapsedPrayerCards(
      Object.fromEntries(allPrayers.map((prayer) => [prayer.id, false]))
    );
    setCollapsedJournalCards(
      Object.fromEntries(allJournals.map((entry) => [entry.id, false]))
    );
  }

  function collapseAllCards() {
    setCollapsedPrayerCards(
      Object.fromEntries(allPrayers.map((prayer) => [prayer.id, true]))
    );
    setCollapsedJournalCards(
      Object.fromEntries(allJournals.map((entry) => [entry.id, true]))
    );
  }

  async function createJournalEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceLinks = journalSourceLinksText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    setIsSavingJournal(true);
    try {
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
    } catch {
      setNotice("Could not reach the server. Please try again.");
    } finally {
      setIsSavingJournal(false);
    }
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

  const selectedPrayer = selectedForMove
    ? allPrayers.find((item) => item.id === selectedForMove) ?? null
    : null;

  function renderPrayerCard(
    prayer: Prayer,
    options: { compact?: boolean; draggable?: boolean } = {}
  ) {
    const { compact = false, draggable = true } = options;
    // rows mode starts collapsed; an explicit toggle always wins.
    const isCollapsed = collapsedPrayerCards[prayer.id] ?? compact;
    return (
      <div
        key={prayer.id}
        className={`sticker prayer-card ${
          selectedForMove === prayer.id ? "is-selected-move" : ""
        }`}
        draggable={draggable}
        onDragStart={
          draggable ? (event) => handlePrayerDragStart(event, prayer.id) : undefined
        }
        onDragEnd={draggable ? handlePrayerDragEnd : undefined}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
            flexWrap: "wrap"
          }}
        >
          <strong style={{ flex: "1 1 140px" }}>{prayer.topic}</strong>
          <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
            {!draggable && <span className="pill">{LANE_LABELS[prayer.lane]}</span>}
            {draggable && (
              <button
                className={`button ${
                  selectedForMove === prayer.id ? "" : "button-outline"
                }`}
                type="button"
                style={{ padding: "6px 12px" }}
                onClick={() =>
                  setSelectedForMove(selectedForMove === prayer.id ? null : prayer.id)
                }
              >
                {selectedForMove === prayer.id ? "Moving…" : "Move"}
              </button>
            )}
            <button
              className="button button-outline"
              type="button"
              style={{ padding: "6px 12px" }}
              onClick={() => togglePrayerCardCollapsed(prayer.id, isCollapsed)}
            >
              {isCollapsed ? "Expand" : "Collapse"}
            </button>
          </div>
        </div>
        {isCollapsed ? (
          <p className="muted">
            {prayer.notes ? prayer.notes.slice(0, 80) : "No notes yet."}
          </p>
        ) : (
          <>
            {prayer.notes && <p className="muted">{prayer.notes}</p>}
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Prayed {prayer.prayerCount ?? 0} time
              {(prayer.prayerCount ?? 0) === 1 ? "" : "s"}
              {prayer.lastPrayedAt && ` · last ${shortDate(prayer.lastPrayedAt)}`}
            </p>
            <small className="muted" style={{ display: "block" }}>
              Added {shortDate(prayer.createdAt)}
            </small>
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
              <button
                className="button button-outline button-danger"
                type="button"
                onClick={() => {
                  void deletePrayer(prayer.id);
                }}
              >
                Delete card
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderJournalCard(
    entry: JournalEntry,
    options: { nested?: boolean; compact?: boolean } = {}
  ) {
    const { nested = false, compact = false } = options;
    const isCollapsed = collapsedJournalCards[entry.id] ?? compact;
    const isLinked = !!entry.relatedPrayerId;
    return (
      <div
        key={entry.id}
        className="card-soft"
        style={nested ? { marginLeft: 20 } : undefined}
      >
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
              {nested && "Journal entry · "}
              {entry.status}
              {isLinked && " · follows its wall card"}
            </p>
          </div>
          <button
            className="button button-outline"
            type="button"
            style={{ padding: "6px 12px" }}
            onClick={() => toggleJournalCardCollapsed(entry.id, isCollapsed)}
          >
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
        {isCollapsed ? (
          <p className="muted">{entry.content.slice(0, 100)}</p>
        ) : (
          <>
            <p style={{ whiteSpace: "pre-wrap" }}>{entry.content}</p>
            {isLinked && !nested && (
              <p className="muted">
                Linked to wall card:{" "}
                {allPrayers.find((p) => p.id === entry.relatedPrayerId)?.topic ??
                  entry.relatedPrayerId}
              </p>
            )}
            {entry.orphaned && (
              <p className="muted">
                The wall card this entry was linked to no longer exists, so the
                link was removed.
              </p>
            )}
            <small className="muted" style={{ display: "block" }}>
              Added {shortDate(entry.createdAt)}
            </small>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isLinked ? (
                <span className="pill">
                  Status follows the wall card&apos;s lane
                </span>
              ) : (
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
              )}
              <button
                className="button button-outline button-danger"
                type="button"
                onClick={() => {
                  void deleteJournalEntry(entry.id);
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
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

      {selectedPrayer && (
        <div className="card-soft move-banner">
          <p className="muted" style={{ margin: 0 }}>
            Moving <strong>{selectedPrayer.topic}</strong> — tap{" "}
            <strong>Move here</strong> on a lane, or{" "}
            <button
              className="button button-outline"
              type="button"
              style={{ padding: "4px 12px" }}
              onClick={() => setSelectedForMove(null)}
            >
              Cancel
            </button>
          </p>
        </div>
      )}

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            {viewMode === "columns" ? "Prayer wall" : "Prayer wall & journal"}
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.key}
                className={`button ${viewMode === mode.key ? "" : "button-outline"}`}
                type="button"
                style={{ padding: "6px 12px" }}
                onClick={() => setViewMode(mode.key)}
              >
                {mode.label}
              </button>
            ))}
            <button
              className="button button-outline"
              type="button"
              style={{ padding: "6px 12px" }}
              onClick={expandAllCards}
            >
              Expand all
            </button>
            <button
              className="button button-outline"
              type="button"
              style={{ padding: "6px 12px" }}
              onClick={collapseAllCards}
            >
              Collapse all
            </button>
          </div>
        </div>
        {viewMode !== "columns" && (
          <div className="grid" style={{ marginTop: 16, gap: viewMode === "rows" ? 8 : 12 }}>
            {prayersNewestFirst.map((prayer) => (
              <div key={prayer.id} className="grid" style={{ gap: 8 }}>
                {renderPrayerCard(prayer, {
                  compact: viewMode === "rows",
                  draggable: false
                })}
                {(journalsByPrayerId.get(prayer.id) ?? []).map((entry) =>
                  renderJournalCard(entry, {
                    nested: true,
                    compact: viewMode === "rows"
                  })
                )}
              </div>
            ))}
            {unlinkedJournals.map((entry) =>
              renderJournalCard(entry, { compact: viewMode === "rows" })
            )}
            {!prayersNewestFirst.length && !unlinkedJournals.length && (
              <p className="muted">No prayers or journal entries yet.</p>
            )}
          </div>
        )}
        {viewMode === "columns" && (
          <>
        <p className="muted">
          On desktop, drag a card between lanes. On any device, tap{" "}
          <strong>Move</strong> on a card, then <strong>Move here</strong> on a lane.
        </p>
        <div className="kanban-board">
          {PRAYER_LANES.map((lane) => (
            <div
              key={lane.key}
              className={`kanban-column ${dragOverLane === lane.key ? "is-drop-target" : ""} ${
                selectedPrayer && selectedPrayer.lane !== lane.key ? "is-move-target" : ""
              }`}
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
              {selectedPrayer && selectedPrayer.lane !== lane.key && (
                <button
                  className="button"
                  type="button"
                  style={{ width: "100%", marginBottom: 12 }}
                  onClick={() => {
                    void moveSelectedToLane(lane.key);
                  }}
                >
                  Move here
                </button>
              )}
              <div className="grid" style={{ gap: 12 }}>
                {prayerBoard[lane.key].map((prayer) => renderPrayerCard(prayer))}
                {!prayerBoard[lane.key].length && (
                  <p className="muted">{lane.emptyText}</p>
                )}
              </div>
            </div>
          ))}
        </div>
          </>
        )}
      </div>

      {viewMode === "columns" && (
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
          {filteredJournals.map((entry) => renderJournalCard(entry))}
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
      )}

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
            background: "rgba(35, 33, 27, 0.45)",
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
                <button className="button" type="submit" disabled={isSavingJournal}>
                  {isSavingJournal ? "Saving..." : "Save prayer journal"}
                </button>
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => setIsJournalModalOpen(false)}
                  disabled={isSavingJournal}
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
