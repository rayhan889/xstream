import { StreamConfig } from "@/schemas/stream";
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium as playwrightChromium } from "playwright";

chromium.use(stealthPlugin());

export async function launchBrowser(
  config: Pick<StreamConfig, "headless" | "authToken" | "lang">,
) {
  ensureChromium();

  const browser = await chromium.launch({
    headless: config.headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--window-position=0,0",
      "--ignore-certificate-errors",
      "--ignore-certificate-errors-spki-list",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale:
      !config.lang || config.lang === "en"
        ? "en-US"
        : `${config.lang}-${config.lang.toUpperCase()}`,
    timezoneId: "America/New_York",
  });

  await context.addCookies([
    {
      name: "auth_token",
      value: config.authToken,
      domain: ".x.com",
      path: "/",
      secure: true,
      sameSite: "None",
    },
  ]);

  return { browser, context };
}

function ensureChromium(): void {
  if (fs.existsSync(playwrightChromium.executablePath())) return;

  console.error("Chromium not found. Downloading (~150 MB)...");
  const cli = path.join(
    path.dirname(require.resolve("playwright/package.json")),
    "cli.js",
  );
  const result = spawnSync(process.execPath, [cli, "install", "chromium"], {
    stdio: ["ignore", 2, 2],
  });
  if (result.status !== 0) {
    throw new Error(
      "Chromium install failed. Run: npx playwright install chromium",
    );
  }
}
