import { Redirect } from "expo-router";

export default function AdminIndex() {
  return (
    <Redirect
      href={"/(admin)/command-center" as any}
    />
  );
}