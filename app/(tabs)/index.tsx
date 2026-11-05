// Metro chooses Home.web.tsx for browsers and Home.native.tsx on Android/iOS.
// Avoid importing both at once: the native APK must not load web-only modules.
export { default } from "../../components/home/Home";
