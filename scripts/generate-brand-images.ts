/**
 * Playwright script: auto-generate stat card illustrations via ChatGPT DALL-E.
 *
 * First run (login):   pnpm chatgpt:login
 * Generate images:     pnpm generate:images
 */

import { chromium, Browser, BrowserContext, Page } from "playwright"
import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import { imagePrompts } from "./image-prompts"

const SESSION_PATH = path.join(__dirname, "chatgpt-session", "state.json")
const OUTPUT_DIR   = path.join(__dirname, "..", "public", "brand")
const LOGIN_ONLY   = process.argv.includes("--login-only")

// ── helpers ──────────────────────────────────────────────────────────────────

function waitForEnter(message: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(message, () => { rl.close(); resolve() })
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── login flow ────────────────────────────────────────────────────────────────

async function saveSession() {
  console.log("\n🌐  Opening browser for manual login…")
  const browser: Browser = await chromium.launch({ headless: false })
  const context: BrowserContext = await browser.newContext()
  const page: Page = await context.newPage()

  await page.goto("https://chat.openai.com", { waitUntil: "domcontentloaded" })

  await waitForEnter(
    "\n👉  Log in to ChatGPT in the browser window that just opened.\n" +
    "    When you are fully logged in and can see the chat input, press ENTER here… "
  )

  // Save cookies + localStorage
  fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true })
  await context.storageState({ path: SESSION_PATH })
  console.log(`\n✅  Session saved to ${SESSION_PATH}`)

  await browser.close()
  console.log("   Run  pnpm generate:images  to start generating images.\n")
  process.exit(0)
}

// ── image generation ──────────────────────────────────────────────────────────

async function generateImage(
  context: BrowserContext,
  filename: string,
  prompt: string,
  index: number,
  total: number
): Promise<void> {
  console.log(`\n[${index}/${total}] Generating: ${filename}`)
  console.log(`    Prompt: ${prompt.slice(0, 80)}…`)

  const page: Page = await context.newPage()

  try {
    // Navigate to a new chat
    await page.goto("https://chatgpt.com", { waitUntil: "domcontentloaded", timeout: 30_000 })

    // Wait for the chat input to be ready
    const inputSelector = "#prompt-textarea, [contenteditable='true'][data-virtualkeyboard-exclusion]"
    await page.waitForSelector(inputSelector, { timeout: 20_000 })

    // Type the prompt
    await page.click(inputSelector)
    await page.keyboard.type(prompt, { delay: 20 })
    await sleep(500)
    await page.keyboard.press("Enter")

    console.log("    ⏳  Waiting for DALL-E image (up to 90s)…")

    // Wait for the generated image to appear — try multiple selectors
    let imageUrl: string | null = null

    // Strategy 1: watch for an <img> with an OpenAI CDN src
    try {
      const imgLocator = page.locator(
        'img[src*="oaidalleapiprodscus"], img[src*="oaistatic"], img[src*="files.oaiusercontent"]'
      ).first()
      await imgLocator.waitFor({ state: "visible", timeout: 90_000 })
      imageUrl = await imgLocator.getAttribute("src")
    } catch {
      // Strategy 2: look for a download button and intercept the response
      console.log("    ↩  Falling back to download-button intercept…")
    }

    // Strategy 2 (fallback): intercept the image network response during generation
    if (!imageUrl) {
      const responsePromise = page.waitForResponse(
        (res) =>
          (res.url().includes("oaidalleapiprodscus") ||
            res.url().includes("oaistatic") ||
            res.url().includes("files.oaiusercontent")) &&
          res.status() === 200,
        { timeout: 90_000 }
      )
      const response = await responsePromise
      imageUrl = response.url()
    }

    if (!imageUrl) {
      throw new Error("Could not find the generated image URL")
    }

    console.log("    📥  Downloading image…")

    // Download using the authenticated browser request (preserves cookies/auth)
    const response = await page.request.fetch(imageUrl)
    const buffer = await response.body()

    const outputPath = path.join(OUTPUT_DIR, filename)
    fs.writeFileSync(outputPath, buffer)

    console.log(`    ✅  Saved → public/brand/${filename}  (${Math.round(buffer.length / 1024)} KB)`)
  } finally {
    await page.close()
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  // First-run: save login session
  if (LOGIN_ONLY || !fs.existsSync(SESSION_PATH)) {
    await saveSession()
    return
  }

  console.log(`\n🚀  GroFast Image Generator`)
  console.log(`    Session: ${SESSION_PATH}`)
  console.log(`    Output:  ${OUTPUT_DIR}`)
  console.log(`    Images:  ${imagePrompts.length}\n`)

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const browser: Browser = await chromium.launch({ headless: false }) // keep visible so you can see progress
  const context: BrowserContext = await browser.newContext({
    storageState: SESSION_PATH,
    viewport: { width: 1280, height: 800 },
  })

  const failed: string[] = []

  for (let i = 0; i < imagePrompts.length; i++) {
    const { filename, prompt } = imagePrompts[i]
    try {
      await generateImage(context, filename, prompt, i + 1, imagePrompts.length)
    } catch (err) {
      console.error(`    ❌  Failed: ${filename} — ${(err as Error).message}`)
      failed.push(filename)
    }

    // Pause between requests to avoid rate-limiting (skip after last)
    if (i < imagePrompts.length - 1) {
      console.log("    ⏸   Waiting 20s before next image…")
      await sleep(20_000)
    }
  }

  await browser.close()

  console.log("\n─────────────────────────────────────")
  console.log(`✅  Done! ${imagePrompts.length - failed.length}/${imagePrompts.length} images saved to public/brand/`)
  if (failed.length > 0) {
    console.log(`❌  Failed: ${failed.join(", ")}`)
    console.log("    Re-run  pnpm generate:images  to retry failed images.")
  }
  console.log("─────────────────────────────────────\n")
}

main().catch((err) => {
  console.error("\n💥  Fatal error:", err)
  process.exit(1)
})
