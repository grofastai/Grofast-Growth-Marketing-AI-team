import { getNotes } from '@/lib/actions/notes'
import NotesClient from './notes-client'

export default async function NotesPage() {
  const notes = await getNotes()
  return <NotesClient initialNotes={notes} />
}
