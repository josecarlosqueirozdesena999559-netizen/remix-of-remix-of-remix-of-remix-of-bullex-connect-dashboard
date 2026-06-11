import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
    }),
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tsconfigPaths(),
    tailwindcss(),
  ],
});
