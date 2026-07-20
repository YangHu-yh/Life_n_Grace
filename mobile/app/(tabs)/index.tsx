import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, Text, View } from "react-native";
import {
  ApiError,
  deleteJournalEntry,
  deletePrayer,
  fetchOverview,
  markPrayed,
  movePrayer
} from "@/lib/api";
import {
  ALL_LANES,
  LANE_LABELS,
  type JournalEntry,
  type Overview,
  type Prayer,
  type PrayerLane
} from "@/lib/types";
import { Button, Card, Muted, Pill, Title } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

// Unified prayer + journal list — mirrors the web's List view (prayers newest
// first, linked journal entries nested beneath, journal-only entries at the
// end), which is the natural mobile layout. Lane moves are tap-to-move.

type Row =
  | { kind: "prayer"; prayer: Prayer; linked: JournalEntry[] }
  | { kind: "journal"; entry: JournalEntry };

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

export default function PrayersScreen() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await fetchOverview());
      setNotice(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setNotice("Could not load your prayers. Pull to retry.");
    }
  }, []);

  // Reload whenever the tab regains focus (e.g. after creating an entry).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const rows = useMemo<Row[]>(() => {
    if (!overview) return [];
    const byPrayer = new Map<string, JournalEntry[]>();
    for (const entry of overview.journals) {
      if (!entry.relatedPrayerId) continue;
      const list = byPrayer.get(entry.relatedPrayerId) ?? [];
      list.push(entry);
      byPrayer.set(entry.relatedPrayerId, list);
    }
    return [
      ...overview.prayers.map<Row>((prayer) => ({
        kind: "prayer",
        prayer,
        linked: byPrayer.get(prayer.id) ?? []
      })),
      ...overview.journals
        .filter((entry) => !entry.relatedPrayerId)
        .map<Row>((entry) => ({ kind: "journal", entry }))
    ];
  }, [overview]);

  async function run(action: () => Promise<void>, failure: string) {
    try {
      await action();
      await load();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setNotice(error instanceof Error ? error.message : failure);
    }
  }

  function pickLane(prayer: Prayer) {
    Alert.alert(
      "Move card",
      prayer.topic,
      [
        ...ALL_LANES.filter((lane) => lane !== prayer.lane).map((lane) => ({
          text: LANE_LABELS[lane],
          onPress: () => {
            void run(() => movePrayer(prayer.id, lane), "Could not move the card.");
          }
        })),
        { text: "Cancel", style: "cancel" as const }
      ]
    );
  }

  function confirmDeletePrayer(prayer: Prayer) {
    Alert.alert("Delete prayer card?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void run(() => deletePrayer(prayer.id), "Could not delete the card.");
        }
      }
    ]);
  }

  function confirmDeleteEntry(entry: JournalEntry) {
    Alert.alert("Delete journal entry?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void run(() => deleteJournalEntry(entry.id), "Could not delete the entry.");
        }
      }
    ]);
  }

  function openEntry(entry: JournalEntry) {
    router.push({
      pathname: "/entry/[id]",
      params: {
        id: entry.id,
        title: entry.title,
        content: entry.content,
        status: entry.status,
        linked: entry.relatedPrayerId ? "1" : "0"
      }
    });
  }

  function renderJournalCard(entry: JournalEntry, nested: boolean) {
    return (
      <View key={entry.id} style={nested ? { marginLeft: spacing.xl } : undefined}>
        <Card soft>
          <Text style={{ fontWeight: "600", color: colors.ink }}>{entry.title}</Text>
          <Muted>
            {nested ? "Journal entry · " : ""}
            {entry.status}
            {entry.relatedPrayerId ? " · follows its wall card" : ""}
          </Muted>
          <Text style={{ color: colors.ink }} numberOfLines={4}>
            {entry.content}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Edit" variant="outline" onPress={() => openEntry(entry)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Delete"
                variant="danger"
                onPress={() => confirmDeleteEntry(entry)}
              />
            </View>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      data={rows}
      keyExtractor={(row) => (row.kind === "prayer" ? row.prayer.id : row.entry.id)}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            setIsRefreshing(true);
            void load().finally(() => setIsRefreshing(false));
          }}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
          {overview && (
            <Pill>
              Prayer streak: {overview.habitSummary.prayerStreakDays} day
              {overview.habitSummary.prayerStreakDays === 1 ? "" : "s"}
            </Pill>
          )}
          {notice && <Muted>{notice}</Muted>}
        </View>
      }
      ListEmptyComponent={
        overview ? (
          <Card>
            <Title>No prayers yet</Title>
            <Muted>
              Create your first prayer journal from the New entry tab — it will
              appear on your wall and here.
            </Muted>
          </Card>
        ) : (
          <Muted>Loading your prayers...</Muted>
        )
      }
      renderItem={({ item }) => {
        if (item.kind === "journal") return renderJournalCard(item.entry, false);
        const { prayer, linked } = item;
        return (
          <View style={{ gap: spacing.sm }}>
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <Text style={{ fontWeight: "600", fontSize: 16, color: colors.ink, flex: 1 }}>
                  {prayer.topic}
                </Text>
                <Pill>{LANE_LABELS[prayer.lane]}</Pill>
              </View>
              {prayer.notes ? <Muted>{prayer.notes}</Muted> : null}
              <Muted>
                Prayed {prayer.prayerCount ?? 0} time
                {(prayer.prayerCount ?? 0) === 1 ? "" : "s"} · added{" "}
                {shortDate(prayer.createdAt)}
              </Muted>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="I prayed this"
                    onPress={() => {
                      void run(() => markPrayed(prayer.id), "Could not record the prayer.");
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Move" variant="outline" onPress={() => pickLane(prayer)} />
                </View>
              </View>
              <Button
                label="Delete card"
                variant="danger"
                onPress={() => confirmDeletePrayer(prayer)}
              />
            </Card>
            {linked.map((entry) => renderJournalCard(entry, true))}
          </View>
        );
      }}
    />
  );
}
