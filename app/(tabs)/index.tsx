// Let Metro choose Home.web.tsx for browsers and Home.native.tsx for Android/iOS.
// Importing both eagerly can pull web-only dependencies into a native APK.
export { default } from "../../components/home/Home";
