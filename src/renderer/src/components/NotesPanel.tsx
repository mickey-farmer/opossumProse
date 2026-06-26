import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Project } from '../stores/projectStore'

interface Note {
  id: string
  title: string
  category: string
  content: string
}

const CATEGORIES = ['General', 'World-building', 'Plot', 'Research', 'Dialogue', 'Other']

interface Props {
  project: Project
}

export default function NotesPanel({ project }: Props): JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterCat, setFilterCat] = useState<string>('All')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.api.loadNotes(project.path).then((raw) => {
      const loaded = (raw as Note[]) || []
      setNotes(loaded)
      if (loaded.length > 0) setSelectedId(loaded[0].id)
    })
  }, [project.path])

  const scheduleSave = useCallback(
    (ns: Note[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        setSaving(true)
        await window.api.saveNotes(project.path, ns)
        setSaving(false)
      }, 1200)
    },
    [project.path]
  )

  function addNote(): void {
    const note: Note = {
      id: crypto.randomUUID(),
      title: 'New Note',
      category: 'General',
      content: '',
    }
    const next = [...notes, note]
    setNotes(next)
    setSelectedId(note.id)
    scheduleSave(next)
  }

  function deleteNote(id: string): void {
    const next = notes.filter((n) => n.id !== id)
    setNotes(next)
    setSelectedId(next.length > 0 ? next[0].id : null)
    scheduleSave(next)
  }

  function updateField(id: string, field: keyof Note, value: string): void {
    const next = notes.map((n) => (n.id === id ? { ...n, [field]: value } : n))
    setNotes(next)
    scheduleSave(next)
  }

  const visible = filterCat === 'All' ? notes : notes.filter((n) => n.category === filterCat)
  const selected = notes.find((n) => n.id === selectedId) ?? null

  return (
    <div className="h-full flex bg-white">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Notes
          </span>
          <button
            onClick={addNote}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
            title="Add note"
          >
            +
          </button>
        </div>

        {/* Category filter */}
        <div className="p-2 border-b border-gray-100">
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none"
          >
            <option value="All">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 && (
            <div className="p-4 text-sm text-gray-400 text-center">No notes</div>
          )}
          {visible.map((n) => (
            <button
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-100 transition-colors ${
                selectedId === n.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
              }`}
            >
              <div
                className={`text-sm font-medium truncate ${
                  selectedId === n.id ? 'text-white' : 'text-gray-800'
                }`}
              >
                {n.title || 'Untitled'}
              </div>
              <div
                className={`text-xs truncate ${
                  selectedId === n.id ? 'text-gray-300' : 'text-gray-400'
                }`}
              >
                {n.category}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor pane */}
      <div className="flex-1 overflow-y-auto">
        {selected === null ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3">📝</div>
              <div className="text-sm">Add a note to get started</div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-8">
            <div className="flex items-start justify-between mb-4">
              <input
                value={selected.title}
                onChange={(e) => updateField(selected.id, 'title', e.target.value)}
                className="text-2xl font-bold text-gray-900 border-none outline-none bg-transparent flex-1 min-w-0"
                placeholder="Note title"
              />
              <button
                onClick={() => deleteNote(selected.id)}
                className="ml-4 text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
              >
                Delete
              </button>
            </div>

            <div className="mb-5">
              <select
                value={selected.category}
                onChange={(e) => updateField(selected.id, 'category', e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={selected.content}
              onChange={(e) => updateField(selected.id, 'content', e.target.value)}
              className="w-full text-sm text-gray-800 border-none outline-none resize-none bg-transparent leading-relaxed"
              placeholder="Start writing your note…"
              style={{ minHeight: '400px' }}
            />
          </div>
        )}
      </div>

      {saving && (
        <div className="absolute bottom-4 right-4 text-xs text-gray-400 bg-white/80 backdrop-blur px-2 py-1 rounded">
          Saving…
        </div>
      )}
    </div>
  )
}
