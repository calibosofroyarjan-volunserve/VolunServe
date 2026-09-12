import { Platform } from "react-native";

import HomeNative from "../../components/home/Home.native";
import HomeWeb from "../../components/home/Home.web";

const HomeScreen = Platform.OS === "web" ? HomeWeb : HomeNative;

export default HomeScreen;