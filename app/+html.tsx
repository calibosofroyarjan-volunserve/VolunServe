import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Web HTML metadata only. No changes to VolunServe's page design or navigation.
// Expo SDK 54 static export copies public/manifest.json and its icon PNGs.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#087E73" />
        {/* Explicit fingerprinted favicon URL avoids persistent browser cache on old visits. */}
        <link rel="icon" type="image/png" sizes="192x192" href="/volunserve-192.png?v=20261024b" />
        <link rel="manifest" href="/manifest.json?v=20261024b" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
