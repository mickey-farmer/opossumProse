import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Project, TitlePage, REVISION_COLORS, ExportSettings } from '../stores/projectStore'
import { useProjectStore } from '../stores/projectStore'
import AIWriter, { AIWriterMode, ScriptLine } from './AIWriter'

export interface ScreenplayEditorHandle {
  getFountainContent: () => string
  getPdfHtml: () => string
  getDocxLines: () => { element: string; text: string }[]
  getAllText: () => string
  openAIWriter: (mode: AIWriterMode) => void
  saveNow: () => Promise<void>
}

type ScreenplayElement =
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'

const ELEMENT_LABELS: Record<ScreenplayElement, string> = {
  'scene-heading': 'SCENE HEADING',
  action: 'ACTION',
  character: 'CHARACTER',
  parenthetical: 'PARENTHETICAL',
  dialogue: 'DIALOGUE',
  transition: 'TRANSITION'
}

const TAB_CYCLE: Record<ScreenplayElement, ScreenplayElement> = {
  'scene-heading': 'action',
  action: 'character',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'character',
  transition: 'scene-heading'
}

const ENTER_NEXT: Record<ScreenplayElement, ScreenplayElement> = {
  'scene-heading': 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'character',
  transition: 'scene-heading'
}

interface LineData {
  id: string
  element: ScreenplayElement
  text: string
}

interface DropdownState {
  lineId: string
  matches: string[]
  selectedIdx: number
}

interface CharRecord {
  id: string
  name: string
  [key: string]: string
}

function getElementStyle(el: ScreenplayElement): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: 'Courier New, Courier, monospace',
    fontSize: '12pt',
    lineHeight: '1.5',
    maxWidth: '6in',
    margin: '0 auto',
    padding: '0 0 4px 0'
  }
  switch (el) {
    case 'scene-heading':
      return { ...base, textTransform: 'uppercase', fontWeight: 'bold', marginTop: '24px' }
    case 'action':
      return { ...base, marginTop: '12px' }
    case 'character':
      return { ...base, textTransform: 'uppercase', marginLeft: '2.2in', marginTop: '12px' }
    case 'parenthetical':
      return { ...base, marginLeft: '1.6in', width: '2in', marginTop: '0' }
    case 'dialogue':
      return { ...base, marginLeft: '1in', marginRight: '1.5in', marginTop: '0' }
    case 'transition':
      return { ...base, textTransform: 'uppercase', textAlign: 'right', marginTop: '12px', marginBottom: '12px' }
  }
}

function getPlaceholder(el: ScreenplayElement, isStagePlay: boolean, isTV: boolean): string {
  if (isStagePlay) {
    return ({
      'scene-heading': 'ACT ONE',
      action: 'Stage direction...',
      character: 'CHARACTER NAME',
      parenthetical: '(quietly)',
      dialogue: 'Dialogue...',
      transition: 'BLACKOUT.'
    } as Record<ScreenplayElement, string>)[el]
  }
  if (isTV) {
    return ({
      'scene-heading': 'INT. LOCATION - DAY',
      action: 'Action description...',
      character: 'CHARACTER NAME',
      parenthetical: '(quietly)',
      dialogue: 'Dialogue...',
      transition: 'CUT TO:'
    } as Record<ScreenplayElement, string>)[el]
  }
  return ({
    'scene-heading': 'INT. LOCATION - DAY',
    action: 'Action description...',
    character: 'CHARACTER NAME',
    parenthetical: '(quietly)',
    dialogue: 'Dialogue...',
    transition: 'CUT TO:'
  } as Record<ScreenplayElement, string>)[el]
}

// ─── Title Page (rendered, print-friendly) ────────────────────────────────────

function TitlePageView({
  titlePage,
  projectName,
  bgHex,
  isTV
}: {
  titlePage: TitlePage
  projectName: string
  bgHex: string
  isTV?: boolean
}): JSX.Element {
  const mono: React.CSSProperties = { fontFamily: 'Courier New, Courier, monospace', fontSize: '12pt' }
  return (
    <div
      id="screenplay-title-page"
      className="bg-white shadow-lg mx-auto relative"
      style={{ width: '8.5in', minHeight: '11in', padding: '1in', backgroundColor: bgHex }}
    >
      {/* Centered title block — roughly 1/3 down */}
      <div className="absolute left-0 right-0" style={{ top: '3.5in', textAlign: 'center' }}>
        {isTV && titlePage.seriesTitle && (
          <div style={{ ...mono, fontSize: '11pt', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>
            {titlePage.seriesTitle}
          </div>
        )}
        <div style={{ ...mono, fontWeight: 'bold', textTransform: 'uppercase', fontSize: '14pt' }}>
          {isTV ? (titlePage.episodeTitle || titlePage.title || projectName) : (titlePage.title || projectName)}
        </div>
        {isTV && titlePage.episodeNumber && (
          <div style={{ ...mono, marginTop: '8px', color: '#555' }}>
            Episode {titlePage.episodeNumber}
          </div>
        )}
        {titlePage.subtitle && (
          <div style={{ ...mono, marginTop: '24px' }}>{titlePage.subtitle}</div>
        )}
        {isTV && titlePage.draftDate && (
          <div style={{ ...mono, marginTop: '8px', color: '#555', fontSize: '11pt' }}>{titlePage.draftDate}</div>
        )}
      </div>

      {/* Bottom-left contact block */}
      <div className="absolute" style={{ bottom: '1in', left: '1in', textAlign: 'left' }}>
        {titlePage.authorName && (
          <div style={mono}>{titlePage.authorName}</div>
        )}
        {titlePage.contact && (
          <div style={{ ...mono, whiteSpace: 'pre-line', color: '#555', fontSize: '11pt' }}>
            {titlePage.contact}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Title Page Editor (sidebar panel) ───────────────────────────────────────

function TitlePageEditor({
  titlePage,
  projectName,
  onSave,
  isTV
}: {
  titlePage: TitlePage
  projectName: string
  onSave: (tp: TitlePage) => void
  isTV?: boolean
}): JSX.Element {
  const [draft, setDraft] = useState<TitlePage>(titlePage)

  function field(key: keyof TitlePage): object {
    return {
      value: draft[key] ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft((p) => ({ ...p, [key]: e.target.value }))
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Title Page</div>
      {isTV && (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Series title</label>
            <input
              {...field('seriesTitle')}
              placeholder="My Great Show"
              className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Episode title</label>
            <input
              {...field('episodeTitle')}
              placeholder="Pilot"
              className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Episode number</label>
            <input
              {...field('episodeNumber')}
              placeholder="101"
              className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Draft date</label>
            <input
              {...field('draftDate')}
              placeholder="First Draft — January 2025"
              className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-gray-600"
            />
          </div>
        </>
      )}
      {!isTV && (
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Title</label>
          <input
            {...field('title')}
            placeholder={projectName}
            className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-gray-600"
          />
        </div>
      )}
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Credit line</label>
        <input
          {...field('subtitle')}
          placeholder="Written by…"
          className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-gray-600"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Author name</label>
        <input
          {...field('authorName')}
          className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-gray-600"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Contact</label>
        <textarea
          {...field('contact')}
          rows={2}
          className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-gray-600 resize-none"
        />
      </div>
      <button
        onClick={() => onSave(draft)}
        className="w-full text-xs bg-opossum-600 hover:bg-opossum-700 text-white py-1.5 rounded transition-colors"
      >
        Save Title Page
      </button>
    </div>
  )
}

// ─── LineEditor ────────────────────────────────────────────────────────────────

interface LineEditorProps {
  lineId: string
  initialText: string
  element: ScreenplayElement
  isActive: boolean
  isStagePlay: boolean
  isTV: boolean
  showContd: boolean
  sceneNumber?: number
  onFocus: (id: string, element: ScreenplayElement) => void
  onBlur: (id: string, text: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, lineId: string) => void
  onInput: (id: string, text: string) => void
}

const LineEditor = React.memo(
  function LineEditor({ lineId, initialText, element, isActive, isStagePlay, isTV, showContd, sceneNumber, onFocus, onBlur, onKeyDown, onInput }: LineEditorProps) {
    const ref = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
      if (ref.current) ref.current.textContent = initialText
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (!isActive || !ref.current) return
      if (document.activeElement === ref.current) return
      const el = ref.current
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }, [isActive])

    return (
      <div style={getElementStyle(element)}>
        <div className={showContd ? 'flex items-baseline' : undefined} style={{ position: 'relative' }}>
          {sceneNumber !== undefined && (
            <span
              className="pointer-events-none select-none absolute"
              style={{
                fontFamily: 'Courier New, Courier, monospace',
                fontSize: '12pt',
                lineHeight: '1.5',
                left: '-2rem',
                color: '#9ca3af',
                userSelect: 'none',
              }}
            >
              {sceneNumber}.
            </span>
          )}
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            data-line-id={lineId}
            data-placeholder={getPlaceholder(element, isStagePlay, isTV)}
            className={`outline-none min-h-[1.5em] rounded-sm transition-colors ${isActive ? 'bg-blue-50/50' : ''}`}
            onFocus={() => onFocus(lineId, element)}
            onBlur={(e) => onBlur(lineId, e.currentTarget.textContent || '')}
            onKeyDown={(e) => onKeyDown(e, lineId)}
            onInput={(e) => onInput(lineId, e.currentTarget.textContent || '')}
          />
          {showContd && (
            <span
              className="pointer-events-none select-none"
              style={{ fontFamily: 'Courier New, Courier, monospace', fontSize: '12pt', lineHeight: '1.5' }}
            >
              &nbsp;(CONT'D)
            </span>
          )}
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.lineId === next.lineId &&
    prev.element === next.element &&
    prev.isActive === next.isActive &&
    prev.showContd === next.showContd &&
    prev.sceneNumber === next.sceneNumber
)

// ─── Navigator ─────────────────────────────────────────────────────────────────

const TV_ACT_MARKERS = ['COLD OPEN', 'TEASER', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'ACT FOUR', 'ACT FIVE', 'TAG', 'EPILOGUE', 'CODA']

function isActMarker(text: string): boolean {
  const up = text.trim().toUpperCase()
  return TV_ACT_MARKERS.some((m) => up === m || up.startsWith(m + ' ') || up.startsWith('ACT '))
}

function Navigator({ lines, activeLine, onNavigate, isStagePlay, isTV }: {
  lines: LineData[]
  activeLine: string
  onNavigate: (id: string) => void
  isStagePlay: boolean
  isTV: boolean
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const headings = lines.filter((l) => l.element === 'scene-heading' && l.text.trim())

  if (headings.length === 0) {
    return <div className="text-xs text-gray-600 italic px-1">No headings yet</div>
  }

  if (isTV) {
    // Group scenes under act-level markers (COLD OPEN, ACT ONE, etc.)
    const groups: { act: LineData; scenes: LineData[] }[] = []
    for (const h of headings) {
      if (isActMarker(h.text) || groups.length === 0) {
        groups.push({ act: h, scenes: [] })
      } else {
        groups[groups.length - 1].scenes.push(h)
      }
    }
    return (
      <div className="space-y-0.5">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.act.id]
          return (
            <div key={g.act.id}>
              <div className="flex items-center">
                <button onClick={() => setCollapsed((c) => ({ ...c, [g.act.id]: !isCollapsed }))} className="w-4 text-gray-600 hover:text-gray-300 text-xs shrink-0">
                  {g.scenes.length > 0 ? (isCollapsed ? '▸' : '▾') : ' '}
                </button>
                <button
                  onClick={() => onNavigate(g.act.id)}
                  className={`flex-1 text-left text-xs px-1 py-1 rounded truncate transition-colors font-medium ${activeLine === g.act.id ? 'bg-gray-700 text-white' : 'text-gray-300 hover:text-gray-100 hover:bg-gray-800'}`}
                >
                  {g.act.text}
                </button>
              </div>
              {!isCollapsed && g.scenes.map((s) => (
                <button key={s.id} onClick={() => onNavigate(s.id)} className={`block w-full text-left text-xs pl-5 pr-2 py-0.5 rounded truncate transition-colors ${activeLine === s.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
                  {s.text}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  if (isStagePlay) {
    const groups: { act: LineData; scenes: LineData[] }[] = []
    for (const h of headings) {
      if (h.text.trim().toUpperCase().startsWith('ACT') || groups.length === 0) {
        groups.push({ act: h, scenes: [] })
      } else {
        groups[groups.length - 1].scenes.push(h)
      }
    }
    return (
      <div className="space-y-0.5">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.act.id]
          return (
            <div key={g.act.id}>
              <div className="flex items-center">
                <button onClick={() => setCollapsed((c) => ({ ...c, [g.act.id]: !isCollapsed }))} className="w-4 text-gray-600 hover:text-gray-300 text-xs shrink-0">
                  {g.scenes.length > 0 ? (isCollapsed ? '▸' : '▾') : ' '}
                </button>
                <button
                  onClick={() => onNavigate(g.act.id)}
                  className={`flex-1 text-left text-xs px-1 py-1 rounded truncate transition-colors ${activeLine === g.act.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                >
                  {g.act.text}
                </button>
              </div>
              {!isCollapsed && g.scenes.map((s) => (
                <button key={s.id} onClick={() => onNavigate(s.id)} className={`block w-full text-left text-xs pl-5 pr-2 py-0.5 rounded truncate transition-colors ${activeLine === s.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
                  {s.text}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {headings.map((h, idx) => (
        <button key={h.id} onClick={() => onNavigate(h.id)} title={h.text}
          className={`text-left w-full text-xs px-2 py-1 rounded truncate transition-colors ${activeLine === h.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
        >
          <span className="text-gray-700 mr-1">{idx + 1}.</span>
          {h.text}
        </button>
      ))}
    </div>
  )
}

// ─── ScreenplayEditor ──────────────────────────────────────────────────────────

const ScreenplayEditor = forwardRef<ScreenplayEditorHandle, { project: Project; exportSettings: ExportSettings }>(
function ScreenplayEditor({ project, exportSettings }, ref) {
  const isStagePlay = project.type === 'stageplay'
  const isTV = project.type === 'tv'
  const { updateActiveProject } = useProjectStore()

  const [lines, setLines] = useState<LineData[]>([
    { id: '1', element: 'scene-heading', text: isStagePlay ? 'ACT ONE' : isTV ? 'COLD OPEN' : 'INT. LOCATION - DAY' }
  ])
  const [activeLine, setActiveLine] = useState('1')
  const [activeElement, setActiveElement] = useState<ScreenplayElement>('scene-heading')
  const [loaded, setLoaded] = useState(false)
  const [charNames, setCharNames] = useState<string[]>([])
  const [dropdownState, setDropdownState] = useState<DropdownState | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const [showTitlePage, setShowTitlePage] = useState(false)
  const [showTitleEditor, setShowTitleEditor] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [aiWriterMode, setAiWriterMode] = useState<AIWriterMode | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [, setTick] = useState(0)

  const titlePage: TitlePage = project.titlePage ?? { title: project.name, subtitle: '', authorName: '', contact: '' }
  const revisionColor = REVISION_COLORS.find((c) => c.value === (project.revisionColor ?? 'white')) ?? REVISION_COLORS[0]

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const linesRef = useRef(lines)
  linesRef.current = lines
  const liveTexts = useRef<Record<string, string>>({ '1': isStagePlay ? 'ACT ONE' : isTV ? 'COLD OPEN' : 'INT. LOCATION - DAY' })
  const charNamesRef = useRef<string[]>([])
  charNamesRef.current = charNames
  const dropdownStateRef = useRef(dropdownState)
  dropdownStateRef.current = dropdownState

  // Load content + characters
  useEffect(() => {
    if (!project.path || loaded) return
    Promise.all([
      window.api.loadContent(project.path).catch(() => null),
      window.api.loadCharacters(project.path).catch(() => [])
    ]).then(([contentRaw, charsRaw]) => {
      const data = contentRaw as { lines?: LineData[] } | null
      if (data?.lines?.length) {
        setLines(data.lines)
        data.lines.forEach((l) => { liveTexts.current[l.id] = l.text })
        setActiveLine(data.lines[0].id)
        setActiveElement(data.lines[0].element)
      }
      const chars = (charsRaw as CharRecord[]) || []
      const names = chars.map((c) => c.name.trim().toUpperCase()).filter(Boolean)
      setCharNames(names)
      setLoaded(true)
    })
  }, [project.path]) // eslint-disable-line react-hooks/exhaustive-deps

  // Position dropdown
  const dropdownLineId = dropdownState?.lineId ?? null
  useEffect(() => {
    if (!dropdownLineId) { setDropdownPos(null); return }
    const el = document.querySelector(`[data-line-id="${dropdownLineId}"]`)
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left })
  }, [dropdownLineId])

  // Tick every 30s so "X min ago" stays current
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const doSave = useCallback(async (updatedLines: LineData[]) => {
    setSaveStatus('saving')
    const wordCount = updatedLines
      .map((l) => (liveTexts.current[l.id] ?? l.text).trim().split(/\s+/).filter(Boolean).length)
      .reduce((a, b) => a + b, 0)
    await window.api.saveContent(project.path, { lines: updatedLines, wordCount })
    setLastSaved(new Date())
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [project.path])

  // Debounced save
  const scheduleSave = useCallback((updatedLines: LineData[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(updatedLines), 1500)
  }, [doSave])

  // CONT'D calculation
  const contdLineIds = useMemo(() => {
    const set = new Set<string>()
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].element !== 'character') continue
      const currName = lines[i].text.trim().toUpperCase()
      if (!currName) continue
      for (let j = i - 1; j >= 0; j--) {
        const prevEl = lines[j].element
        if (prevEl === 'character') {
          if (lines[j].text.trim().toUpperCase() === currName) set.add(lines[i].id)
          break
        }
        if (prevEl !== 'dialogue' && prevEl !== 'parenthetical') break
      }
    }
    return set
  }, [lines])

  // Scene number map: lineId → 1-based number (only for scene-headings)
  const sceneNumbers = useMemo(() => {
    const map: Record<string, number> = {}
    let n = 0
    for (const line of lines) {
      if (line.element === 'scene-heading') map[line.id] = ++n
    }
    return map
  }, [lines])

  // Add character to Characters panel
  const addCharacterName = useCallback((name: string) => {
    const next = [...charNamesRef.current, name]
    charNamesRef.current = next
    setCharNames(next)
    window.api.loadCharacters(project.path).then((existing) => {
      const chars = [...((existing as CharRecord[]) || [])]
      if (!chars.find((c) => c.name.trim().toUpperCase() === name)) {
        chars.push({ id: crypto.randomUUID(), name, role: '', age: '', appearance: '', personality: '', backstory: '', notes: '' })
        window.api.saveCharacters(project.path, chars)
      }
    })
  }, [project.path])

  const applyCharacterSelection = useCallback((lineId: string, name: string) => {
    const el = document.querySelector(`[data-line-id="${lineId}"]`) as HTMLElement
    if (el) el.textContent = name
    liveTexts.current[lineId] = name
    setDropdownState(null)
  }, [])

  const handleFocus = useCallback((id: string, element: ScreenplayElement) => {
    setActiveLine(id)
    setActiveElement(element)
    if (element === 'character' && charNamesRef.current.length > 0) {
      const currentText = (liveTexts.current[id] ?? '').toUpperCase()
      const matches = currentText
        ? charNamesRef.current.filter((n) => n.startsWith(currentText))
        : [...charNamesRef.current]
      setDropdownState(matches.length > 0 ? { lineId: id, matches, selectedIdx: -1 } : null)
    } else {
      setDropdownState(null)
    }
  }, [])

  const handleBlur = useCallback((id: string, text: string) => {
    liveTexts.current[id] = text
    setDropdownState(null)
    setLines((prev) => {
      const updated = prev.map((l) => (l.id === id ? { ...l, text } : l))
      scheduleSave(updated)
      return updated
    })
    const line = linesRef.current.find((l) => l.id === id)
    if (line?.element === 'character' && text.trim()) {
      const name = text.trim().toUpperCase()
      if (!charNamesRef.current.includes(name)) addCharacterName(name)
    }
  }, [scheduleSave, addCharacterName])

  const handleInput = useCallback((id: string, text: string) => {
    liveTexts.current[id] = text
    const line = linesRef.current.find((l) => l.id === id)
    if (line?.element === 'character') {
      const query = text.toUpperCase()
      const matches = charNamesRef.current.filter(
        (n) => query === '' || (n.startsWith(query) && n !== query)
      )
      setDropdownState(matches.length > 0 ? { lineId: id, matches, selectedIdx: -1 } : null)
    } else if (dropdownStateRef.current) {
      setDropdownState(null)
    }
  }, [])

  const addLine = useCallback((afterId: string, element: ScreenplayElement) => {
    const newId = `${Date.now()}`
    liveTexts.current[newId] = ''
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === afterId)
      const next = [...prev]
      next.splice(idx + 1, 0, { id: newId, element, text: '' })
      scheduleSave(next)
      return next
    })
    setActiveLine(newId)
    setActiveElement(element)
  }, [scheduleSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, lineId: string) => {
      const ds = dropdownStateRef.current
      if (ds && ds.lineId === lineId) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setDropdownState((prev) => prev ? { ...prev, selectedIdx: Math.min(prev.selectedIdx + 1, prev.matches.length - 1) } : null)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setDropdownState((prev) => prev ? { ...prev, selectedIdx: Math.max(prev.selectedIdx - 1, -1) } : null)
          return
        }
        if (e.key === 'Escape') { setDropdownState(null); return }
        if (e.key === 'Enter' && ds.selectedIdx >= 0) {
          e.preventDefault()
          applyCharacterSelection(lineId, ds.matches[ds.selectedIdx])
          addLine(lineId, 'dialogue')
          return
        }
        if (e.key === 'Tab') setDropdownState(null)
      }

      const currentLines = linesRef.current
      const line = currentLines.find((l) => l.id === lineId)
      if (!line) return
      const idx = currentLines.findIndex((l) => l.id === lineId)

      // Smart quotes
      if (e.key === '"' || e.key === "'") {
        e.preventDefault()
        const sel = window.getSelection()
        const before = sel?.anchorNode?.textContent?.slice(0, sel.anchorOffset) ?? ''
        const isOpen = before.length === 0 || /[\s(—]$/.test(before)
        const char = e.key === '"'
          ? (isOpen ? '“' : '”')
          : (isOpen ? '‘' : '’')
        document.execCommand('insertText', false, char)
        return
      }

      if (e.key === 'Backspace') {
        const currentText = (e.currentTarget as HTMLDivElement).textContent || ''
        // Only intercept when caret is at position 0 of an empty line
        const sel = window.getSelection()
        const atStart = sel && sel.anchorOffset === 0 && sel.focusOffset === 0
        if (currentText === '' || atStart) {
          // Don't delete the very first line
          if (idx === 0) { e.preventDefault(); return }
          e.preventDefault()
          const prevLine = currentLines[idx - 1]
          setLines((prev) => {
            const next = prev.filter((l) => l.id !== lineId)
            scheduleSave(next)
            return next
          })
          delete liveTexts.current[lineId]
          setActiveLine(prevLine.id)
          setActiveElement(prevLine.element)
        }
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        const next = TAB_CYCLE[line.element]
        setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, element: next } : l)))
        setActiveElement(next)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        liveTexts.current[lineId] = (e.currentTarget as HTMLDivElement).textContent || ''
        addLine(lineId, ENTER_NEXT[line.element])
      } else if (e.key === 'ArrowUp' && idx > 0) {
        e.preventDefault()
        const prev = currentLines[idx - 1]
        setActiveLine(prev.id)
        setActiveElement(prev.element)
      } else if (e.key === 'ArrowDown' && idx < currentLines.length - 1) {
        e.preventDefault()
        const next = currentLines[idx + 1]
        setActiveLine(next.id)
        setActiveElement(next.element)
      }
    },
    [addLine, applyCharacterSelection, scheduleSave]
  )

  const navigateToLine = useCallback((id: string) => {
    const line = linesRef.current.find((l) => l.id === id)
    if (line) { setActiveLine(id); setActiveElement(line.element) }
    const el = document.querySelector(`[data-line-id="${id}"]`) as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const setLineElement = useCallback((lineId: string, element: ScreenplayElement) => {
    setLines((prev) => {
      const updated = prev.map((l) => (l.id === lineId ? { ...l, element } : l))
      scheduleSave(updated)
      return updated
    })
    setActiveElement(element)
  }, [scheduleSave])

  // Insert AI-generated screenplay lines after the current active line
  function insertAILines(newLines: ScriptLine[]): void {
    if (newLines.length === 0) return
    const insertAfterIdx = linesRef.current.findIndex((l) => l.id === activeLine)
    const insertAt = insertAfterIdx >= 0 ? insertAfterIdx + 1 : linesRef.current.length

    setLines((prev) => {
      const builtLines = newLines.map((l) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        liveTexts.current[id] = l.text
        return { id, element: l.element, text: l.text }
      })
      const next = [...prev]
      next.splice(insertAt, 0, ...builtLines)
      // Save immediately — don't debounce AI inserts
      if (saveTimer.current) clearTimeout(saveTimer.current)
      doSave(next)
      const lastId = builtLines[builtLines.length - 1].id
      setActiveLine(lastId)
      setActiveElement(builtLines[builtLines.length - 1].element)
      return next
    })
  }

  // Save title page back to project.json
  function saveTitlePage(tp: TitlePage): void {
    updateActiveProject({ titlePage: tp })
    window.api.updateProject(project.path, { titlePage: tp })
    setShowTitleEditor(false)
  }

  // Set revision color
  function setRevisionColor(value: string): void {
    updateActiveProject({ revisionColor: value })
    window.api.updateProject(project.path, { revisionColor: value })
  }

  // Build Fountain text with revision label in the title block
  function linesToFountain(): string {
    const tp = titlePage
    const revLabel = revisionColor.label.toUpperCase()
    let out = ''
    out += `Title: ${tp.title || project.name}\n`
    if (tp.subtitle) out += `Credit: ${tp.subtitle}\n`
    if (tp.authorName) out += `Author: ${tp.authorName}\n`
    out += `Revision: ${revLabel}\n`
    if (tp.contact) out += `Contact: ${tp.contact.replace(/\n/g, ' | ')}\n`
    out += '\n'

    let fSn = 0
    for (const line of linesRef.current) {
      const text = (liveTexts.current[line.id] ?? line.text).trim()
      if (!text) { out += '\n'; continue }
      switch (line.element) {
        case 'scene-heading': {
          fSn++
          const scenePrefix = exportSettings.showSceneNumbers ? `${fSn}. ` : ''
          out += `\n${scenePrefix}${text.toUpperCase()}\n\n`; break
        }
        case 'action':
          out += `\n${text}\n`; break
        case 'character':
          out += `\n${text.toUpperCase()}\n`; break
        case 'parenthetical':
          out += `(${text.replace(/^\(|\)$/g, '')})\n`; break
        case 'dialogue':
          out += `${text}\n`; break
        case 'transition':
          out += `\n> ${text.toUpperCase()}\n\n`; break
      }
    }
    return out
  }

  // Build a self-contained HTML document suitable for printing to PDF
  function buildPdfHtml(): string {
    const tp = titlePage
    const revLabel = revisionColor.label.toUpperCase()
    const mono = `font-family:'Courier New',Courier,monospace;font-size:12pt;line-height:1.5;`

    function esc(s: string): string {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    // Build scene number map inline (linesRef is current)
    const pdfSceneNums: Record<string, number> = {}
    let sn = 0
    for (const l of linesRef.current) {
      if (l.element === 'scene-heading') pdfSceneNums[l.id] = ++sn
    }

    // ── Title page HTML ──
    const titleHtml = exportSettings.includeTitlePage ? `
      <div style="page-break-after:always;width:8.5in;min-height:11in;padding:1in;position:relative;box-sizing:border-box;">
        <div style="position:absolute;top:3.5in;left:1in;right:1in;text-align:center;">
          <div style="${mono}font-weight:bold;text-transform:uppercase;font-size:14pt;">${esc(tp.title || project.name)}</div>
          ${tp.subtitle ? `<div style="${mono}margin-top:24px;">${esc(tp.subtitle)}</div>` : ''}
          <div style="${mono}margin-top:12px;color:#555;">Revision: ${esc(revLabel)}</div>
        </div>
        <div style="position:absolute;bottom:1in;left:1in;text-align:left;">
          ${tp.authorName ? `<div style="${mono}">${esc(tp.authorName)}</div>` : ''}
          ${tp.contact ? `<div style="${mono}white-space:pre-line;color:#555;font-size:11pt;">${esc(tp.contact)}</div>` : ''}
        </div>
      </div>` : ''

    const watermark = exportSettings.showRevisionWatermark
      ? `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-family:Courier New,monospace;font-size:72pt;opacity:0.05;color:#000;pointer-events:none;z-index:0;">${esc(revLabel)}</div>`
      : ''

    let pageNum = 1
    // ── Script lines HTML ──
    const scriptLines = linesRef.current.map((line) => {
      const text = esc((liveTexts.current[line.id] ?? line.text).trim())
      const hasCont = contdLineIds.has(line.id)
      const numStr = exportSettings.showSceneNumbers && line.element === 'scene-heading' && pdfSceneNums[line.id]
        ? `<span style="${mono}color:#555;margin-right:8px;">${pdfSceneNums[line.id]}.</span>`
        : ''
      const pageNumHtml = exportSettings.showPageNumbers && line.element === 'scene-heading' && pageNum > 1
        ? `<!-- pagebreak -->` : ''
      if (line.element === 'scene-heading') pageNum++
      switch (line.element) {
        case 'scene-heading':
          return `${pageNumHtml}<div style="${mono}font-weight:bold;text-transform:uppercase;max-width:6in;margin:24px auto 0;">${numStr}${text || '&nbsp;'}</div>`
        case 'action':
          return `<div style="${mono}max-width:6in;margin:12px auto 0;">${text || '&nbsp;'}</div>`
        case 'character':
          return `<div style="${mono}text-transform:uppercase;margin-left:calc(50% - .8in);margin-top:12px;">${text || '&nbsp;'}${hasCont ? " (CONT'D)" : ''}</div>`
        case 'parenthetical':
          return `<div style="${mono}margin-left:calc(50% - 1.4in);max-width:2in;">(${text.replace(/^\(|\)$/g, '') || '&nbsp;'})</div>`
        case 'dialogue':
          return `<div style="${mono}margin-left:calc(50% - 2in);margin-right:1.5in;max-width:3.5in;">${text || '&nbsp;'}</div>`
        case 'transition':
          return `<div style="${mono}text-transform:uppercase;text-align:right;max-width:6in;margin:12px auto;">${text || '&nbsp;'}</div>`
      }
    }).join('\n')

    const pageNumCounterCss = exportSettings.showPageNumbers ? `
      @page { counter-increment: page; }
      .page-num::after { content: counter(page); }` : ''

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        @page { size: letter; margin: 1in; }
        body { margin: 0; padding: 0; background: white; }
        * { box-sizing: border-box; }
        ${pageNumCounterCss}
      </style>
    </head><body>
      ${watermark}
      ${titleHtml}
      <div style="padding:0;">
        ${scriptLines}
      </div>
    </body></html>`
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

  // Expose to parent (Editor.tsx) via ref
  useImperativeHandle(ref, () => ({
    getFountainContent: linesToFountain,
    getPdfHtml: buildPdfHtml,
    getDocxLines: () => linesRef.current.map((l) => ({ element: l.element, text: liveTexts.current[l.id] ?? l.text })),
    getAllText: () => linesRef.current.map((l) => liveTexts.current[l.id] ?? l.text).join('\n'),
    openAIWriter: (mode: AIWriterMode) => setAiWriterMode(mode),
    saveNow: () => doSave(linesRef.current),
  }))

  const wordCount = lines
    .map((l) => (liveTexts.current[l.id] ?? l.text).trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0)

  // Page count estimate: ~55 lines per page (standard screenplay)
  const estimatedLines = lines.reduce((total, l) => {
    const text = (liveTexts.current[l.id] ?? l.text).trim()
    switch (l.element) {
      case 'scene-heading': return total + 2
      case 'action': return total + Math.ceil(text.length / 65) + 1
      case 'character': return total + 2
      case 'parenthetical': return total + 1
      case 'dialogue': return total + Math.ceil(text.length / 38)
      case 'transition': return total + 2
      default: return total + 1
    }
  }, 0)
  const pageEstimate = Math.max(1, Math.round(estimatedLines / 55))

  // Character/scene breakdown
  const breakdownData = useMemo(() => {
    const scenes: { num: number; heading: string; characters: string[] }[] = []
    let currentScene: (typeof scenes)[0] | null = null
    for (const l of lines) {
      const text = (liveTexts.current[l.id] ?? l.text).trim()
      if (l.element === 'scene-heading') {
        currentScene = { num: scenes.length + 1, heading: text, characters: [] }
        scenes.push(currentScene)
      } else if (l.element === 'character' && currentScene && text) {
        const name = text.toUpperCase().replace(/\s*\(.*\)$/, '').trim()
        if (name && !currentScene.characters.includes(name)) {
          currentScene.characters.push(name)
        }
      }
    }
    return scenes
  }, [lines]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex">
      {/* Breakdown modal */}
      {showBreakdown && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowBreakdown(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-semibold text-gray-900">Scene Breakdown</h2>
                <p className="text-xs text-gray-500 mt-0.5">{breakdownData.length} scenes · {new Set(breakdownData.flatMap((s) => s.characters)).size} characters</p>
              </div>
              <button onClick={() => setShowBreakdown(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scene Heading</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Characters</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownData.map((scene) => (
                    <tr key={scene.num} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-400 font-mono text-xs">{scene.num}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-800 max-w-[240px] truncate">{scene.heading}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{scene.characters.join(', ') || <span className="text-gray-300 italic">none</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* AI Writer modal */}
      {aiWriterMode && (
        <AIWriter
          mode={aiWriterMode}
          projectName={project.name}
          contextText={linesRef.current.slice(-30).map((l) => liveTexts.current[l.id] ?? l.text).join('\n')}
          onInsertChapter={() => {}}
          onInsertLines={insertAILines}
          onClose={() => setAiWriterMode(null)}
        />
      )}

      {/* Sidebar */}
      <div className={`w-48 bg-gray-900 text-gray-300 flex flex-col p-3 shrink-0 overflow-y-auto transition-all ${focusMode ? 'hidden' : ''}`}>

        {/* Elements */}
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Elements</div>
        {(Object.keys(ELEMENT_LABELS) as ScreenplayElement[]).map((el) => (
          <button
            key={el}
            onClick={() => setLineElement(activeLine, el)}
            className={`text-left text-xs px-2 py-1.5 rounded mb-0.5 transition-colors ${
              activeElement === el ? 'bg-opossum-600 text-white' : 'hover:bg-gray-800 text-gray-400'
            }`}
          >
            {ELEMENT_LABELS[el]}
          </button>
        ))}

        {/* Navigator */}
        <div className="mt-4 border-t border-gray-700 pt-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Navigator</div>
          <Navigator lines={lines} activeLine={activeLine} onNavigate={navigateToLine} isStagePlay={isStagePlay} isTV={isTV} />
        </div>

        {/* Breakdown */}
        <div className="mt-4 border-t border-gray-700 pt-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Breakdown</div>
          <button
            onClick={() => setShowBreakdown(true)}
            className="block w-full text-left text-xs px-2 py-1.5 rounded transition-colors text-gray-400 hover:bg-gray-800"
          >
            Character/scene report
          </button>
        </div>

        {/* Title Page */}
        <div className="mt-4 border-t border-gray-700 pt-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Title Page</div>
          <button
            onClick={() => { setShowTitlePage(true); setShowTitleEditor(false) }}
            className={`block w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${showTitlePage ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            View title page
          </button>
          <button
            onClick={() => setShowTitleEditor((v) => !v)}
            className={`block w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${showTitleEditor ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            Edit title page
          </button>
          {showTitleEditor && (
            <div className="mt-2 bg-gray-800 rounded-lg overflow-hidden">
              <TitlePageEditor titlePage={titlePage} projectName={project.name} onSave={saveTitlePage} isTV={isTV} />
            </div>
          )}
          {showTitlePage && (
            <button
              onClick={() => setShowTitlePage(false)}
              className="mt-1 block w-full text-left text-xs px-2 py-1.5 rounded text-gray-400 hover:bg-gray-800 transition-colors"
            >
              ← Back to script
            </button>
          )}
        </div>

        {/* Revision color */}
        <div className="mt-4 border-t border-gray-700 pt-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Revision</div>
          <select
            value={project.revisionColor ?? 'white'}
            onChange={(e) => setRevisionColor(e.target.value)}
            className="w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-gray-600"
          >
            {REVISION_COLORS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <div
            className="mt-1.5 h-3 w-full rounded border border-gray-700"
            style={{ backgroundColor: revisionColor.hex }}
            title={revisionColor.label}
          />
        </div>

        {/* Hints */}
        <div className="mt-auto border-t border-gray-800 pt-3">
          <div className="text-xs text-gray-600 space-y-1">
            <div>Tab → cycle element</div>
            <div>Enter → next element</div>
          </div>
        </div>
      </div>

      {/* Page area */}
      <div className="flex-1 overflow-auto bg-gray-100 py-8 px-4 pb-8">
        {showTitlePage ? (
          <TitlePageView titlePage={titlePage} projectName={project.name} bgHex={revisionColor.hex} isTV={isTV} />
        ) : (
          <div
            id="screenplay-content"
            className="bg-white shadow-lg mx-auto p-12"
            style={{ width: '8.5in', minHeight: '11in', backgroundColor: revisionColor.hex }}
          >
            {lines.map((line) => (
              <div key={line.id} className={focusMode && activeLine !== line.id ? 'opacity-15 transition-opacity' : 'transition-opacity'}>
                <LineEditor
                  lineId={line.id}
                  initialText={line.text}
                  element={line.element}
                  isActive={activeLine === line.id}
                  isStagePlay={isStagePlay}
                  isTV={isTV}
                  showContd={contdLineIds.has(line.id)}
                  sceneNumber={exportSettings.showSceneNumbers && line.element === 'scene-heading' ? sceneNumbers[line.id] : undefined}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Character dropdown */}
      {dropdownState && dropdownPos && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
          style={{ top: dropdownPos.top, left: dropdownPos.left, minWidth: '180px' }}
        >
          {dropdownState.matches.map((name, idx) => (
            <button
              key={name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                applyCharacterSelection(dropdownState.lineId, name)
                const el = document.querySelector(`[data-line-id="${dropdownState.lineId}"]`) as HTMLElement
                el?.focus()
              }}
              className={`block w-full text-left px-3 py-1.5 text-sm font-mono tracking-wide transition-colors ${
                idx === dropdownState.selectedIdx ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Status bar */}
      <div className={`fixed bottom-0 right-0 h-6 bg-white border-t border-gray-200 flex items-center px-4 gap-4 text-xs text-gray-500 ${focusMode ? 'left-0' : 'left-48'}`}>
        <span className="font-medium text-gray-700">{ELEMENT_LABELS[activeElement]}</span>
        <span>·</span>
        <span>{lines.length} elements</span>
        <span>·</span>
        <span>{wordCount} words</span>
        <span>·</span>
        <span>~{pageEstimate} {pageEstimate === 1 ? 'pg' : 'pgs'}</span>
        <span>·</span>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full border border-gray-400" style={{ backgroundColor: revisionColor.hex }} />
          <span>{revisionColor.label}</span>
        </div>
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

export default ScreenplayEditor
