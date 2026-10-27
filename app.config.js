const fs = require("fs");
const path = require("path");

/**
 * Firebase Android config must come from the actual VolunServe Firebase
 * Android app registration. The service-account/private FCM key must NEVER
 * go into the APK, GitHub, or this file.
 *
 * EAS file-type environment variable GOOGLE_SERVICES_JSON is preferred.
 * For local native builds, place google-services.json at repository root.
 */
module.exports = ({ config }) => {
  const requested = process.env.GOOGLE_SERVICES_JSON || "./google-services.json";
  const absolute = path.isAbsolute(requested)
    ? requested
    : path.resolve(__dirname, requested);
  if (!fs.existsSync(absolute)) return config;

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile: absolute,
    },
  };
};
