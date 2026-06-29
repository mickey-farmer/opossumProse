import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Project, ProjectType } from '../stores/projectStore'

type ItemColor = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink'

interface OutlineItem {
  id: string
  depth: number   // 0 = top level, 1 = mid, 2 = leaf
  title: string
  summary: string
  notes: string
  status: 'todo' | 'draft' | 'done'
  color: ItemColor
}

const DEPTH_LABELS: Record<ProjectType, [string, string, string]> = {
  novel:      ['Part',  'Chapter',  'Scene'],
  screenplay: ['Act',   'Sequence', 'Scene'],
  stageplay:  ['Act',   'Scene',    'Beat'],
  tv:         ['Act',   'Sequence', 'Scene'],
  shortstory: ['Part',  'Section',  'Beat'],
  videogame:  ['Quest', 'Mission',  'Beat'],
}

const STATUS_COLORS: Record<string, string> = {
  todo:  'bg-gray-100 text-gray-500',
  draft: 'bg-yellow-100 text-yellow-700',
  done:  'bg-green-100 text-green-700',
}

const COLOR_HEX: Record<ItemColor, string> = {
  none:   'transparent',
  red:    '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green:  '#22c55e',
  blue:   '#3b82f6',
  purple: '#a855f7',
  pink:   '#ec4899',
}

const COLOR_PALETTE: ItemColor[] = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']

type OutlineView = 'list' | 'overview'

interface Props {
  project: Project
}

function makeItem(depth: number, label: string): OutlineItem {
  return {
    id: crypto.randomUUID(),
    depth,
    title: `New ${label}`,
    summary: '',
    notes: '',
    status: 'todo',
    color: 'none',
  }
}

export default function OutlinePanel({ project }: Props): JSX.Element {
  const [items, setItems] = useState<OutlineItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<OutlineView>('list')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const labels = DEPTH_LABELS[project.type] ?? ['Part', 'Section', 'Beat']

  useEffect(() => {
    loadOutline()
  }, [project.path])

  async function loadOutline(): Promise<void> {
    try {
      const raw = await window.api.loadOutline(project.path)
      if (Array.isArray(raw) && raw.length > 0) {
        const migrated = (raw as OutlineItem[]).map((item) => ({
          notes: '',
          color: 'none' as ItemColor,
          ...item,
        }))
        setItems(migrated)
        setSelectedId(migrated[0].id)
        return
      }
    } catch {
      // fall through
    }
    const defaults: OutlineItem[] = [
      makeItem(0, labels[0]),
      makeItem(1, labels[1]),
    ]
    defaults[0].title = labels[0] === 'Act' ? 'Act One' : labels[0] === 'Quest' ? 'Main Quest' : `${labels[0]} One`
    defaults[1].title = labels[1] === 'Chapter' ? 'Chapter 1' : labels[1] === 'Sequence' ? 'Sequence 1' : `${labels[1]} 1`
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
    const item = makeItem(depth, labels[depth] ?? 'Item')
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

  function updateField<K extends keyof OutlineItem>(id: string, field: K, value: OutlineItem[K]): void {
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

  // ── Drag-to-reorder ───────────────────────────────────────────────────────────

  function onDragStart(id: string): void {
    setDragId(id)
  }

  function onDragOver(e: React.DragEvent, id: string): void {
    e.preventDefault()
    if (id !== dragId) setDragOverId(id)
  }

  function onDrop(targetId: string): void {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const fromIdx = items.findIndex((i) => i.id === dragId)
    const toIdx = items.findIndex((i) => i.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...items]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setItems(next)
    scheduleSave(next)
    setDragId(null)
    setDragOverId(null)
  }

  function onDragEnd(): void {
    setDragId(null)
    setDragOverId(null)
  }

  const selected = items.find((i) => i.id === selectedId) ?? null

  // ── Overview mode ─────────────────────────────────────────────────────────────

  if (view === 'overview') {
    return (
      <div className="h-full flex flex-col bg-white relative">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outline — Overview</span>
          <button
            onClick={() => setView('list')}
            className="text-xs text-gray-500 hover:text-gray-800 px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            ← List view
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-8">
            {items.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">No outline items yet.</div>
            ) : (
              items.map((item) => {
                const isDepth0 = item.depth === 0
                const isDepth1 = item.depth === 1
                return (
                  <div
                    key={item.id}
                    className="mb-5 cursor-pointer group"
                    style={{ marginLeft: `${item.depth * 28}px` }}
                    onClick={() => { setSelectedId(item.id); setView('list') }}
                  >
                    <div className="flex items-baseline gap-2.5 mb-1">
                      {item.color !== 'none' && (
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                          style={{ background: COLOR_HEX[item.color] }}
                        />
                      )}
                      <span
                        className={`font-semibold group-hover:text-opossum-600 transition-colors ${
                          isDepth0 ? 'text-xl text-gray-900' :
                          isDepth1 ? 'text-base text-gray-800' :
                          'text-sm text-gray-700'
                        }`}
                      >
                        {item.title || 'Untitled'}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider ${STATUS_COLORS[item.status]}`}>
                        {item.status}
                      </span>
                    </div>
                    {item.summary && (
                      <p
                        className="text-sm text-gray-500 leading-relaxed"
                        style={{ marginLeft: item.color !== 'none' ? '20px' : '0' }}
                      >
                        {item.summary}
                      </p>
                    )}
                    {item.notes && (
                      <p
                        className="text-xs text-gray-400 italic mt-1 leading-relaxed"
                        style={{ marginLeft: item.color !== 'none' ? '20px' : '0' }}
                      >
                        {item.notes}
                      </p>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
        {saving && (
          <div className="absolute bottom-4 right-4 text-xs text-gray-400 bg-white/80 backdrop-blur px-2 py-1 rounded">
            Saving…
          </div>
        )}
      </div>
    )
  }

  // ── List + detail view ────────────────────────────────────────────────────────

  return (
    <div className="h-full flex bg-white relative">
      {/* Left: outline list */}
      <div className="w-64 shrink-0 border-r border-gray-200 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outline</span>
          <button
            onClick={() => setView('overview')}
            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            title="Show full outline"
          >
            Overview
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => onDragStart(item.id)}
              onDragOver={(e) => onDragOver(e, item.id)}
              onDrop={() => onDrop(item.id)}
              onDragEnd={onDragEnd}
              onClick={() => setSelectedId(item.id)}
              className={`w-full text-left border-b border-gray-100 transition-colors cursor-pointer select-none ${
                dragOverId === item.id ? 'border-t-2 border-t-opossum-400' : ''
              } ${
                selectedId === item.id ? 'bg-gray-900' : 'hover:bg-gray-50'
              } ${dragId === item.id ? 'opacity-40' : ''}`}
              style={{ paddingLeft: `${12 + item.depth * 16}px`, paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px' }}
            >
              <div className="flex items-center gap-2">
                {item.color !== 'none' ? (
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLOR_HEX[item.color] }} />
                ) : (
                  <div className="w-2 h-2 shrink-0" />
                )}
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
            </div>
          ))}
        </div>

        {/* Add buttons */}
        <div className="p-3 border-t border-gray-200 space-y-1">
          {([0, 1, 2] as const).map((d) => (
            <button
              key={d}
              onClick={() => addItem(d)}
              className="w-full text-left text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
            >
              + {labels[d]}
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
            {/* Title row */}
            <div className="flex items-start justify-between mb-4">
              <input
                value={selected.title}
                onChange={(e) => updateField(selected.id, 'title', e.target.value)}
                className="text-2xl font-bold text-gray-900 border-none outline-none bg-transparent flex-1 min-w-0"
                placeholder="Title"
              />
              <button
                onClick={() => deleteItem(selected.id)}
                className="ml-4 text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0 mt-2"
              >
                Delete
              </button>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</label>
                <select
                  value={selected.depth}
                  onChange={(e) => updateField(selected.id, 'depth', Number(e.target.value) as OutlineItem['depth'])}
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none"
                >
                  {([0, 1, 2] as const).map((d) => (
                    <option key={d} value={d}>{labels[d]}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</label>
                <select
                  value={selected.status}
                  onChange={(e) => updateField(selected.id, 'status', e.target.value as OutlineItem['status'])}
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none"
                >
                  <option value="todo">To Do</option>
                  <option value="draft">Draft</option>
                  <option value="done">Done</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</label>
                <div className="flex gap-1">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateField(selected.id, 'color', c)}
                      title={c}
                      className={`w-4 h-4 rounded-full border-2 transition-all ${
                        selected.color === c ? 'border-gray-700 scale-125' : 'border-transparent hover:scale-110'
                      }`}
                      style={{
                        background: c === 'none' ? 'white' : COLOR_HEX[c],
                        border: c === 'none' ? (selected.color === 'none' ? '2px solid #374151' : '2px solid #d1d5db') : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-1 ml-auto">
                <button
                  onClick={() => moveItem(selected.id, -1)}
                  className="text-gray-400 hover:text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-100"
                  title="Move up"
                >↑</button>
                <button
                  onClick={() => moveItem(selected.id, 1)}
                  className="text-gray-400 hover:text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-100"
                  title="Move down"
                >↓</button>
              </div>
            </div>

            {/* Summary */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Summary
              </label>
              <textarea
                value={selected.summary}
                onChange={(e) => updateField(selected.id, 'summary', e.target.value)}
                className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none leading-relaxed"
                placeholder="What happens in this section…"
                rows={6}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Writer Notes
              </label>
              <textarea
                value={selected.notes}
                onChange={(e) => updateField(selected.id, 'notes', e.target.value)}
                className="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none leading-relaxed"
                placeholder="Research, open questions, why this beat matters, what it needs to accomplish…"
                rows={4}
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
