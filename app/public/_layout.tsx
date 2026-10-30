import { Stack } from "expo-router";

// Public routes use an isolated navigator: no authenticated community tabs or data hooks.
export default function PublicLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
