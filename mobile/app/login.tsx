import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { login } from "@/lib/api";
import { Button, Card, Input, Muted, Title } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

export default function LoginScreen() {
  const { msg } = useLocalSearchParams<{ msg?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(
    typeof msg === "string" && msg ? msg : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.paper }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Card>
          <Title>Sign in to Life-n-Grace</Title>
          <Muted>
            Keep your prayer wall, journal, and Companion together across
            devices.
          </Muted>
          <Input
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button
            label="Sign in"
            onPress={() => void handleSubmit()}
            loading={isSubmitting}
          />
          {message && <Muted>{message}</Muted>}
          <View style={{ marginTop: spacing.sm }}>
            <Text
              style={{ color: colors.accent, fontWeight: "500" }}
              onPress={() => router.push("/signup")}
            >
              New here? Create an account
            </Text>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
