import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { ApiError, createJournalEntry } from "@/lib/api";
import { Button, Card, Input, Muted, Title } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

// Creating an entry without a linked card auto-creates its wall card
// server-side, so the entry shows up on the wall and here (same behavior as
// the web). Linking to an existing card is a lower-traffic path — done from
// the web for now.
export default function NewEntryScreen() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      setMessage("Title and entry are both required.");
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      await createJournalEntry({ title: title.trim(), content, status });
      setTitle("");
      setContent("");
      setStatus("ACTIVE");
      router.navigate("/(tabs)");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Could not save the entry.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.paper }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Card>
          <Title>New prayer journal</Title>
          <Muted>It will appear on your prayer wall and in this list.</Muted>
          <Input placeholder="Title" value={title} onChangeText={setTitle} />
          <Input
            placeholder="What are you bringing to God?"
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={7}
            style={{ minHeight: 140, textAlignVertical: "top" }}
          />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Active"
                variant={status === "ACTIVE" ? "primary" : "outline"}
                onPress={() => setStatus("ACTIVE")}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="History"
                variant={status === "HISTORY" ? "primary" : "outline"}
                onPress={() => setStatus("HISTORY")}
              />
            </View>
          </View>
          <Button
            label="Save prayer journal"
            onPress={() => void handleSave()}
            loading={isSaving}
          />
          {message && <Muted>{message}</Muted>}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
