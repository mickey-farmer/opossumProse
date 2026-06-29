import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Project, ExportSettings, useProjectStore } from '../stores/projectStore'
import AIWriter from './AIWriter'

// Uncontrolled prose editor — prevents cursor-reset on re-render
function ProseEditor({ content, onBlur, onInput }: {
  content: string
  onBlur: (text: string) => void
  onInput: (text: string) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = content
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onBlur(e.currentTarget.textContent || '')}
      onInput={(e) => onInput(e.currentTarget.textContent || '')}
      style={{
        fontFamily: 'Times New Roman, Times, serif',
        fontSize: '12pt',
        lineHeight: '2',
        textAlign: 'left',
        minHeight: '8in',
        outline: 'none',
        caretColor: '#1a1a1a',
        whiteSpace: 'pre-wrap',
      }}
      data-placeholder="Begin your story..."
    />
  )
}

function buildShortStoryPdfHtml(
  title: string,
  content: string,
  projectName: string,
  settings: ExportSettings
): string {
  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  }
  const mono = `font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:2;`
  const pageNumHtml = settings.showPageNumbers
    ? `<div style="font-family:'Times New Roman',Times,serif;font-size:10pt;text-align:right;margin-bottom:.5in;">${esc(projectName)}</div>`
    : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      @page { size: letter; margin: 0; }
      body { margin: 0; padding: 0; background: white; }
    </style>
  </head><body>
    <div style="padding:1in;box-sizing:border-box;">
      ${pageNumHtml}
      <div style="${mono}font-weight:bold;font-size:14pt;text-align:center;margin-bottom:8px;">${esc(title || projectName)}</div>
      <div style="${mono}text-align:left;margin-top:48px;">${esc(content.trim())}</div>
    </div>
  </body></html>`
}

export interface ShortStoryEditorHandle {
  getPdfHtml: (settings: ExportSettings) => string
  getPlainText: () => string
  saveNow: () => Promise<void>
}

const ShortStoryEditor = React.forwardRef<ShortStoryEditorHandle, { project: Project; exportSettings: ExportSettings }>(
function ShortStoryEditor({ project, exportSettings }, ref) {
  const { updateActiveProject } = useProjectStore()
  const [content, setContent] = useState('')
  const [storyTitle, setStoryTitle] = useState(project.name)
  const [editingTitle, setEditingTitle] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [showAIWriter, setShowAIWriter] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [, setTick] = useState(0)
  const liveContent = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!project.path) return
    window.api.loadContent(project.path).then((raw) => {
      const data = raw as { content?: string; title?: string } | null
      if (data?.content !== undefined) {
        setContent(data.content)
        liveContent.current = data.content
      }
      if (data?.title) setStoryTitle(data.title)
    }).catch(() => {})
  }, [project.path])

  const doSave = useCallback(async (text: string, title: string) => {
    setSaveStatus('saving')
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length
    await window.api.saveContent(project.path, { content: text, title, wordCount })
    updateActiveProject({ wordCount })
    setLastSaved(new Date())
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [project.path, updateActiveProject])

  const scheduleSave = useCallback((text: string, title: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(text, title), 1500)
  }, [doSave])

  const handleInput = useCallback((text: string) => {
    liveContent.current = text
    scheduleSave(text, storyTitle)
  }, [scheduleSave, storyTitle])

  const handleBlur = useCallback((text: string) => {
    liveContent.current = text
    setContent(text)
    scheduleSave(text, storyTitle)
  }, [scheduleSave, storyTitle])

  function insertAIText(text: string): void {
    const existing = liveContent.current.trimEnd()
    const newContent = existing ? `${existing}\n\n${text}` : text
    liveContent.current = newContent
    setContent(newContent)
    const el = document.querySelector<HTMLElement>('.short-story-editor')
    if (el) el.textContent = newContent
    if (saveTimer.current) clearTimeout(saveTimer.current)
    doSave(newContent, storyTitle)
  }

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

  const wordCount = liveContent.current.trim().split(/\s+/).filter(Boolean).length

  React.useImperativeHandle(ref, () => ({
    getPdfHtml: (settings: ExportSettings) => buildShortStoryPdfHtml(storyTitle, liveContent.current, project.name, settings),
    getPlainText: () => `${storyTitle}\n\n${liveContent.current}`,
    saveNow: () => doSave(liveContent.current, storyTitle),
  }))

  return (
    <div className="h-full flex flex-col">
      {showAIWriter && (
        <AIWriter
          mode="novel-chapter"
          projectName={project.name}
          contextText={liveContent.current.slice(-1500)}
          onInsertChapter={insertAIText}
          onInsertLines={() => {}}
          onClose={() => setShowAIWriter(false)}
        />
      )}

      <div className="flex-1 overflow-auto bg-gray-100 py-8">
        <div
          className="bg-white shadow-lg mx-auto"
          style={{ width: '8.5in', minHeight: '11in', padding: '1in' }}
        >
          {/* Story title */}
          {editingTitle ? (
            <input
              autoFocus
              defaultValue={storyTitle}
              onBlur={(e) => {
                const t = e.target.value.trim() || storyTitle
                setStoryTitle(t)
                setEditingTitle(false)
                scheduleSave(liveContent.current, t)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
              }}
              style={{
                fontFamily: 'Times New Roman, Times, serif',
                fontSize: '14pt',
                fontWeight: 'bold',
                textAlign: 'center',
                lineHeight: '2',
                display: 'block',
                width: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                marginBottom: '24px',
              }}
            />
          ) : (
            <div
              style={{
                fontFamily: 'Times New Roman, Times, serif',
                fontSize: '14pt',
                fontWeight: 'bold',
                textAlign: 'center',
                lineHeight: '2',
                marginBottom: '24px',
                cursor: 'text',
              }}
              onDoubleClick={() => setEditingTitle(true)}
              title="Double-click to edit title"
            >
              {storyTitle}
            </div>
          )}

          <ProseEditor
            content={content}
            onBlur={handleBlur}
            onInput={handleInput}
          />
        </div>
      </div>

      {/* Status bar */}
      <div className={`fixed bottom-0 right-0 h-6 bg-white border-t border-gray-200 flex items-center px-4 gap-4 text-xs text-gray-500 left-0`}>
        <span>Short Story</span>
        <span>·</span>
        <span>{wordCount.toLocaleString()} words</span>
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
          onClick={() => setShowAIWriter(true)}
          className="text-xs px-2 py-0.5 rounded border border-dashed border-opossum-600 text-opossum-400 hover:text-opossum-300 hover:border-opossum-400 transition-colors"
        >
          ✦ Write with AI
        </button>
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

export default ShortStoryEditor
