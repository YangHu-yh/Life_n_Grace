import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, Switch, View } from "react-native";
import {
  ApiError,
  deleteReminder,
  fetchProfile,
  fetchReminders,
  logout,
  saveReminder,
  updateProfile
} from "@/lib/api";
import type { Profile, ReminderSetting } from "@/lib/types";
import { Button, Card, Input, Muted, Title } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

// Device timezone — written into the reminder so email delivery fires at the
// right local time (the timezone rule from mobile-app-plan Phase 3).
const DEVICE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [reminders, setReminders] = useState<ReminderSetting[]>([]);
  const [reminderTime, setReminderTime] = useState("07:30");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderId, setReminderId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [user, reminderList] = await Promise.all([
        fetchProfile(),
        fetchReminders()
      ]);
      setProfile(user);
      setDisplayName(user.displayName ?? "");
      setReminders(reminderList);
      const first = reminderList[0];
      if (first) {
        setReminderId(first.id);
        setReminderTime(first.time);
        setReminderEnabled(first.enabled);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setMessage("Could not load your profile.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleSaveProfile() {
    setIsSaving(true);
    setMessage(null);
    try {
      await updateProfile(displayName.trim());
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveReminder() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
      setMessage("Reminder time must be HH:MM (24-hour), e.g. 07:30.");
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const list = await saveReminder({
        ...(reminderId ? { id: reminderId } : {}),
        channel: "email",
        time: reminderTime,
        timezone: DEVICE_TIMEZONE,
        enabled: reminderEnabled
      });
      setReminders(list);
      if (!reminderId && list[0]) setReminderId(list[0].id);
      setMessage("Reminder saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the reminder.");
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDeleteReminder(reminder: ReminderSetting) {
    Alert.alert("Delete this reminder?", `${reminder.time} (${reminder.timezone})`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteReminder(reminder.id);
              if (reminder.id === reminderId) {
                setReminderId(null);
                setReminderTime("07:30");
                setReminderEnabled(true);
              }
              setReminders((prev) => prev.filter((item) => item.id !== reminder.id));
              setMessage("Reminder deleted.");
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Could not delete the reminder."
              );
            }
          })();
        }
      }
    ]);
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
    >
      <Card>
        <Title>Profile</Title>
        <Muted>{profile?.email ?? "Loading..."}</Muted>
        <Input
          placeholder="Display name"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <Button
          label="Save profile"
          onPress={() => void handleSaveProfile()}
          loading={isSaving}
        />
      </Card>

      <Card>
        <Title>Daily reminder</Title>
        <Muted>
          Delivered by email at your local time ({DEVICE_TIMEZONE}). In-app
          notifications arrive with a later update.
        </Muted>
        <Input
          placeholder="Time (HH:MM, 24-hour)"
          value={reminderTime}
          onChangeText={setReminderTime}
          autoCapitalize="none"
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Switch
            value={reminderEnabled}
            onValueChange={setReminderEnabled}
            trackColor={{ true: colors.accent }}
          />
          <Muted>Reminder enabled</Muted>
        </View>
        <Button
          label="Save reminder"
          onPress={() => void handleSaveReminder()}
          loading={isSaving}
        />
        {reminders.map((reminder) => (
          <Card key={reminder.id} soft>
            <Muted>
              {reminder.channel.toUpperCase()} · {reminder.time} ({reminder.timezone}){" "}
              {reminder.enabled ? "· enabled" : "· disabled"}
            </Muted>
            <Button
              label="Delete"
              variant="danger"
              onPress={() => confirmDeleteReminder(reminder)}
            />
          </Card>
        ))}
      </Card>

      {message && <Muted>{message}</Muted>}

      <Button label="Log out" variant="outline" onPress={() => void handleLogout()} />
    </ScrollView>
  );
}
