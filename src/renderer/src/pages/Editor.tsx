import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, convertInchesToTwip } from 'docx'
import { useProjectStore, EditorTab, ExportSettings, defaultExportSettings } from '../stores/projectStore'
import ScreenplayEditor, { ScreenplayEditorHandle } from '../components/ScreenplayEditor'
import NovelEditor, { NovelEditorHandle } from '../components/NovelEditor'
import CharacterDirectory from '../components/CharacterDirectory'
import NotesPanel from '../components/NotesPanel'
import OutlinePanel from '../components/OutlinePanel'
import FindReplace from '../components/FindReplace'
import ContinuityChecker from '../components/ContinuityChecker'

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'write', label: 'Write' },
  { id: 'characters', label: 'Characters' },
  { id: 'notes', label: 'Notes' },
  { id: 'outline', label: 'Outline' },
]

interface SettingToggleProps {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}

function SettingToggle({ label, checked, onChange }: SettingToggleProps): JSX.Element {
  return (
    <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
      <div
        className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${checked ? 'bg-opossum-600' : 'bg-gray-300'}`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </div>
      <span className="text-sm text-gray-700 select-none">{label}</span>
    </label>
  )
}

export default function Editor(): JSX.Element {
  const { activeProject, activeEditorTab, setActiveEditorTab, setActiveView, setActiveProject, updateActiveProject } =
    useProjectStore()

  const screplayRef = useRef<ScreenplayEditorHandle>(null)
  const novelRef = useRef<NovelEditorHandle>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showContinuity, setShowContinuity] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [goalInput, setGoalInput] = useState('')

  if (!activeProject) {
    setActiveView('dashboard')
    return <></>
  }

  const exportSettings: ExportSettings = activeProject.exportSettings ?? defaultExportSettings(activeProject.type)
  const wordCountGoal = activeProject.wordCountGoal ?? 0

  // Cmd+F → Find & Replace
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.metaKey && e.key === 'f') {
        e.preventDefault()
        setShowFindReplace((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Init goal input from project
  useEffect(() => {
    setGoalInput(wordCountGoal > 0 ? String(wordCountGoal) : '')
  }, [activeProject.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function saveExportSettings(updates: Partial<ExportSettings>): void {
    const next = { ...exportSettings, ...updates }
    updateActiveProject({ exportSettings: next })
    window.api.updateProject(activeProject.path, { exportSettings: next as unknown as Record<string, unknown> })
  }

  function saveWordCountGoal(val: number): void {
    updateActiveProject({ wordCountGoal: val })
    window.api.updateProject(activeProject.path, { wordCountGoal: val })
  }

  function goBack(): void {
    setActiveProject(null)
    setActiveView('dashboard')
  }

  const typeLabel =
    activeProject.type === 'novel' ? 'Novel'
    : activeProject.type === 'screenplay' ? 'Screenplay'
    : 'Stage Play'

  const isScript = activeProject.type === 'screenplay' || activeProject.type === 'stageplay'

  // ── Current word count for progress bar ──────────────────────────────────────
  // We read it from the store's wordCount (updated on save) as a lightweight proxy
  const currentWordCount = activeProject.wordCount ?? 0
  const goalProgress = wordCountGoal > 0 ? Math.min(currentWordCount / wordCountGoal, 1) : 0

  // ── Script exports ────────────────────────────────────────────────────────────

  async function handleExportPdf(): Promise<void> {
    if (!screplayRef.current) return
    setExporting(true); setShowExportMenu(false)
    const html = screplayRef.current.getPdfHtml()
    await window.api.printToPdf(activeProject.name, html)
    setExporting(false)
  }

  async function handleExportFountain(): Promise<void> {
    if (!screplayRef.current) return
    setExporting(true); setShowExportMenu(false)
    const content = screplayRef.current.getFountainContent()
    await window.api.exportText(activeProject.name, content, 'fountain')
    setExporting(false)
  }

  async function handleExportScriptDocx(): Promise<void> {
    if (!screplayRef.current) return
    setExporting(true); setShowExportMenu(false)
    const scriptLines = screplayRef.current.getDocxLines()

    const paragraphs = scriptLines.map(({ element, text }) => {
      const base = {
        spacing: { after: 0 },
        style: 'Normal',
      }
      switch (element) {
        case 'scene-heading':
          return new Paragraph({ ...base, children: [new TextRun({ text: text.toUpperCase(), bold: true, font: 'Courier New', size: 24 })] })
        case 'action':
          return new Paragraph({ ...base, children: [new TextRun({ text, font: 'Courier New', size: 24 })] })
        case 'character':
          return new Paragraph({ ...base, indent: { left: convertInchesToTwip(2.2) }, children: [new TextRun({ text: text.toUpperCase(), font: 'Courier New', size: 24 })] })
        case 'parenthetical':
          return new Paragraph({ ...base, indent: { left: convertInchesToTwip(1.6) }, children: [new TextRun({ text: `(${text.replace(/^\(|\)$/g, '')})`, font: 'Courier New', size: 24 })] })
        case 'dialogue':
          return new Paragraph({ ...base, indent: { left: convertInchesToTwip(1), right: convertInchesToTwip(1.5) }, children: [new TextRun({ text, font: 'Courier New', size: 24 })] })
        case 'transition':
          return new Paragraph({ ...base, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: text.toUpperCase(), font: 'Courier New', size: 24 })] })
        default:
          return new Paragraph({ ...base, children: [new TextRun({ text, font: 'Courier New', size: 24 })] })
      }
    })

    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.5), right: convertInchesToTwip(1) } } },
        children: paragraphs,
      }],
    })

    const base64 = await Packer.toBase64String(doc)
    await window.api.saveBuffer(activeProject.name, base64, 'docx')
    setExporting(false)
  }

  // ── Novel exports ─────────────────────────────────────────────────────────────

  async function handleNovelExportPdf(): Promise<void> {
    if (!novelRef.current) return
    setExporting(true); setShowExportMenu(false)
    const html = novelRef.current.getPdfHtml(exportSettings)
    await window.api.printToPdf(activeProject.name, html)
    setExporting(false)
  }

  async function handleNovelExportText(): Promise<void> {
    if (!novelRef.current) return
    setExporting(true); setShowExportMenu(false)
    const content = novelRef.current.getPlainText()
    await window.api.exportText(activeProject.name, content, 'txt')
    setExporting(false)
  }

  async function handleNovelExportDocx(): Promise<void> {
    if (!novelRef.current) return
    setExporting(true); setShowExportMenu(false)
    const text = novelRef.current.getPlainText()

    const paragraphs: Paragraph[] = []
    for (const chunkRaw of text.split('\n\n---\n\n')) {
      const chunk = chunkRaw.trim()
      if (!chunk) continue
      const lines = chunk.split('\n\n')
      const title = lines[0]
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: title, font: 'Times New Roman', size: 24 })],
        spacing: { after: 240 },
        pageBreakBefore: paragraphs.length > 0,
      }))
      for (const line of lines.slice(1)) {
        for (const para of line.split('\n')) {
          if (para.trim()) {
            paragraphs.push(new Paragraph({
              children: [new TextRun({ text: para.trim(), font: 'Times New Roman', size: 24 })],
              spacing: { line: 480, after: 0 },
              indent: { firstLine: convertInchesToTwip(0.5) },
            }))
          }
        }
      }
    }

    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1), right: convertInchesToTwip(1) } } },
        children: paragraphs,
      }],
    })

    const base64 = await Packer.toBase64String(doc)
    await window.api.saveBuffer(activeProject.name, base64, 'docx')
    setExporting(false)
  }

  // ── Continuity checker content getter ────────────────────────────────────────

  const getContinuityContent = useCallback((): string => {
    if (isScript && screplayRef.current) return screplayRef.current.getAllText()
    if (!isScript && novelRef.current) return novelRef.current.getPlainText()
    return ''
  }, [isScript])

  // ── Settings panel ────────────────────────────────────────────────────────────

  const settingsOptions = (
    <div className="py-1">
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Export</div>
      <SettingToggle label="Page numbers" checked={exportSettings.showPageNumbers} onChange={(v) => saveExportSettings({ showPageNumbers: v })} />
      {activeProject.type === 'novel' && (
        <SettingToggle label="Table of contents" checked={exportSettings.includeTableOfContents} onChange={(v) => saveExportSettings({ includeTableOfContents: v })} />
      )}
      {isScript && (
        <>
          <SettingToggle label="Scene numbers" checked={exportSettings.showSceneNumbers} onChange={(v) => saveExportSettings({ showSceneNumbers: v })} />
          <SettingToggle label="Include title page" checked={exportSettings.includeTitlePage} onChange={(v) => saveExportSettings({ includeTitlePage: v })} />
          <SettingToggle label="Revision watermark" checked={exportSettings.showRevisionWatermark} onChange={(v) => saveExportSettings({ showRevisionWatermark: v })} />
        </>
      )}
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1 border-t border-gray-100">Goals</div>
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-sm text-gray-700 shrink-0">Word goal</span>
        <input
          type="number"
          min="0"
          placeholder="None"
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          onBlur={() => saveWordCountGoal(parseInt(goalInput) || 0)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveWordCountGoal(parseInt(goalInput) || 0) }}
          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:border-gray-500 w-24"
        />
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Word count goal progress bar */}
      {wordCountGoal > 0 && (
        <div className="h-1 bg-gray-200 shrink-0">
          <div
            className={`h-full transition-all ${goalProgress >= 1 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${goalProgress * 100}%` }}
          />
        </div>
      )}

      {/* Titlebar */}
      <div className="titlebar-drag h-12 flex items-center px-4 bg-white/80 backdrop-blur border-b border-gray-200 shrink-0">
        <div className="pl-20 flex items-center gap-3 flex-1">
          <button onClick={goBack} className="no-drag text-gray-400 hover:text-gray-700 transition-colors text-sm">
            ← Projects
          </button>
          <span className="text-gray-300">/</span>
          <span className="font-semibold text-gray-800">{activeProject.name}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{typeLabel}</span>
        </div>

        {/* Tab bar + tools */}
        <div className="no-drag flex items-center gap-1 mr-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveEditorTab(tab.id)}
              className={`text-sm px-3 py-1 rounded-lg transition-colors ${
                activeEditorTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Find & Replace */}
          <button
            onClick={() => setShowFindReplace((v) => !v)}
            title="Find & Replace (⌘F)"
            className={`text-sm px-2 py-1 rounded-lg border transition-colors ml-2 ${showFindReplace ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
          >
            ⌕
          </button>

          {/* AI Continuity */}
          <button
            onClick={() => setShowContinuity((v) => !v)}
            title="AI Continuity Check"
            className={`text-sm px-2 py-1 rounded-lg border transition-colors ${showContinuity ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
          >
            ✦
          </button>

          {/* Export */}
          <div className="relative ml-1">
            <button
              onClick={() => { setShowExportMenu((v) => !v); setShowSettings(false) }}
              disabled={exporting}
              className="text-sm px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400 transition-colors disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export ▾'}
            </button>

            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 w-56">
                  {isScript ? (
                    <>
                      <button onClick={handleExportPdf} className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-gray-100">Export PDF</button>
                      <button onClick={handleExportFountain} className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-gray-100">Export Fountain (.fountain)</button>
                      <button onClick={handleExportScriptDocx} className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">Export Word (.docx)</button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleNovelExportPdf} className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-gray-100">Export PDF</button>
                      <button onClick={handleNovelExportDocx} className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-gray-100">Export Word (.docx)</button>
                      <button onClick={handleNovelExportText} className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">Export Plain Text (.txt)</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Settings gear */}
          <div className="relative">
            <button
              onClick={() => { setShowSettings((v) => !v); setShowExportMenu(false) }}
              title="Export settings"
              className={`text-sm px-2 py-1 rounded-lg border transition-colors ${showSettings ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
            >
              ⚙
            </button>

            {showSettings && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 w-56">
                  {settingsOptions}
                </div>
              </>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={() => window.api.toggleFullscreen()}
            title="Toggle fullscreen"
            className="text-sm px-2 py-1 rounded-lg border border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
          >
            ⤢
          </button>
        </div>
      </div>

      {/* Floating panels */}
      {showFindReplace && <FindReplace onClose={() => setShowFindReplace(false)} />}
      {showContinuity && (
        <ContinuityChecker
          onClose={() => setShowContinuity(false)}
          getContent={getContinuityContent}
          projectPath={activeProject.path}
          projectType={activeProject.type}
        />
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeEditorTab === 'write' && (
          <>
            {isScript && <ScreenplayEditor ref={screplayRef} project={activeProject} exportSettings={exportSettings} />}
            {activeProject.type === 'novel' && (
              <NovelEditor ref={novelRef} project={activeProject} exportSettings={exportSettings} />
            )}
          </>
        )}
        {activeEditorTab === 'characters' && <CharacterDirectory project={activeProject} />}
        {activeEditorTab === 'notes' && <NotesPanel project={activeProject} />}
        {activeEditorTab === 'outline' && <OutlinePanel project={activeProject} />}
      </div>
    </div>
  )
}
