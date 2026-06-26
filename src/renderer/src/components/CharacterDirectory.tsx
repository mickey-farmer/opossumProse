import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Project } from '../stores/projectStore'

interface Character {
  id: string
  name: string
  role: string
  age: string
  appearance: string
  personality: string
  backstory: string
  notes: string
}

const EMPTY_CHARACTER: Omit<Character, 'id'> = {
  name: 'New Character',
  role: '',
  age: '',
  appearance: '',
  personality: '',
  backstory: '',
  notes: '',
}

const ROLE_OPTIONS = ['Protagonist', 'Antagonist', 'Supporting', 'Minor', 'Narrator']

interface Props {
  project: Project
}

export default function CharacterDirectory({ project }: Props): JSX.Element {
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.api.loadCharacters(project.path).then((raw) => {
      const chars = (raw as Character[]) || []
      setCharacters(chars)
      if (chars.length > 0) setSelectedId(chars[0].id)
    })
  }, [project.path])

  const scheduleSave = useCallback(
    (chars: Character[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        setSaving(true)
        await window.api.saveCharacters(project.path, chars)
        setSaving(false)
      }, 1200)
    },
    [project.path]
  )

  function addCharacter(): void {
    const newChar: Character = { ...EMPTY_CHARACTER, id: crypto.randomUUID() }
    const next = [...characters, newChar]
    setCharacters(next)
    setSelectedId(newChar.id)
    scheduleSave(next)
  }

  function deleteCharacter(id: string): void {
    const next = characters.filter((c) => c.id !== id)
    setCharacters(next)
    setSelectedId(next.length > 0 ? next[0].id : null)
    scheduleSave(next)
  }

  function updateField(id: string, field: keyof Character, value: string): void {
    const next = characters.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    setCharacters(next)
    scheduleSave(next)
  }

  const selected = characters.find((c) => c.id === selectedId) ?? null

  return (
    <div className="h-full flex bg-white">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Characters
          </span>
          <button
            onClick={addCharacter}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
            title="Add character"
          >
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {characters.length === 0 && (
            <div className="p-4 text-sm text-gray-400 text-center">No characters yet</div>
          )}
          {characters.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-100 transition-colors ${
                selectedId === c.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
              }`}
            >
              <div
                className={`text-sm font-medium truncate ${
                  selectedId === c.id ? 'text-white' : 'text-gray-800'
                }`}
              >
                {c.name || 'Unnamed'}
              </div>
              {c.role && (
                <div
                  className={`text-xs truncate ${
                    selectedId === c.id ? 'text-gray-300' : 'text-gray-400'
                  }`}
                >
                  {c.role}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex-1 overflow-y-auto">
        {selected === null ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3">🎭</div>
              <div className="text-sm">Add a character to get started</div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-8">
            <div className="flex items-start justify-between mb-6">
              <input
                value={selected.name}
                onChange={(e) => updateField(selected.id, 'name', e.target.value)}
                className="text-2xl font-bold text-gray-900 border-none outline-none bg-transparent flex-1 min-w-0"
                placeholder="Character name"
              />
              <button
                onClick={() => deleteCharacter(selected.id)}
                className="ml-4 text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
              >
                Delete
              </button>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Role">
                  <select
                    value={selected.role}
                    onChange={(e) => updateField(selected.id, 'role', e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
                  >
                    <option value="">Select role…</option>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Age">
                  <input
                    value={selected.age}
                    onChange={(e) => updateField(selected.id, 'age', e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    placeholder="e.g. 32, mid-40s"
                  />
                </Field>
              </div>

              <Field label="Appearance">
                <textarea
                  value={selected.appearance}
                  onChange={(e) => updateField(selected.id, 'appearance', e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                  placeholder="Physical description…"
                />
              </Field>

              <Field label="Personality">
                <textarea
                  value={selected.personality}
                  onChange={(e) => updateField(selected.id, 'personality', e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                  placeholder="Traits, voice, quirks…"
                />
              </Field>

              <Field label="Backstory">
                <textarea
                  value={selected.backstory}
                  onChange={(e) => updateField(selected.id, 'backstory', e.target.value)}
                  rows={4}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                  placeholder="History, motivations, secrets…"
                />
              </Field>

              <Field label="Notes">
                <textarea
                  value={selected.notes}
                  onChange={(e) => updateField(selected.id, 'notes', e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                  placeholder="Anything else…"
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      {/* Save indicator */}
      {saving && (
        <div className="absolute bottom-4 right-4 text-xs text-gray-400 bg-white/80 backdrop-blur px-2 py-1 rounded">
          Saving…
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}
