import React, { useEffect, useRef, useState } from 'react'

export type AIWriterMode = 'novel-chapter' | 'screenplay-scene' | 'screenplay-act'

export interface ScriptLine {
  element: 'scene-heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition'
  text: string
}

interface Props {
  mode: AIWriterMode
  projectName: string
  contextText: string   // recent surrounding content for continuity
  chapterTitle?: string // novel only — used in prompt placeholder
  onInsertChapter: (text: string) => void
  onInsertLines: (lines: ScriptLine[]) => void
  onClose: () => void
}

function parseScriptLines(raw: string): ScriptLine[] {
  const lines: ScriptLine[] = []
  for (const raw_line of raw.split('\n')) {
    const line = raw_line.trim()
    if (!line) continue
    if (line.startsWith('SCENE:')) {
      lines.push({ element: 'scene-heading', text: line.slice(6).trim() })
    } else if (line.startsWith('ACTION:')) {
      lines.push({ element: 'action', text: line.slice(7).trim() })
    } else if (line.startsWith('CHARACTER:')) {
      lines.push({ element: 'character', text: line.slice(10).trim() })
    } else if (line.startsWith('DIALOGUE:')) {
      lines.push({ element: 'dialogue', text: line.slice(9).trim() })
    } else if (line.startsWith('PARENTHETICAL:')) {
      lines.push({ element: 'parenthetical', text: line.slice(14).trim() })
    } else if (line.startsWith('TRANSITION:')) {
      lines.push({ element: 'transition', text: line.slice(11).trim() })
    } else if (lines.length > 0) {
      // continuation — append to previous action line
      const last = lines[lines.length - 1]
      if (last.element === 'action') last.text += ' ' + line
    }
  }
  return lines
}

const PLACEHOLDERS: Record<AIWriterMode, string> = {
  'novel-chapter': 'Describe what happens in this chapter — setting, conflict, what changes for the characters...',
  'screenplay-scene': 'Describe the scene — where are we, who\'s there, what happens, what\'s the tension or turn...',
  'screenplay-act': 'Describe the act — the major beats, character arcs, how it opens and closes, the central conflict...',
}

const TITLES: Record<AIWriterMode, string> = {
  'novel-chapter': 'Write Chapter with AI',
  'screenplay-scene': 'Write Scene with AI',
  'screenplay-act': 'Write Act with AI',
}

const isScript = (mode: AIWriterMode) => mode !== 'novel-chapter'

export default function AIWriter({ mode, projectName, contextText, chapterTitle, onInsertChapter, onInsertLines, onClose }: Props): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useContext, setUseContext] = useState(true)
  const previewRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Auto-scroll preview as text streams in
  useEffect(() => {
    if (previewRef.current && generating) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight
    }
  }, [previewText, generating])

  // Cleanup chunk listener on unmount
  useEffect(() => () => { cleanupRef.current?.() }, [])

  async function generate(): Promise<void> {
    if (!prompt.trim()) return
    setPreviewText('')
    setDone(false)
    setError(null)
    setGenerating(true)

    cleanupRef.current?.()
    cleanupRef.current = window.api.onGeminiChunk((text) => {
      setPreviewText(text)
    })

    try {
      const ctx = useContext ? contextText : ''
      const apiMode = isScript(mode) ? 'screenplay' : 'novel'
      const finalText = await window.api.geminiWrite(prompt.trim(), ctx, apiMode)
      cleanupRef.current?.()
      cleanupRef.current = null
      setPreviewText(finalText || '')
      if (!finalText) {
        setError('No content returned. Check your API key or try again.')
      } else {
        setDone(true)
      }
    } catch (err) {
      cleanupRef.current?.()
      cleanupRef.current = null
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function handleInsert(): void {
    if (!previewText.trim()) return
    if (isScript(mode)) {
      onInsertLines(parseScriptLines(previewText))
    } else {
      onInsertChapter(previewText)
    }
    onClose()
  }

  function handleRegenerate(): void {
    setDone(false)
    generate()
  }

  const scriptPreview = isScript(mode) && previewText
    ? parseScriptLines(previewText)
    : []

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-8" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '680px', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">{TITLES[mode]}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{projectName} · Powered by Gemini</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        {/* Prompt area */}
        <div className="px-6 pt-4 pb-3 shrink-0 space-y-3">
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
            placeholder={chapterTitle ? `What happens in "${chapterTitle}"? ${PLACEHOLDERS[mode]}` : PLACEHOLDERS[mode]}
            rows={3}
            className="w-full text-sm border border-gray-300 rounded-xl px-3 py-2.5 outline-none focus:border-gray-500 resize-none"
            disabled={generating}
          />

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                className={`w-8 h-4 rounded-full relative transition-colors ${useContext ? 'bg-opossum-600' : 'bg-gray-300'}`}
                onClick={() => !generating && setUseContext((v) => !v)}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${useContext ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-gray-600">Use surrounding context for continuity</span>
            </label>

            <button
              onClick={generate}
              disabled={generating || !prompt.trim()}
              className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {generating ? (
                <><span className="animate-spin inline-block">⟳</span> Writing…</>
              ) : done || error ? (
                '↺ Regenerate'
              ) : (
                '✦ Generate'
              )}
            </button>
          </div>
        </div>

        {/* Preview */}
        {(generating || previewText) && (
          <div className="flex-1 overflow-hidden flex flex-col border-t border-gray-100 min-h-0">
            <div className="px-6 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {generating ? 'Writing…' : 'Preview — review before inserting'}
              </span>
              {generating && <span className="text-xs text-gray-400 animate-pulse">Streaming from Gemini</span>}
            </div>

            <div ref={previewRef} className="flex-1 overflow-y-auto px-6 py-4">
              {isScript(mode) ? (
                // Formatted screenplay preview
                <div style={{ fontFamily: 'Courier New, Courier, monospace', fontSize: '11pt', lineHeight: '1.5' }}>
                  {(generating && scriptPreview.length === 0 ? (
                    <div className="text-gray-400 animate-pulse">Generating…</div>
                  ) : scriptPreview).map((line, i) => {
                    if (typeof line === 'string') return null
                    switch (line.element) {
                      case 'scene-heading':
                        return <div key={i} style={{ fontWeight: 'bold', textTransform: 'uppercase', marginTop: '16px' }}>{line.text}</div>
                      case 'action':
                        return <div key={i} style={{ marginTop: '8px' }}>{line.text}</div>
                      case 'character':
                        return <div key={i} style={{ textTransform: 'uppercase', marginLeft: '2.2in', marginTop: '8px' }}>{line.text}</div>
                      case 'parenthetical':
                        return <div key={i} style={{ marginLeft: '1.6in' }}>({line.text.replace(/^\(|\)$/g, '')})</div>
                      case 'dialogue':
                        return <div key={i} style={{ marginLeft: '1in', marginRight: '1.5in' }}>{line.text}</div>
                      case 'transition':
                        return <div key={i} style={{ textTransform: 'uppercase', textAlign: 'right', marginTop: '8px' }}>{line.text}</div>
                    }
                  })}
                </div>
              ) : (
                // Prose preview
                <div
                  style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12pt', lineHeight: '2', whiteSpace: 'pre-wrap' }}
                  className={generating ? 'text-gray-700' : ''}
                >
                  {previewText || <span className="text-gray-400 animate-pulse">Generating…</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="shrink-0 px-6 py-3 bg-red-50 border-t border-red-100 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-xs text-gray-400">
            {done && !isScript(mode) && `~${previewText.trim().split(/\s+/).filter(Boolean).length} words`}
            {done && isScript(mode) && `${scriptPreview.length} elements`}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            {done && (
              <button
                onClick={handleRegenerate}
                className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ↺ Try again
              </button>
            )}
            <button
              onClick={handleInsert}
              disabled={!done || !previewText.trim()}
              className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              {isScript(mode) ? `Insert ${scriptPreview.length} elements` : 'Insert into chapter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
