import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "@/lib/theme";

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface },
        sceneStyle: { backgroundColor: colors.paper }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Prayers",
          tabBarIcon: ({ focused }) => <TabIcon glyph="🙏" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="new-entry"
        options={{
          title: "New entry",
          tabBarIcon: ({ focused }) => <TabIcon glyph="✏️" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon glyph="🌿" focused={focused} />
        }}
      />
    </Tabs>
  );
}
