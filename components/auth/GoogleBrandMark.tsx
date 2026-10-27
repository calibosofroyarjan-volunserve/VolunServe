import React from "react";
import Svg, { Path } from "react-native-svg";

/** Multicolor Google 'G' brand mark, using Google's four-color G geometry. */
export default function GoogleBrandMark({size = 21}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      accessibilityLabel="Google" accessible>
      <Path fill="#4285F4" d="M21.35 11.1H12v3.8h5.35c-.23 1.24-.93 2.28-1.98 2.98v2.48h3.2c1.87-1.73 2.95-4.27 2.95-7.25 0-.68-.06-1.34-.17-2.01Z"/>
      <Path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.2-2.48c-.89.59-2.02.94-3.43.94-2.63 0-4.86-1.78-5.65-4.17H3.06v2.59A10 10 0 0012 22Z"/>
      <Path fill="#FBBC05" d="M6.35 13.85A6.02 6.02 0 016.05 12c0-.64.11-1.26.3-1.85V7.56H3.06A10 10 0 002 12c0 1.61.38 3.13 1.06 4.44l3.29-2.59Z"/>
      <Path fill="#EA4335" d="M12 5.98c1.47 0 2.78.51 3.82 1.5l2.87-2.87A9.64 9.64 0 0012 2a10 10 0 00-8.94 5.56l3.29 2.59C7.14 7.76 9.37 5.98 12 5.98Z"/>
    </Svg>
  );
}
