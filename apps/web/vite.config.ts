import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const apiTarget = process.env.VISHWAS_API_TARGET || "http://127.0.0.1:8000";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(apiTarget))
  throw new Error("API proxy must remain on loopback");
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/v1": { target: apiTarget } },
  },
});
