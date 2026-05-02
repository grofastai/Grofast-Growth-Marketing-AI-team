import { GoogleAuth } from 'google-auth-library'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

// ── Auth ──────────────────────────────────────────────────────

let _auth: GoogleAuth | null = null

function getAuth(): GoogleAuth {
  if (_auth) return _auth
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
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

async function driveGet(path: string, t: string) {
  const res = await fetch(`${DRIVE}${path}`, {
    headers: { Authorization: `Bearer ${t}` },
  })
  if (!res.ok) throw new Error(`Drive GET ${path}: ${await res.text()}`)
  return res.json()
}

async function drivePost(path: string, body: unknown, t: string) {
  const res = await fetch(`${DRIVE}${path}`, {
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
  if (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    rootFolderIdCache = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
    return rootFolderIdCache
  }

  // Search for existing MediaUploads folder
  const q = encodeURIComponent(`name='MediaUploads' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const search = await driveGet(`/files?q=${q}&fields=files(id)`, t)

  if (search.files?.length > 0) {
    rootFolderIdCache = search.files[0].id
  } else {
    // Create root folder
    const created = await drivePost('/files?fields=id', {
      name: 'MediaUploads',
      mimeType: 'application/vnd.google-apps.folder',
    }, t)
    rootFolderIdCache = created.id

    // Make root folder public so admin can browse via link
    await fetch(`${DRIVE}/files/${rootFolderIdCache}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    })
  }

  return rootFolderIdCache!
}

// ── Public API ────────────────────────────────────────────────

/** Returns the Drive folder ID for MediaUploads / year / month / clientName */
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
 * Initiates a resumable upload session.
 * Returns the upload URL — browser uploads the file directly to this URL.
 * After upload, Drive returns { id, webViewLink } in the response body.
 */
export async function initResumableUpload(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileSize: number
): Promise<string> {
  const t = await token()

  const res = await fetch(
    `${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink`,
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

  const uploadUrl = res.headers.get('Location')
  if (!uploadUrl) throw new Error('Drive did not return a resumable upload URL')
  return uploadUrl
}

/** Makes a file publicly readable and returns its web view link */
export async function makeFilePublic(fileId: string): Promise<string> {
  const t = await token()

  await fetch(`${DRIVE}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })

  const file = await driveGet(`/files/${fileId}?fields=webViewLink`, t)
  return file.webViewLink as string
}
