import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// @anthropic-ai/sdk 의 EnvironmentWorker(Node 전용) 가 동적으로 끌어들이는
// agent-toolset/* 모듈은 브라우저(Tauri WebView) 빌드에 필요 없으나
// Rollup 이 정적 분석으로 끌어와 node:crypto/fs 에러를 낸다.
// 해당 경로를 external 로 마킹해 번들에서 제외 — 호출되지 않으므로 런타임 안전.
const SDK_NODE_ONLY_EXTERNALS = [
  /@anthropic-ai\/sdk\/tools\/agent-toolset\/.*/,
  /@anthropic-ai\/sdk\/lib\/environments\/.*/,
];

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      external: SDK_NODE_ONLY_EXTERNALS,
    },
  },
}));
