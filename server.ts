import express, { Request, Response } from "express";
import { chromium as playwrightChromium } from "playwright-extra";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import fs from "fs";
import path from "path";

// ✅ Setup Express
const app = express();
const PORT = process.env.PORT || 3004;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const railway_url = "https://backend-automation-production-badd.up.railway.app";

// ✅ Middleware
const allowedOrigins = [
  "http://localhost:3001",
  "https://automation-tools-drab.vercel.app",
];
app.use(express.json());
app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

// ✅ Folder screenshot
const SCREENSHOT_DIR = path.join(process.cwd(), "public/screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
app.use("/screenshots", express.static(SCREENSHOT_DIR));
console.log(`🖼️ Static files served from: ${SCREENSHOT_DIR}`);

// ✅ Tipe step automation
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

// ✅ API endpoint utama
app.post("/api/run-automation", async (req: Request, res: Response) => {
  try {
    const { url, steps, headless }: { url: string; steps: Step[]; headless: boolean } = req.body;

    if (!url || !steps) {
      return res.status(400).json({ status: "error", message: "Missing parameters" });
    }

    const sessionId = uuidv4();
    const folderPath = path.join(SCREENSHOT_DIR, sessionId);
    fs.mkdirSync(folderPath, { recursive: true });

    const browser = await playwrightChromium.launch({ 
      headless,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ], });
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 768 },
        timezoneId: "Asia/Jakarta",
        locale: "en-US",
      });
    const page = await context.newPage();
    // ✅ Manual stealth anti-fingerprint
    await page.addInitScript(() => {
      (window as any).chrome = { runtime: {} };
    
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args): any {
        const context = getContext.apply(this, args) as CanvasRenderingContext2D | null;

        if (args[0] === '2d' && context) {
          context.getImageData = function () {
            throw new Error('Blocked for anti-fingerprint');
          };
        }

        return context;
      };

    });
    
    const stepResults: AutomationResponse["stepResults"] = [];

    try {
      await page.goto(url, { timeout: 30000 });
      await page.waitForTimeout(5000)

      for (let i = 0; i < steps.length; i++) {
        const { action, xpath, value } = steps[i];

        try {
          switch (action) {
            case "click":
              await page.locator(`xpath=${xpath}`).click();
              break;
            case "fill":
              await page.locator(`xpath=${xpath}`).fill(value || "");
              break;
            case "wait":
              await page.waitForSelector(`xpath=${xpath}`, { timeout: parseInt(value || "5000") });
              break;
            case "validate":
              await page.locator(`xpath=${xpath}`).textContent();
              break;
            case "assert-url":
              await page.waitForURL(value || "");
              break;
            case "select":
              await page.locator(`xpath=${xpath}`).selectOption({ label: value || "" });
              break;
            case "scroll":
              await page.locator(`xpath=${xpath}`).scrollIntoViewIfNeeded();
              break;
            default:
              throw new Error(`Unknown action: ${action}`);
          }

          const screenshotPath = path.join(folderPath, `step-${i + 1}.png`);
          await page.screenshot({ path: screenshotPath });

          stepResults.push({
            action,
            xpath,
            value,
            status: "sukses",
            screenshotUrl: `${railway_url}/screenshots/${sessionId}/step-${i + 1}.png`,
          });
        } catch (stepError: any) {
          const errorMessage = stepError?.message || "Unknown error";
          const screenshotPath = path.join(folderPath, `step-${i + 1}-error.png`);
          await page.screenshot({ path: screenshotPath });

          stepResults.push({
            action,
            xpath,
            value,
            status: "gagal",
            error: errorMessage,
            screenshotUrl: `${railway_url}/screenshots/${sessionId}/step-${i + 1}-error.png`,
          });
        }
      }

      const resultHtml = `
        <html>
          <body>
            <h1>Automation Report</h1>
            <p>URL: ${url}</p>
            ${stepResults
              .map((step, index) => `
                <div>
                  <p><strong>Step ${index + 1}:</strong> ${step.action} - ${step.xpath} - 
                  <span style="color: ${step.status === "sukses" ? "green" : "red"};">${step.status}</span></p>
                  ${step.error ? `<p style="color: red;">Error: ${step.error}</p>` : ""}
                  <img src="${step.screenshotUrl}" width="300" />
                </div>
              `)
              .join("")}
          </body>
        </html>
      `;
      fs.writeFileSync(path.join(folderPath, "result.html"), resultHtml);

      res.json({
        status: "success",
        message: "Automation completed!",
        reportUrl: `${railway_url}/screenshots/${sessionId}/result.html`,
        stepResults,
      });
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ Run server
app.listen(PORT, () => {
  console.log(`🚀 Server running at ${SERVER_URL}`);
});
