import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins:[react()],
  base:"/lgu-face-check/",
  server:{port:5175,host:"127.0.0.1",proxy:{"/api":"http://127.0.0.1:10000"}},
  build:{outDir:"dist",emptyOutDir:true},
});
