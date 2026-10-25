import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

export type WalletBrand = "gcash" | "maya";

/**
 * Actual wallet wordmarks, shown for recipient channel recognition only.
 * The trademarks do not imply provider integration or actual wallet payouts.
 *
 * Asset credits:
 * GCash logo: https://commons.wikimedia.org/wiki/File:GCash_logo.svg (PD-textlogo, trademark)
 * Maya logo: Maya Bank, Inc. / PayMaya Philippines, Inc.
 * https://commons.wikimedia.org/wiki/File:Maya_logo.svg (CC BY 4.0)
 * https://creativecommons.org/licenses/by/4.0/
 * Original marks unaltered. Wikimedia PNG previews are used instead of
 * hand-drawn approximations; Image onError shows a readable text fallback.
 */
const BRAND_IMAGES: Record<WalletBrand,string> = {
  gcash:"https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/GCash_logo.svg/330px-GCash_logo.svg.png",
  maya:"https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Maya_logo.svg/330px-Maya_logo.svg.png",
};
export default function WalletBrandLogo({
  brand, width=82, height=29,
}:{
  brand: WalletBrand; width?:number; height?:number;
}) {
  const [failed,setFailed]=useState(false);
  if(failed)return <Text accessibilityLabel={brand==="gcash"?"GCash":"Maya"}
    style={[styles.text,brand==="gcash"?styles.gcash:styles.maya]}>
    {brand==="gcash"?"GCash":"maya"}
  </Text>;
  return <View style={{width,height,justifyContent:"center"}}>
    <Image source={{uri:BRAND_IMAGES[brand]}}
      accessibilityLabel={brand==="gcash"?"GCash logo":"Maya logo"}
      resizeMode="contain"
      style={{width,height}}
      onError={()=>setFailed(true)}/>
  </View>;
}
const styles=StyleSheet.create({
  text:{fontSize:18,fontWeight:"800",letterSpacing:-0.7},
  gcash:{color:"#0539B8"},
  maya:{color:"#00B776"},
});
