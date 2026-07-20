import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { getToken } from "@/lib/api";
import { colors } from "@/lib/theme";

// Entry point: route by stored-token presence. A stale/expired token still
// routes to the app; the first 401 clears it and screens send the user back
// to sign in.
export default function Index() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    getToken()
      .then((token) => setHasToken(Boolean(token)))
      .catch(() => setHasToken(false));
  }, []);

  if (hasToken === null) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.paper
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <Redirect href={hasToken ? "/(tabs)" : "/login"} />;
}
