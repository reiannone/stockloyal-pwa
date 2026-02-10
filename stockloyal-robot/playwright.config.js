// playwright.config.js
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "onboarding-robot.spec.js",

  /* ── Timeout per member onboarding (generous for slow local dev) ── */
  timeout: 120_000, // 2 minutes per member

  /* ── Retry failed members once ── */
  retries: 1,

  /* ── Parallel workers — override via CLI: --workers=N ── */
  workers: process.env.ROBOT_WORKERS
    ? parseInt(process.env.ROBOT_WORKERS)
    : 5,

  /* ── Reporter: HTML report + console progress ── */
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "reports/html",
        open: "never",
      },
    ],
    [
      "json",
      {
        outputFile: "reports/results.json",
      },
    ],
  ],

  use: {
    /* ── Your local dev URL ── */
    baseURL: process.env.ROBOT_URL || "http://localhost:5173",

    /* ── Video recording: on for first-failure, or always ── */
    video: process.env.ROBOT_VIDEO === "always" ? "on" : "on-first-retry",

    /* ── Screenshot on failure ── */
    screenshot: "only-on-failure",

    /* ── Trace on first retry for debugging ── */
    trace: "on-first-retry",

    /* ── Browser viewport (mobile PWA size) ── */
    viewport: { width: 430, height: 932 },

    /* ── Slow down actions for visibility in headed mode ── */
    actionTimeout: 15_000,
  },

  /* ── Output directories ── */
  outputDir: "reports/test-artifacts",

  projects: [
    {
      name: "onboarding-robot",
      use: {
        browserName: "chromium",
      },
    },
  ],
});
