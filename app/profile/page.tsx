"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Profile = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

type ReminderSetting = {
  id: string;
  channel: string;
  time: string;
  timezone: string;
  enabled: boolean;
};

export default function ProfilePage() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [reminders, setReminders] = useState<ReminderSetting[]>([]);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [reminderForm, setReminderForm] = useState({
    id: "",
    channel: "email",
    time: "07:30",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    enabled: true
  });

  async function loadProfile() {
    const response = await fetch("/api/profile");
    if (response.status === 401) {
      setIsAuthed(false);
      return;
    }
    if (response.ok) {
      const data = await response.json();
      const user = data.user as Profile;
      setProfile(user);
      setDisplayName(user.displayName ?? "");
      setIsAuthed(true);
    }
  }

  async function loadReminders() {
    const response = await fetch("/api/profile/reminders");
    if (response.status === 401) {
      setIsAuthed(false);
      return;
    }
    if (response.ok) {
      const data = await response.json();
      const list = data.reminders as ReminderSetting[];
      setReminders(list);
      if (list.length > 0) {
        const first = list[0];
        setReminderForm({
          id: first.id,
          channel: first.channel,
          time: first.time,
          timezone: first.timezone,
          enabled: first.enabled
        });
      }
      setIsAuthed(true);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage(null);
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName })
    });
    const data = await response.json();
    if (response.ok) {
      setProfile(data.user);
      setProfileMessage("Profile updated.");
    } else {
      setProfileMessage(data.error ?? "Could not update profile.");
    }
  }

  async function saveReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReminderMessage(null);
    const response = await fetch("/api/profile/reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reminderForm)
    });
    const data = await response.json();
    if (response.ok) {
      setReminders(data.reminders);
      setReminderMessage("Reminder settings saved.");
    } else {
      setReminderMessage(data.error ?? "Could not save reminders.");
    }
  }

  async function deleteReminder(reminderId: string) {
    if (!window.confirm("Delete this reminder? This cannot be undone.")) {
      return;
    }
    setReminderMessage(null);
    const response = await fetch(`/api/profile/reminders/${reminderId}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setReminderMessage(data.error ?? "Could not delete reminder.");
      return;
    }
    if (reminderForm.id === reminderId) {
      setReminderForm({
        id: "",
        channel: "email",
        time: "07:30",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        enabled: true
      });
    }
    setReminders((prev) => prev.filter((item) => item.id !== reminderId));
    setReminderMessage("Reminder deleted.");
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);

    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordMessage("Please fill in current and new password.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage("New password and confirmation do not match.");
      return;
    }

    const response = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
    });
    const data = await response.json();
    if (response.ok) {
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      setPasswordMessage("Password updated successfully.");
    } else {
      setPasswordMessage(data.error ?? "Could not update password.");
    }
  }

  useEffect(() => {
    loadProfile();
    loadReminders();
  }, []);

  if (isAuthed === null) {
    return (
      <section className="grid">
        <div className="card">
          <h2>Loading profile...</h2>
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
            Create an account or sign in to view your profile and reminders.
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
        <h1>Your Profile</h1>
        <p className="muted">
          Manage your account details and reminder preferences.
        </p>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Profile basics</h3>
          <form className="grid" onSubmit={saveProfile}>
            <div>
              <label htmlFor="email">Email</label>
              <input id="email" value={profile?.email ?? ""} disabled />
            </div>
            <div>
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How should we address you?"
              />
            </div>
            <button className="button" type="submit">
              Save profile
            </button>
            {profileMessage && <p className="muted">{profileMessage}</p>}
          </form>
        </div>

        <div className="card">
          <h3>Reminder settings</h3>
          <form className="grid" onSubmit={saveReminder}>
            <div className="grid grid-2">
              <div>
                <label htmlFor="channel">Channel</label>
                <select
                  id="channel"
                  value={reminderForm.channel}
                  onChange={(event) =>
                    setReminderForm((prev) => ({
                      ...prev,
                      channel: event.target.value
                    }))
                  }
                >
                  <option value="email">Email</option>
                  <option value="push">Push</option>
                </select>
              </div>
              <div>
                <label htmlFor="time">Time</label>
                <input
                  id="time"
                  type="time"
                  value={reminderForm.time}
                  onChange={(event) =>
                    setReminderForm((prev) => ({
                      ...prev,
                      time: event.target.value
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <label htmlFor="timezone">Timezone</label>
              <input
                id="timezone"
                value={reminderForm.timezone}
                onChange={(event) =>
                  setReminderForm((prev) => ({
                    ...prev,
                    timezone: event.target.value
                  }))
                }
              />
            </div>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={reminderForm.enabled}
                onChange={(event) =>
                  setReminderForm((prev) => ({
                    ...prev,
                    enabled: event.target.checked
                  }))
                }
                style={{ width: "auto" }}
              />
              Enable reminders
            </label>
            <button className="button" type="submit">
              Save reminders
            </button>
            {reminderMessage && <p className="muted">{reminderMessage}</p>}
          </form>
          {!!reminders.length && (
            <div className="grid" style={{ marginTop: 12 }}>
              {reminders.map((reminder) => (
                <div key={reminder.id} className="card-soft">
                  <strong>{reminder.channel.toUpperCase()}</strong>
                  <p className="muted">
                    {reminder.time} ({reminder.timezone}){" "}
                    {reminder.enabled ? "- enabled" : "- disabled"}
                  </p>
                  <button
                    className="button button-outline button-danger"
                    type="button"
                    onClick={() => deleteReminder(reminder.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Change password</h3>
          <form className="grid" onSubmit={savePassword}>
            <div>
              <label htmlFor="currentPassword">Current password</label>
              <input
                id="currentPassword"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    currentPassword: event.target.value
                  }))
                }
                required
              />
            </div>
            <div>
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    newPassword: event.target.value
                  }))
                }
                minLength={8}
                required
              />
            </div>
            <div>
              <label htmlFor="confirmPassword">Confirm new password</label>
              <input
                id="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    confirmPassword: event.target.value
                  }))
                }
                minLength={8}
                required
              />
            </div>
            <button className="button" type="submit">
              Update password
            </button>
            {passwordMessage && <p className="muted">{passwordMessage}</p>}
          </form>
        </div>

        <div className="card-soft">
          <h3>Delete account</h3>
          <p className="muted">
            Permanently removes your account, prayer cards, habit history, and
            all journal entries. This cannot be undone.
          </p>
          <button
            className="button button-outline button-danger"
            type="button"
            disabled={isDeletingAccount}
            onClick={async () => {
              const confirmed = window.confirm(
                "Delete your account and ALL your data? This cannot be undone."
              );
              if (!confirmed) return;
              setIsDeletingAccount(true);
              setDeleteMessage(null);
              try {
                const response = await fetch("/api/auth/account", {
                  method: "DELETE"
                });
                if (!response.ok) {
                  const data = await response.json().catch(() => ({}));
                  setDeleteMessage(data.error ?? "Could not delete your account.");
                  return;
                }
                router.push("/");
                router.refresh();
              } catch {
                setDeleteMessage("Could not reach the server. Please try again.");
              } finally {
                setIsDeletingAccount(false);
              }
            }}
          >
            {isDeletingAccount ? "Deleting..." : "Delete my account"}
          </button>
          {deleteMessage && <p className="muted">{deleteMessage}</p>}
        </div>
      </div>
    </section>
  );
}
