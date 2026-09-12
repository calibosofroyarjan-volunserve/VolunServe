import {
    doc,
    onSnapshot,
} from "firebase/firestore";

import {
    useEffect,
    useState,
} from "react";

import { db } from "./firebase";

export type PublicSettings = {
  cityName: string;
  emergencyHotline: string;
  supportEmail: string;
  publicServiceNotice: string;
  liveLocationRetentionHours: number;
};

const defaults: PublicSettings = {
  cityName:
    "City of San Jose del Monte",

  emergencyHotline:
    "Contact your barangay emergency response office",

  supportEmail: "",

  publicServiceNotice:
    "VolunServe requires internet connectivity and does not replace emergency hotlines.",

  liveLocationRetentionHours: 24,
};

export function usePublicSettings() {
  const [
    settings,
    setSettings,
  ] = useState<PublicSettings>(
    defaults
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(
        db,
        "systemSettings",
        "public"
      ),

      (snapshot) => {
        setSettings({
          ...defaults,
          ...(
            snapshot.data() as
              | Partial<PublicSettings>
              | undefined
          ),
        });

        setLoading(false);
      },

      () => {
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  return {
    settings,
    loading,
  };
}