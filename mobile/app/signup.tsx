import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { signup } from "@/lib/api";
import { Button, Card, Input, Muted, Title } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || password.length < 8) {
      setMessage("Enter an email and a password of at least 8 characters.");
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const serverMessage = await signup(email.trim(), password);
      // Mirror the web's signup -> login redirect with the server-worded
      // message ("check your email" vs "you can sign in now").
      router.replace({ pathname: "/login", params: { msg: serverMessage } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Signup failed.");
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
          <Title>Create your account</Title>
          <Muted>
            Save prayer journeys, Companion insights, and your private journal
            in one place.
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
            placeholder="Password (8+ characters)"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button
            label="Create account"
            onPress={() => void handleSubmit()}
            loading={isSubmitting}
          />
          {message && <Muted>{message}</Muted>}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
