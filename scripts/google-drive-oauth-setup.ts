/**
 * One-time interactive setup: obtains a Google OAuth refresh token for Drive access.
 *
 * 1. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env.local first
 *    (from the OAuth Client ID created in Google Cloud Console).
 * 2. Run: pnpm drive:oauth-setup
 * 3. Open the printed URL, log in with the real Gmail account, click Allow.
 * 4. Copy the printed refresh token into GOOGLE_OAUTH_REFRESH_TOKEN in .env.local
 *    (and into Vercel's Production + Preview env vars).
 */
import { OAuth2Client } from "google-auth-library"
import * as http from "http"
import * as fs from "fs"
import * as path from "path"

const PORT = 53682
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(__dirname, "..", ".env.local")
  const text = fs.readFileSync(envPath, "utf8")
  const env: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, "")
  }
  return env
}

async function main() {
  const env = loadEnvLocal()
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error("Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in .env.local")
    console.error("Create an OAuth Client ID (Desktop app) in Google Cloud Console first.")
    process.exit(1)
  }

  const oauth2Client = new OAuth2Client({ clientId, clientSecret, redirectUri: REDIRECT_URI })
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
  })

  console.log("\nOpen this URL in your browser, log in with your real Gmail account, and click Allow:\n")
  console.log(authUrl)
  console.log(`\nWaiting for you to complete sign-in (listening on ${REDIRECT_URI})...\n`)

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return
      const url = new URL(req.url, REDIRECT_URI)
      const codeParam = url.searchParams.get("code")
      const errorParam = url.searchParams.get("error")
      if (errorParam) {
        res.writeHead(400, { "Content-Type": "text/plain" })
        res.end("Authorization failed — you can close this tab.")
        server.close()
        reject(new Error(`OAuth error: ${errorParam}`))
        return
      }
      if (codeParam) {
        res.writeHead(200, { "Content-Type": "text/plain" })
        res.end("Authorization complete — you can close this tab and return to the terminal.")
        server.close()
        resolve(codeParam)
      }
    })
    server.listen(PORT)
  })

  const { tokens } = await oauth2Client.getToken(code)
  if (!tokens.refresh_token) {
    console.error("\nNo refresh_token returned. This usually means the account already granted")
    console.error("consent before. Revoke access at https://myaccount.google.com/permissions")
    console.error("for this app, then run this script again.")
    process.exit(1)
  }

  console.log("\nSuccess! Add this to .env.local as GOOGLE_OAUTH_REFRESH_TOKEN,")
  console.log("and to Vercel (Production + Preview env vars):\n")
  console.log(tokens.refresh_token)
  console.log()
}

main().catch(err => {
  console.error("Setup failed:", err)
  process.exit(1)
})
