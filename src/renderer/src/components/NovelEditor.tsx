import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Project, ExportSettings, defaultExportSettings } from '../stores/projectStore'
import AIWriter from './AIWriter'

interface Chapter {
  id: string
  title: string
  content: string
}

// Uncontrolled chapter body editor — avoids cursor-reset bug
interface ChapterEditorProps {
  chapter: Chapter
  isActive: boolean
  onBlur: (id: string, content: string) => void
  onInput: (id: string, content: string) => void
}

const ChapterEditor = React.memo(
  function ChapterEditor({ chapter, isActive, onBlur, onInput }: ChapterEditorProps) {
    const ref = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
      if (ref.current) ref.current.textContent = chapter.content
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (isActive && ref.current && document.activeElement !== ref.current) {
        ref.current.focus()
      }
    }, [isActive])

    return (
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onBlur(chapter.id, e.currentTarget.textContent || '')}
        onInput={(e) => onInput(chapter.id, e.currentTarget.textContent || '')}
        style={{
          fontFamily: 'Times New Roman, Times, serif',
          fontSize: '12pt',
          lineHeight: '2',
          textAlign: 'left',
          minHeight: '8in',
          outline: 'none',
          caretColor: '#1a1a1a',
          whiteSpace: 'pre-wrap'
        }}
        className="prose-editor"
        data-placeholder="Begin writing..."
      />
    )
  },
  (prev, next) => prev.chapter.id === next.chapter.id && prev.isActive === next.isActive
)

function buildNovelPdfHtml(
  chapters: { id: string; title: string; content: string }[],
  liveContents: Record<string, string>,
  projectName: string,
  settings: ExportSettings
): string {
  const mono = `font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:2;`

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  }

  const pageNumStyle = `font-family:'Times New Roman',Times,serif;font-size:10pt;text-align:right;margin-bottom:.5in;`

  let pageNum = 1
  const chapterBlocks = chapters.map((c, idx) => {
    const content = esc((liveContents[c.id] ?? c.content).trim())
    const pageHeader = settings.showPageNumbers ? `<div style="${pageNumStyle}">${projectName} / ${pageNum++}</div>` : ''
    const breakBefore = idx > 0 ? 'page-break-before:always;' : ''
    return `
      <div style="${breakBefore}padding:1in;box-sizing:border-box;">
        ${pageHeader}
        <div style="${mono}text-align:center;margin-bottom:24px;">${esc(c.title)}</div>
        <div style="${mono}text-align:left;">${content || '&nbsp;'}</div>
      </div>`
  }).join('\n')

  let tocHtml = ''
  if (settings.includeTableOfContents) {
    const items = chapters.map((c, i) => `<div style="${mono}">Chapter ${i + 1}: ${esc(c.title)}</div>`).join('\n')
    tocHtml = `<div style="page-break-after:always;padding:1in;box-sizing:border-box;">
      <div style="${mono}font-weight:bold;font-size:14pt;text-align:center;margin-bottom:24px;">Contents</div>
      ${items}
    </div>`
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      @page { size: letter; margin: 0; }
      body { margin: 0; padding: 0; background: white; }
      * { box-sizing: border-box; }
    </style>
  </head><body>
    ${tocHtml}
    ${chapterBlocks}
  </body></html>`
}

export interface NovelEditorHandle {
  getPdfHtml: (settings: ExportSettings) => string
  getPlainText: () => string
  saveNow: () => Promise<void>
}

const NovelEditor = React.forwardRef<NovelEditorHandle, { project: Project; exportSettings: ExportSettings }>(
function NovelEditor({ project, exportSettings }, ref) {
  const [chapters, setChapters] = useState<Chapter[]>([
    { id: '1', title: 'Chapter 1', content: '' }
  ])
  const [activeChapter, setActiveChapter] = useState('1')
  const [editingTitle, setEditingTitle] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const [manuscriptView, setManuscriptView] = useState(false)
  const [showAIWriter, setShowAIWriter] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [, setTick] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveContents = useRef<Record<string, string>>({ '1': '' })
  const chaptersRef = useRef<Chapter[]>([])

  // Tick every 30s so "X min ago" stays current
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // Load from disk on mount
  useEffect(() => {
    if (!project.path) return
    window.api.loadContent(project.path).then((raw) => {
      const data = raw as { chapters?: Chapter[] }
      if (data?.chapters?.length) {
        setChapters(data.chapters)
        chaptersRef.current = data.chapters
        data.chapters.forEach((c) => { liveContents.current[c.id] = c.content })
        setActiveChapter(data.chapters[0].id)
      }
    }).catch(() => {})
  }, [project.path])

  const doSave = useCallback(async (updatedChapters: Chapter[]) => {
    setSaveStatus('saving')
    const wordCount = updatedChapters.reduce((total, c) => {
      return total + (liveContents.current[c.id] ?? c.content).trim().split(/\s+/).filter(Boolean).length
    }, 0)
    await window.api.saveContent(project.path, { chapters: updatedChapters, wordCount })
    setLastSaved(new Date())
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [project.path])

  const scheduleSave = useCallback((updatedChapters: Chapter[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(updatedChapters), 1500)
  }, [doSave])

  const handleBlur = useCallback((id: string, content: string) => {
    liveContents.current[id] = content
    setChapters((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, content } : c))
      chaptersRef.current = updated
      scheduleSave(updated)
      return updated
    })
  }, [scheduleSave])

  const handleInput = useCallback((id: string, content: string) => {
    liveContents.current[id] = content
  }, [])

  function addChapter(): void {
    const id = `${Date.now()}`
    const num = chapters.length + 1
    const newChapter: Chapter = { id, title: `Chapter ${num}`, content: '' }
    liveContents.current[id] = ''
    // Flush any pending live text for the current chapter to state before switching
    setChapters((prev) => {
      const flushed = prev.map((c) =>
        liveContents.current[c.id] !== undefined
          ? { ...c, content: liveContents.current[c.id] }
          : c
      )
      const updated = [...flushed, newChapter]
      scheduleSave(updated)
      return updated
    })
    setActiveChapter(id)
  }

  function renameChapter(id: string, title: string): void {
    setChapters((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, title } : c))
      scheduleSave(updated)
      return updated
    })
    setEditingTitle(null)
  }

  function insertAIText(text: string): void {
    if (!active) return
    const existing = (liveContents.current[active.id] ?? active.content).trimEnd()
    const newContent = existing ? `${existing}\n\n${text}` : text
    liveContents.current[active.id] = newContent

    const el = document.querySelector<HTMLElement>('.prose-editor')
    if (el) el.textContent = newContent

    setChapters((prev) => {
      const updated = prev.map((c) => c.id === active.id ? { ...c, content: newContent } : c)
      chaptersRef.current = updated
      if (saveTimer.current) clearTimeout(saveTimer.current)
      doSave(updated)
      return updated
    })
  }

  function moveChapter(id: string, dir: -1 | 1): void {
    setChapters((prev) => {
      const idx = prev.findIndex((c) => c.id === id)
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      scheduleSave(next)
      return next
    })
  }

  const active = chapters.find((c) => c.id === activeChapter)

  function lastSavedLabel(): string {
    if (saveStatus === 'saving') return 'Saving...'
    if (saveStatus === 'saved') return 'Saved'
    if (!lastSaved) return ''
    const diff = Math.floor((Date.now() - lastSaved.getTime()) / 1000)
    if (diff < 60) return 'Saved just now'
    if (diff < 120) return 'Last saved 1 min ago'
    if (diff < 3600) return `Last saved ${Math.floor(diff / 60)} min ago`
    return `Last saved ${lastSaved.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }

  const wordCount = chapters.reduce((total, c) => {
    return total + (liveContents.current[c.id] ?? c.content).trim().split(/\s+/).filter(Boolean).length
  }, 0)

  const activeWordCount = active
    ? (liveContents.current[active.id] ?? active.content).trim().split(/\s+/).filter(Boolean).length
    : 0

  // Expose export handles to parent
  React.useImperativeHandle(ref, () => ({
    getPdfHtml: (settings: ExportSettings) => buildNovelPdfHtml(chapters, liveContents.current, project.name, settings),
    getPlainText: () => {
      return chapters.map((c) => {
        const content = liveContents.current[c.id] ?? c.content
        return `${c.title}\n\n${content}`
      }).join('\n\n---\n\n')
    },
    saveNow: () => doSave(chaptersRef.current),
  }))

  const smfStyle: React.CSSProperties = {
    fontFamily: 'Times New Roman, Times, serif',
    fontSize: '12pt',
    lineHeight: '2',
  }

  // Context for AI: last ~1500 chars of previous chapter + current chapter so far
  const aiContext = (() => {
    const idx = chapters.findIndex((c) => c.id === activeChapter)
    const prev = idx > 0 ? (liveContents.current[chapters[idx - 1].id] ?? chapters[idx - 1].content) : ''
    const curr = liveContents.current[activeChapter] ?? ''
    return [prev.slice(-800), curr.slice(-700)].filter(Boolean).join('\n\n')
  })()

  return (
    <div className="h-full flex">
      {/* AI Writer modal */}
      {showAIWriter && active && (
        <AIWriter
          mode="novel-chapter"
          projectName={project.name}
          contextText={aiContext}
          chapterTitle={active.title}
          onInsertChapter={insertAIText}
          onInsertLines={() => {}}
          onClose={() => setShowAIWriter(false)}
        />
      )}
      {/* Chapter sidebar — hidden in focus mode */}
      {!focusMode && (
        <div className="w-48 bg-gray-900 text-gray-300 flex flex-col p-3 shrink-0">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Chapters
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {chapters.map((ch, idx) => (
              <div key={ch.id} className="group relative flex items-center gap-0.5">
                {/* Move buttons */}
                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => moveChapter(ch.id, -1)}
                    disabled={idx === 0}
                    className="text-gray-600 hover:text-gray-300 disabled:opacity-0 text-xs leading-none px-0.5"
                  >▲</button>
                  <button
                    onClick={() => moveChapter(ch.id, 1)}
                    disabled={idx === chapters.length - 1}
                    className="text-gray-600 hover:text-gray-300 disabled:opacity-0 text-xs leading-none px-0.5"
                  >▼</button>
                </div>
                {editingTitle === ch.id ? (
                  <input
                    autoFocus
                    defaultValue={ch.title}
                    onBlur={(e) => renameChapter(ch.id, e.target.value || ch.title)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameChapter(ch.id, e.currentTarget.value || ch.title)
                      if (e.key === 'Escape') setEditingTitle(null)
                    }}
                    className="flex-1 bg-gray-800 text-white text-sm px-2 py-1.5 rounded outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setActiveChapter(ch.id)}
                    onDoubleClick={() => setEditingTitle(ch.id)}
                    className={`flex-1 text-left text-sm px-2 py-2 rounded truncate transition-colors ${
                      activeChapter === ch.id
                        ? 'bg-opossum-600 text-white'
                        : 'hover:bg-gray-800 text-gray-400'
                    }`}
                    title={`${ch.title} (double-click to rename)`}
                  >
                    {ch.title}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addChapter}
            className="mt-2 text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded border border-dashed border-gray-700 transition-colors"
          >
            + Add Chapter
          </button>
          <button
            onClick={() => setShowAIWriter(true)}
            className="mt-1 text-xs px-2 py-1.5 rounded border border-dashed border-opossum-600 text-opossum-400 hover:text-opossum-300 hover:border-opossum-400 transition-colors flex items-center gap-1"
          >
            ✦ Write with AI
          </button>
          <button
            onClick={() => setManuscriptView((v) => !v)}
            className={`mt-1 text-xs px-2 py-1.5 rounded border transition-colors ${manuscriptView ? 'border-opossum-500 text-opossum-400' : 'border-dashed border-gray-700 text-gray-500 hover:text-gray-300'}`}
          >
            {manuscriptView ? '← Chapter view' : '⊞ Manuscript'}
          </button>
        </div>
      )}

      {/* Writing area */}
      <div className={`flex-1 overflow-auto bg-gray-100 py-8 pb-8 ${focusMode ? 'px-0' : ''}`}>
        {manuscriptView ? (
          // ── Manuscript view: all chapters in one scroll ───────────────
          <div className="bg-white shadow-lg mx-auto" style={{ width: '8.5in', minHeight: '11in', padding: '1in' }}>
            {chapters.map((ch, idx) => (
              <div key={ch.id} style={idx > 0 ? { marginTop: '4rem' } : {}}>
                <div style={{ ...smfStyle, textAlign: 'center', marginBottom: '24px' }}>{ch.title}</div>
                <div style={{ ...smfStyle, whiteSpace: 'pre-wrap' }}>
                  {liveContents.current[ch.id] ?? ch.content}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── Single chapter view ───────────────────────────────────────
          active && (
            <div
              className="bg-white shadow-lg mx-auto"
              style={{ width: '8.5in', minHeight: '11in', padding: '1in' }}
            >
              {editingTitle === `header-${active.id}` ? (
                <input
                  autoFocus
                  defaultValue={active.title}
                  onBlur={(e) => renameChapter(active.id, e.target.value || active.title)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameChapter(active.id, e.currentTarget.value || active.title)
                    if (e.key === 'Escape') setEditingTitle(null)
                  }}
                  style={{ ...smfStyle, textAlign: 'center' }}
                  className="block w-full border-none outline-none mb-6 bg-transparent"
                />
              ) : (
                <div
                  style={{ ...smfStyle, textAlign: 'center', marginBottom: '24px', cursor: 'text' }}
                  onDoubleClick={() => setEditingTitle(`header-${active.id}`)}
                  title="Double-click to rename"
                >
                  {active.title}
                </div>
              )}

              <ChapterEditor
                key={active.id}
                chapter={active}
                isActive={true}
                onBlur={handleBlur}
                onInput={handleInput}
              />
            </div>
          )
        )}
      </div>

      {/* Status bar */}
      <div className={`fixed bottom-0 right-0 h-6 bg-white border-t border-gray-200 flex items-center px-4 gap-4 text-xs text-gray-500 ${focusMode ? 'left-0' : 'left-48'}`}>
        <span>Standard Manuscript Format</span>
        <span>·</span>
        <span>{chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}</span>
        <span>·</span>
        <span>{activeWordCount.toLocaleString()} words this chapter</span>
        <span>·</span>
        <span>{wordCount.toLocaleString()} total</span>
        {lastSavedLabel() && (
          <>
            <span>·</span>
            <span className={saveStatus === 'saving' ? 'text-gray-400 animate-pulse' : saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}>
              {lastSavedLabel()}
            </span>
          </>
        )}
        <span className="ml-auto" />
        <button
          onClick={() => setFocusMode((v) => !v)}
          className={`text-xs px-2 py-0.5 rounded transition-colors ${focusMode ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700'}`}
        >
          ◎ Focus
        </button>
      </div>
    </div>
  )
})

export default NovelEditor
