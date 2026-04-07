import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  let publicHostname: string | null = null;

  try {
    publicHostname = env.VITE_PUBLIC_APP_URL ? new URL(env.VITE_PUBLIC_APP_URL).hostname : null;
  } catch {
    publicHostname = null;
  }

  return {
    server: {
      allowedHosts: publicHostname ? [publicHostname] : undefined,
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
  };
});
