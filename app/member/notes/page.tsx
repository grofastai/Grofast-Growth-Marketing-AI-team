import { getNotes } from '@/lib/actions/notes'
import NotesClient from './notes-client'

export const dynamic = 'force-dynamic'

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const params = await searchParams
  const archived = params.archived === '1'
  const notes = await getNotes(archived)
  return <NotesClient initialNotes={notes} showArchived={archived} />
}
