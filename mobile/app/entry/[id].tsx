import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { ApiError, updateJournalEntry } from "@/lib/api";
import { Button, Card, Input, Muted, Title } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

// Edit screen, prefilled via navigation params from the list (the overview
// already carries the decrypted content — no per-entry GET exists yet).
// Linked entries can't change status here: it follows their wall card's lane.
export default function EditEntryScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    content?: string;
    status?: string;
    linked?: string;
  }>();
  const isLinked = params.linked === "1";

  const [title, setTitle] = useState(params.title ?? "");
  const [content, setContent] = useState(params.content ?? "");
  const [status, setStatus] = useState<"ACTIVE" | "HISTORY">(
    params.status === "HISTORY" ? "HISTORY" : "ACTIVE"
  );
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
      await updateJournalEntry(params.id, {
        title: title.trim(),
        content,
        ...(isLinked ? {} : { status })
      });
      router.back();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Could not save changes.");
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
          <Title>Edit entry</Title>
          <Input placeholder="Title" value={title} onChangeText={setTitle} />
          <Input
            placeholder="Entry"
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={7}
            style={{ minHeight: 140, textAlignVertical: "top" }}
          />
          {isLinked ? (
            <Muted>Status follows this entry&apos;s wall card.</Muted>
          ) : (
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
          )}
          <Button label="Save changes" onPress={() => void handleSave()} loading={isSaving} />
          {message && <Muted>{message}</Muted>}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
