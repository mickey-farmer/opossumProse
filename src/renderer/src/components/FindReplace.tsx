import React, { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  onClose: () => void
}

export default function FindReplace({ onClose }: Props): JSX.Element {
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [currentMatch, setCurrentMatch] = useState(-1)
  const [caseInsensitive, setCaseInsensitive] = useState(true)
  const findInputRef = useRef<HTMLInputElement>(null)
  const matchesRef = useRef<{ el: HTMLElement; start: number; end: number; original: string }[]>([])

  useEffect(() => {
    findInputRef.current?.focus()
    return () => { clearHighlights() }
  }, [])

  useEffect(() => {
    if (findText.trim()) {
      doFind(findText)
    } else {
      clearHighlights()
      setMatchCount(0)
      setCurrentMatch(-1)
    }
  }, [findText, caseInsensitive])

  function clearHighlights(): void {
    document.querySelectorAll<HTMLElement>('[data-line-id]').forEach((el) => {
      if (el.querySelector('mark')) {
        el.textContent = el.textContent || ''
      }
    })
    matchesRef.current = []
  }

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function doFind(query: string): void {
    clearHighlights()
    if (!query) { setMatchCount(0); setCurrentMatch(-1); return }

    const flags = caseInsensitive ? 'gi' : 'g'
    const re = new RegExp(escapeRegex(query), flags)
    const newMatches: typeof matchesRef.current = []

    document.querySelectorAll<HTMLElement>('[data-line-id]').forEach((el) => {
      const text = el.textContent || ''
      if (!re.test(text)) return
      re.lastIndex = 0

      let m: RegExpExecArray | null
      let html = ''
      let last = 0
      while ((m = re.exec(text)) !== null) {
        html += escapeHtml(text.slice(last, m.index))
        html += `<mark class="find-match" style="background:#fde68a;border-radius:2px;" data-match-idx="${newMatches.length}">${escapeHtml(m[0])}</mark>`
        newMatches.push({ el, start: m.index, end: m.index + m[0].length, original: text })
        last = m.index + m[0].length
      }
      html += escapeHtml(text.slice(last))
      el.innerHTML = html
    })

    matchesRef.current = newMatches
    setMatchCount(newMatches.length)
    if (newMatches.length > 0) {
      setCurrentMatch(0)
      highlightCurrent(0, newMatches)
    } else {
      setCurrentMatch(-1)
    }
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function highlightCurrent(idx: number, matches = matchesRef.current): void {
    document.querySelectorAll<HTMLElement>('.find-match').forEach((m, i) => {
      m.style.background = i === idx ? '#f59e0b' : '#fde68a'
      m.style.outline = i === idx ? '2px solid #d97706' : 'none'
    })
    const target = matches[idx]?.el
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const goNext = useCallback(() => {
    if (matchesRef.current.length === 0) return
    const next = (currentMatch + 1) % matchesRef.current.length
    setCurrentMatch(next)
    highlightCurrent(next)
  }, [currentMatch])

  const goPrev = useCallback(() => {
    if (matchesRef.current.length === 0) return
    const prev = (currentMatch - 1 + matchesRef.current.length) % matchesRef.current.length
    setCurrentMatch(prev)
    highlightCurrent(prev)
  }, [currentMatch])

  function replaceCurrent(): void {
    const matches = matchesRef.current
    if (currentMatch < 0 || currentMatch >= matches.length) return
    const match = matches[currentMatch]
    const newText = match.original.slice(0, match.start) + replaceText + match.original.slice(match.end)
    match.el.textContent = newText
    match.el.dispatchEvent(new Event('input', { bubbles: true }))
    doFind(findText)
  }

  function replaceAll(): void {
    const matches = matchesRef.current
    if (matches.length === 0) return
    // Group by element, apply in reverse to preserve indices
    const byEl = new Map<HTMLElement, typeof matches>()
    for (const m of matches) {
      if (!byEl.has(m.el)) byEl.set(m.el, [])
      byEl.get(m.el)!.push(m)
    }
    byEl.forEach((elMatches, el) => {
      let text = elMatches[0].original
      // Replace from end to start to keep indices valid
      for (let i = elMatches.length - 1; i >= 0; i--) {
        const m = elMatches[i]
        text = text.slice(0, m.start) + replaceText + text.slice(m.end)
      }
      el.textContent = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    doFind(findText)
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'Enter') {
      if (e.shiftKey) goPrev(); else goNext()
    }
  }

  return (
    <div
      className="fixed top-14 right-4 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl w-80 overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Find & Replace</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCaseInsensitive((v) => !v)}
            title="Case insensitive"
            className={`text-xs px-1.5 py-0.5 rounded font-mono border transition-colors ${caseInsensitive ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-500'}`}
          >
            Aa
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {/* Find row */}
        <div className="flex items-center gap-1">
          <input
            ref={findInputRef}
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Find…"
            className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-gray-500"
          />
          <button onClick={goPrev} disabled={matchCount === 0} className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs">‹</button>
          <button onClick={goNext} disabled={matchCount === 0} className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs">›</button>
        </div>

        {/* Match count */}
        {findText && (
          <div className="text-xs text-gray-400 pl-1">
            {matchCount === 0 ? 'No matches' : `${currentMatch + 1} of ${matchCount}`}
          </div>
        )}

        {/* Replace row */}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace with…"
            className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-gray-500"
          />
          <button
            onClick={replaceCurrent}
            disabled={matchCount === 0}
            className="px-2 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs whitespace-nowrap"
          >
            Replace
          </button>
          <button
            onClick={replaceAll}
            disabled={matchCount === 0}
            className="px-2 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs whitespace-nowrap"
          >
            All
          </button>
        </div>
      </div>
    </div>
  )
}
