import React, { useState } from 'react'

interface Issue {
  type: string
  description: string
  suggestion: string
}

interface Props {
  onClose: () => void
  getContent: () => string
  projectPath: string
  projectType: string
}

const TYPE_COLOR: Record<string, string> = {
  'Character Name': 'bg-purple-100 text-purple-700',
  'Timeline': 'bg-orange-100 text-orange-700',
  'Location': 'bg-blue-100 text-blue-700',
  'Prop': 'bg-green-100 text-green-700',
  'Wardrobe': 'bg-pink-100 text-pink-700',
}

function badgeClass(type: string): string {
  return TYPE_COLOR[type] ?? 'bg-gray-100 text-gray-700'
}

export default function ContinuityChecker({ onClose, getContent, projectPath, projectType }: Props): JSX.Element {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)
  const [error, setError] = useState('')

  async function runCheck(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      const content = getContent()
      const result = await window.api.geminiCheck(projectPath, content, projectType)
      setIssues(result.issues ?? [])
      setRan(true)
    } catch {
      setError('Something went wrong. Check your connection and try again.')
    }
    setLoading(false)
  }

  return (
    <div className="fixed top-14 right-4 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl w-96 max-h-[80vh] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div>
          <div className="text-sm font-semibold text-gray-800">AI Continuity Check</div>
          <div className="text-xs text-gray-400">Powered by Gemini</div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {!ran && !loading && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-gray-600 mb-4">Scan your script for continuity issues — character name inconsistencies, timeline jumps, location naming, and more.</p>
            <button
              onClick={runCheck}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors"
            >
              Run Check
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="text-2xl mb-3 animate-spin inline-block">⟳</div>
            <p className="text-sm text-gray-500">Analyzing with Gemini…</p>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
        )}

        {ran && !loading && issues.length === 0 && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm text-gray-600 font-medium">No issues found!</p>
            <p className="text-xs text-gray-400 mt-1">Your script looks consistent.</p>
          </div>
        )}

        {ran && issues.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{issues.length} issue{issues.length !== 1 ? 's' : ''} found</p>
            {issues.map((issue, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass(issue.type)}`}>
                    {issue.type}
                  </span>
                </div>
                <p className="text-sm text-gray-800">{issue.description}</p>
                <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                  <span className="font-medium text-gray-600">Fix: </span>{issue.suggestion}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {ran && (
        <div className="shrink-0 px-4 py-3 border-t border-gray-100">
          <button
            onClick={runCheck}
            disabled={loading}
            className="w-full text-sm text-gray-600 hover:text-gray-900 py-1.5 rounded-lg border border-gray-300 hover:border-gray-400 transition-colors disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Run Again'}
          </button>
        </div>
      )}
    </div>
  )
}
