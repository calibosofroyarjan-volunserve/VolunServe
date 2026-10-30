import { Redirect } from "expo-router";

// Retired from the approved LGU Admin paper; keep an authenticated redirect
// so old links cannot surface an unsupported standalone module.
export default function RetiredReliefOperations() {
  return <Redirect href="/(admin)/command-center" />;
}
