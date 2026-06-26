import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Project } from '../stores/projectStore'

interface OutlineItem {
  id: string
  depth: number   // 0 = act/part, 1 = chapter/sequence, 2 = scene/beat
  title: string
  summary: string
  status: 'todo' | 'draft' | 'done'
}

const DEPTH_LABELS: Record<number, string> = {
  0: 'Act / Part',
  1: 'Chapter / Sequence',
  2: 'Scene / Beat',
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-200 text-gray-500',
  draft: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
}

interface Props {
  project: Project
}

export default function OutlinePanel({ project }: Props): JSX.Element {
  const [items, setItems] = useState<OutlineItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reuse notes.json key pattern — outlines stored in outline.json via a generic save
  useEffect(() => {
    loadOutline()
  }, [project.path])

  async function loadOutline(): Promise<void> {
    try {
      const raw = await window.api.loadOutline(project.path)
      if (Array.isArray(raw) && raw.length > 0) {
        setItems(raw as OutlineItem[])
        setSelectedId((raw as OutlineItem[])[0].id)
        return
      }
    } catch {
      // fall through to default
    }
    // Default starter outline
    const defaults: OutlineItem[] = [
      { id: crypto.randomUUID(), depth: 0, title: project.type === 'novel' ? 'Part One' : 'Act One', summary: '', status: 'todo' },
      { id: crypto.randomUUID(), depth: 1, title: project.type === 'novel' ? 'Chapter 1' : 'Sequence 1', summary: '', status: 'todo' },
    ]
    setItems(defaults)
    setSelectedId(defaults[0].id)
  }

  const scheduleSave = useCallback(
    (next: OutlineItem[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        setSaving(true)
        await window.api.saveOutline(project.path, next)
        setSaving(false)
      }, 1200)
    },
    [project.path]
  )

  function addItem(depth: number): void {
    const label = DEPTH_LABELS[depth] ?? 'Item'
    const item: OutlineItem = {
      id: crypto.randomUUID(),
      depth,
      title: `New ${label}`,
      summary: '',
      status: 'todo',
    }
    const next = [...items, item]
    setItems(next)
    setSelectedId(item.id)
    scheduleSave(next)
  }

  function deleteItem(id: string): void {
    const next = items.filter((i) => i.id !== id)
    setItems(next)
    setSelectedId(next.length > 0 ? next[0].id : null)
    scheduleSave(next)
  }

  function updateField(id: string, field: keyof OutlineItem, value: string | number): void {
    const next = items.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    setItems(next)
    scheduleSave(next)
  }

  function moveItem(id: string, dir: -1 | 1): void {
    const idx = items.findIndex((i) => i.id === id)
    if (idx < 0) return
    const target = idx + dir
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setItems(next)
    scheduleSave(next)
  }

  const selected = items.find((i) => i.id === selectedId) ?? null

  return (
    <div className="h-full flex bg-white">
      {/* Left: outline list */}
      <div className="w-64 shrink-0 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Outline
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full text-left border-b border-gray-100 transition-colors ${
                selectedId === item.id ? 'bg-gray-900' : 'hover:bg-gray-50'
              }`}
              style={{ paddingLeft: `${12 + item.depth * 16}px`, paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    selectedId === item.id ? 'bg-white/20 text-white' : STATUS_COLORS[item.status]
                  }`}
                >
                  {item.status}
                </span>
                <span
                  className={`text-sm truncate ${
                    selectedId === item.id ? 'text-white font-medium' : 'text-gray-800'
                  }`}
                >
                  {item.title || 'Untitled'}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Add buttons */}
        <div className="p-3 border-t border-gray-200 space-y-1">
          {[0, 1, 2].map((d) => (
            <button
              key={d}
              onClick={() => addItem(d)}
              className="w-full text-left text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
            >
              + {DEPTH_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-y-auto">
        {selected === null ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3">📋</div>
              <div className="text-sm">Select an item to edit</div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-8">
            <div className="flex items-start justify-between mb-4">
              <input
                value={selected.title}
                onChange={(e) => updateField(selected.id, 'title', e.target.value)}
                className="text-2xl font-bold text-gray-900 border-none outline-none bg-transparent flex-1 min-w-0"
                placeholder="Title"
              />
              <button
                onClick={() => deleteItem(selected.id)}
                className="ml-4 text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
              >
                Delete
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2">
                  Level
                </label>
                <select
                  value={selected.depth}
                  onChange={(e) => updateField(selected.id, 'depth', Number(e.target.value))}
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none"
                >
                  {[0, 1, 2].map((d) => (
                    <option key={d} value={d}>
                      {DEPTH_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2">
                  Status
                </label>
                <select
                  value={selected.status}
                  onChange={(e) => updateField(selected.id, 'status', e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none"
                >
                  <option value="todo">To Do</option>
                  <option value="draft">Draft</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div className="flex gap-1 ml-auto">
                <button
                  onClick={() => moveItem(selected.id, -1)}
                  className="text-gray-400 hover:text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-100"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveItem(selected.id, 1)}
                  className="text-gray-400 hover:text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-100"
                  title="Move down"
                >
                  ↓
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Summary
              </label>
              <textarea
                value={selected.summary}
                onChange={(e) => updateField(selected.id, 'summary', e.target.value)}
                className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none leading-relaxed"
                placeholder="What happens in this section…"
                rows={10}
              />
            </div>
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
