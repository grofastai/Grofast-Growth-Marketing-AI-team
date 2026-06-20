import { GoogleAuth } from 'google-auth-library'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

// ── Auth ──────────────────────────────────────────────────────

let _auth: GoogleAuth | null = null

function getAuth(): GoogleAuth {
  if (_auth) return _auth
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY2 || process.env.GOOGLE_SERVICE_ACCOUNT_KEY)!
  const credentials = JSON.parse(raw)
  _auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] })
  return _auth
}

async function token(): Promise<string> {
  const client = await getAuth().getClient()
  const res = await (client as any).getAccessToken()
  return res.token as string
}

// ── Folder cache (in-memory per server instance) ──────────────

const folderCache = new Map<string, string>() // "parentId::name" → folderId
let rootFolderIdCache: string | null = null

// ── Core helpers ──────────────────────────────────────────────
// All calls include supportsAllDrives=true so they work with Shared Drives

async function driveGet(path: string, t: string) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(
    `${DRIVE}${path}${sep}supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${t}` } }
  )
  if (!res.ok) throw new Error(`Drive GET ${path}: ${await res.text()}`)
  return res.json()
}

async function drivePost(path: string, body: unknown, t: string) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${DRIVE}${path}${sep}supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Drive POST ${path}: ${await res.text()}`)
  return res.json()
}

// ── Folder management ─────────────────────────────────────────

async function findOrCreate(name: string, parentId: string, t: string): Promise<string> {
  const cacheKey = `${parentId}::${name}`
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey)!

  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )
  const search = await driveGet(`/files?q=${q}&fields=files(id)`, t)

  let id: string
  if (search.files?.length > 0) {
    id = search.files[0].id
  } else {
    const created = await drivePost('/files?fields=id', {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }, t)
    id = created.id
  }

  folderCache.set(cacheKey, id)
  return id
}

async function getRootFolder(t: string): Promise<string> {
  if (rootFolderIdCache) return rootFolderIdCache
  if (!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID env var is required. Set it to your Shared Drive ID.')
  }
  rootFolderIdCache = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  return rootFolderIdCache
}

// ── Public API ────────────────────────────────────────────────

/** Returns the Drive folder ID for <root> / year / month / clientName */
export async function getOrCreateClientFolder(
  year: string,
  month: string,
  clientName: string
): Promise<string> {
  const t = await token()
  const rootId = await getRootFolder(t)
  const yearId = await findOrCreate(year, rootId, t)
  const monthId = await findOrCreate(month, yearId, t)
  const clientId = await findOrCreate(clientName, monthId, t)
  return clientId
}

/**
 * Initiates a resumable upload session to a Shared Drive folder.
 * Returns the upload URL — browser uploads the file directly to this URL.
 */
export async function initResumableUpload(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileSize: number
): Promise<string> {
  const t = await token()

  const res = await fetch(
    `${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink&supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Drive resumable upload init failed (${res.status}): ${body}`)
  }

  const uploadUrl = res.headers.get('Location')
  if (!uploadUrl) throw new Error('Drive did not return a resumable upload URL')
  return uploadUrl
}

/**
 * Uploads a JSON string to GOOGLE_DRIVE_BACKUP_FOLDER_ID/<year>/<fileName>.
 * Creates the year sub-folder if it doesn't exist.
 * Returns the Drive file ID.
 */
export async function uploadFileToBackupFolder(
  year: string,
  fileName: string,
  content: string,
): Promise<string> {
  const backupRoot = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
  if (!backupRoot) throw new Error('GOOGLE_DRIVE_BACKUP_FOLDER_ID env var is not set')
  const t = await token()
  const yearId = await findOrCreate(year, backupRoot, t)

  const metadata = JSON.stringify({ name: fileName, parents: [yearId] })
  const BOUNDARY = 'gf_backup_boundary'
  const body = [
    `--${BOUNDARY}\r\n`,
    `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
    `${metadata}\r\n`,
    `--${BOUNDARY}\r\n`,
    `Content-Type: application/json\r\n\r\n`,
    `${content}\r\n`,
    `--${BOUNDARY}--`,
  ].join('')

  const res = await fetch(
    `${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': `multipart/related; boundary=${BOUNDARY}`,
      },
      body,
    }
  )

  if (!res.ok) throw new Error(`Drive backup upload failed (${res.status}): ${await res.text()}`)
  const file = await res.json() as { id: string }
  return file.id
}

/** Creates (or finds) a member folder under GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID */
export async function getOrCreateMemberFolder(memberName: string): Promise<string> {
  const parentId = process.env.GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID
  if (!parentId) throw new Error('GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID env var is not set')
  const t = await token()
  return findOrCreate(memberName, parentId, t)
}

/** Uploads a file buffer to a member's Drive folder. Returns { fileId, webViewLink } */
export async function uploadMemberDocument(
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ fileId: string; webViewLink: string }> {
  const t = await token()
  const BOUNDARY = 'gf_member_doc_boundary'
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] })

  const bodyParts: (string | Buffer)[] = [
    `--${BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadata,
    `\r\n--${BOUNDARY}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    buffer,
    `\r\n--${BOUNDARY}--`,
  ]
  const body = Buffer.concat(bodyParts.map(p => typeof p === 'string' ? Buffer.from(p) : p))

  const res = await fetch(
    `${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': `multipart/related; boundary=${BOUNDARY}`,
      },
      body,
    }
  )
  if (!res.ok) throw new Error(`Drive member doc upload failed (${res.status}): ${await res.text()}`)
  const file = await res.json() as { id: string; webViewLink: string }
  return { fileId: file.id, webViewLink: file.webViewLink }
}

/** Makes a file publicly readable and returns its web view link */
export async function makeFilePublic(fileId: string): Promise<string> {
  const t = await token()

  await fetch(`${DRIVE}/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })

  const file = await driveGet(`/files/${fileId}?fields=webViewLink`, t)
  return file.webViewLink as string
}
