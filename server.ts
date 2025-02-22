import express, { Request, Response } from "express";
import { chromium } from "playwright";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// ✅ Load environment variables
dotenv.config();

// ✅ Setup Express
const app = express();
const PORT = process.env.PORT || 3004;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

// ✅ Folder untuk menyimpan hasil screenshot
const SCREENSHOT_DIR = process.env.NODE_ENV === "production"
  ? path.join("/tmp/screenshots")
  : path.join(process.cwd(), "public/screenshots");

// ✅ Pastikan folder tersedia
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  console.log(`📂 Folder screenshot dibuat di: ${SCREENSHOT_DIR}`);
}

// ✅ Middleware
app.use(express.json());
app.use(cors());
app.use("/screenshots", express.static(SCREENSHOT_DIR)); // Sajikan file statis

console.log(`🖼️ Screenshots disajikan dari: ${SCREENSHOT_DIR}`);

// ✅ Tipe data untuk langkah automation
interface Step {
  action: string;
  xpath: string;
  value?: string;
}

interface AutomationResponse {
  status: "success" | "error";
  message: string;
  reportUrl?: string;
  stepResults?: {
    action: string;
    xpath: string;
    value?: string;
    status: "sukses" | "gagal";
    screenshotUrl?: string;
    error?: string;
  }[];
}

// ✅ API Endpoint untuk menjalankan automation
app.post("/api/run-automation", async (req: Request, res: Response) => {
  try {
    const { url, steps, headless }: { url: string; steps: Step[]; headless: boolean } = req.body;

    if (!url || !steps) {
      return res.status(400).json({ status: "error", message: "Missing parameters" });
    }

    const sessionId = uuidv4();
    const folderPath = path.join(SCREENSHOT_DIR, sessionId);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    console.log(`📂 Folder session ${sessionId} dibuat di: ${folderPath}`);

    const browser = await chromium.launch({ headless });
    const page = await browser.newPage();
    const stepResults: AutomationResponse["stepResults"] = [];

    try {
      await page.goto(url);
      await page.waitForLoadState("networkidle");

      for (let i = 0; i < steps.length; i++) {
        const { action, xpath, value } = steps[i];

        try {
          const locator = page.locator(`xpath=${xpath}`);

          switch (action) {
            case "click":
              await page.waitForSelector(`xpath=${xpath}`, { timeout: 5000 });
              await locator.click();
              break;
            case "fill":
              await page.waitForSelector(`xpath=${xpath}`, { timeout: 5000 });
              await locator.fill(value || "");
              break;
            case "wait":
              await page.waitForSelector(`xpath=${xpath}`, { timeout: parseInt(value || "5000") });
              break;
            case "validate":
              await page.waitForSelector(`xpath=${xpath}`, { timeout: 5000 });
              await locator.textContent();
              break;
            case "assert-url":
              await page.waitForURL(value || "");
              break;
            case "select":
              await page.waitForSelector(`xpath=${xpath}`, { timeout: 5000 });
              await locator.selectOption({ label: value || "" });
              break;
            case "scroll":
              await page.waitForSelector(`xpath=${xpath}`, { timeout: 5000 });
              await locator.scrollIntoViewIfNeeded();
              break;
            default:
              throw new Error(`Unknown action: ${action}`);
          }

          // ✅ Simpan screenshot
          const screenshotPath = path.join(folderPath, `step-${i + 1}.png`);
          await page.screenshot({ path: screenshotPath });

          console.log(`✅ Screenshot berhasil disimpan: ${screenshotPath}`);

          stepResults.push({
            action,
            xpath,
            value,
            status: "sukses",
            screenshotUrl: `${SERVER_URL}/screenshots/${sessionId}/step-${i + 1}.png`,
          });
        } catch (stepError: unknown) {
          const errorMessage = stepError instanceof Error ? stepError.message : "Unknown error";
          const screenshotPath = path.join(folderPath, `step-${i + 1}-error.png`);
          await page.screenshot({ path: screenshotPath });

          console.log(`❌ Error pada step ${i + 1}: ${errorMessage}`);

          stepResults.push({
            action,
            xpath,
            value,
            status: "gagal",
            error: errorMessage,
            screenshotUrl: `${SERVER_URL}/screenshots/${sessionId}/step-${i + 1}-error.png`,
          });
        }
      }

      // ✅ Kirim response dengan URL hasil screenshot
      res.json({
        status: "success",
        message: "Automation completed!",
        reportUrl: `${SERVER_URL}/screenshots/${sessionId}/result.html`,
        stepResults,
      });
    } finally {
      await browser.close();
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", message: errorMessage });
  }
});

// ✅ Jalankan server di Railway
app.listen(PORT, () => {
  console.log(`🚀 Server running at ${SERVER_URL}`);
});
