import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type {
  JournalEntry,
  Overview,
  Prayer,
  PrayerLane,
  Profile,
  ReminderSetting
} from "./types";

// Typed client for the existing Next.js REST API (mobile-app-plan Phase 0/1).
// Auth: 30-day JWT from POST /api/auth/login, persisted in the device secure
// store, sent as Authorization: Bearer on every request.

const TOKEN_KEY = "lng_auth_token";

const BASE_URL: string = (
  Constants.expoConfig?.extra?.apiBaseUrl ??
  "https://v6flaqacud5cunfhg34hiqtkci0zpbpn.lambda-url.us-east-1.on.aws"
).replace(/\/$/, "");

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) await clearToken();
    throw new ApiError(
      response.status,
      typeof data?.error === "string"
        ? data.error
        : `Request failed (${response.status}).`
    );
  }
  return data as T;
}

// ---- auth ----

export async function login(email: string, password: string): Promise<void> {
  const data = await request<{ ok: boolean; token?: string }>(
    "/api/auth/login",
    { method: "POST", body: { email, password } }
  );
  if (!data.token) {
    throw new ApiError(500, "Login succeeded but no token was returned.");
  }
  await setToken(data.token);
}

export async function signup(
  email: string,
  password: string
): Promise<string> {
  const data = await request<{ ok: boolean; message?: string }>(
    "/api/auth/signup",
    { method: "POST", body: { email, password } }
  );
  return data.message ?? "Account created. You can sign in.";
}

export async function logout(): Promise<void> {
  // Best-effort server call (clears the web cookie twin); the token removal
  // is what signs the app out.
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore — local sign-out must always succeed
  }
  await clearToken();
}

// ---- prayers + journal (unified overview) ----

export async function fetchOverview(): Promise<Overview> {
  const data = await request<{
    prayerBoard?: Record<string, Prayer[]>;
    historyJournals?: JournalEntry[];
    activeJournals?: JournalEntry[];
    habitSummary?: Overview["habitSummary"];
  }>("/api/prayers/overview");

  const board = data.prayerBoard ?? {};
  const prayers = [
    ...(board.active ?? []),
    ...(board.accomplished ?? []),
    ...(board.rerouted ?? []),
    ...(board.praise ?? [])
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    prayers,
    journals: [...(data.activeJournals ?? []), ...(data.historyJournals ?? [])],
    habitSummary:
      data.habitSummary ?? {
        prayerStreakDays: 0,
        daysPrayedLast30: 0,
        totalPrayerDays: 0
      }
  };
}

export async function markPrayed(prayerId: string): Promise<void> {
  await request("/api/prayers", {
    method: "PATCH",
    body: { id: prayerId, markPrayed: true }
  });
}

export async function movePrayer(
  prayerId: string,
  lane: PrayerLane
): Promise<void> {
  await request("/api/prayers", { method: "PATCH", body: { id: prayerId, lane } });
}

export async function deletePrayer(prayerId: string): Promise<void> {
  await request(`/api/prayers/${prayerId}`, { method: "DELETE" });
}

export async function createJournalEntry(input: {
  title: string;
  content: string;
  status: "ACTIVE" | "HISTORY";
  relatedPrayerId?: string | null;
}): Promise<void> {
  await request("/api/journal", { method: "POST", body: input });
}

export async function updateJournalEntry(
  id: string,
  input: { title?: string; content?: string; status?: "ACTIVE" | "HISTORY" }
): Promise<void> {
  await request(`/api/journal/${id}`, { method: "PATCH", body: input });
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await request(`/api/journal/${id}`, { method: "DELETE" });
}

// ---- profile + reminders ----

export async function fetchProfile(): Promise<Profile> {
  const data = await request<{ user: Profile }>("/api/profile");
  return data.user;
}

export async function updateProfile(displayName: string): Promise<void> {
  await request("/api/profile", { method: "PUT", body: { displayName } });
}

export async function fetchReminders(): Promise<ReminderSetting[]> {
  const data = await request<{ reminders: ReminderSetting[] }>(
    "/api/profile/reminders"
  );
  return data.reminders;
}

export async function saveReminder(input: {
  id?: string;
  channel: string;
  time: string;
  timezone: string;
  enabled: boolean;
}): Promise<ReminderSetting[]> {
  const data = await request<{ reminders: ReminderSetting[] }>(
    "/api/profile/reminders",
    { method: "PUT", body: input }
  );
  return data.reminders;
}

export async function deleteReminder(id: string): Promise<void> {
  await request(`/api/profile/reminders/${id}`, { method: "DELETE" });
}
