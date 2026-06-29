import React, { useEffect, useState } from 'react'
import { Project, WritingStatEntry } from '../stores/projectStore'

interface Props {
  project: Project
}

const TYPE_COLORS: Record<string, string> = {
  novel: '#f97316',
  screenplay: '#60a5fa',
  stageplay: '#4ade80',
  tv: '#c084fc',
  shortstory: '#fb923c',
}

function formatMs(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

// Build a map of date → words added, for the last N days
function buildHeatmap(entries: WritingStatEntry[], days: number): { date: string; words: number }[] {
  const map: Record<string, number> = {}
  for (const e of entries) {
    map[e.date] = (map[e.date] ?? 0) + e.wordsAdded
  }
  const result: { date: string; words: number }[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    result.push({ date: key, words: map[key] ?? 0 })
  }
  return result
}

function heatColor(words: number, max: number): string {
  if (words === 0) return '#e5e7eb'
  const pct = Math.min(words / Math.max(max, 1), 1)
  if (pct < 0.25) return '#ddd6fe'
  if (pct < 0.5)  return '#a78bfa'
  if (pct < 0.75) return '#8b5cf6'
  return '#7c3aed'
}

export default function WritingStats({ project }: Props): JSX.Element {
  const [allEntries, setAllEntries] = useState<WritingStatEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.loadWritingStats(project.path).then((raw) => {
      setAllEntries((raw as WritingStatEntry[]) || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [project.path])

  const projectEntries = allEntries.filter((e) => e.projectId === project.id)

  // Summary stats
  const totalWords = project.wordCount ?? 0
  const totalWordsAdded = projectEntries.reduce((s, e) => s + e.wordsAdded, 0)
  const totalSessionMs = projectEntries.reduce((s, e) => s + e.sessionMs, 0)
  const sessionCount = projectEntries.length
  const avgPerSession = sessionCount > 0 ? Math.round(totalWordsAdded / sessionCount) : 0

  // Streak
  const today = new Date().toISOString().slice(0, 10)
  const writtenDays = new Set(projectEntries.filter((e) => e.wordsAdded > 0).map((e) => e.date))
  let streak = 0
  const cur = new Date()
  while (true) {
    const key = cur.toISOString().slice(0, 10)
    if (!writtenDays.has(key)) break
    streak++
    cur.setDate(cur.getDate() - 1)
  }

  // Heatmap — last 63 days (9 weeks)
  const heatmap = buildHeatmap(projectEntries, 63)
  const heatMax = Math.max(...heatmap.map((h) => h.words), 1)

  // Daily chart — last 14 days
  const daily = buildHeatmap(projectEntries, 14)
  const dailyMax = Math.max(...daily.map((d) => d.words), 1)

  // Recent sessions (last 10)
  const recentSessions = [...projectEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)

  // Goal progress
  const goal = project.wordCountGoal ?? 0
  const goalPct = goal > 0 ? Math.min(totalWords / goal, 1) : 0

  if (loading) {
    return <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading stats…</div>
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6 pb-12">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">Writing Stats</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Words" value={totalWords.toLocaleString()} />
        <StatCard label="Words This Project" value={totalWordsAdded.toLocaleString()} />
        <StatCard label="Sessions" value={String(sessionCount)} />
        <StatCard label="Avg / Session" value={avgPerSession.toLocaleString()} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Current Streak" value={`${streak} day${streak !== 1 ? 's' : ''}`} accent={streak > 0} />
        <StatCard label="Time Writing" value={totalSessionMs > 0 ? formatMs(totalSessionMs) : '—'} />
        <StatCard label="Today" value={(() => {
          const todayWords = projectEntries.filter((e) => e.date === today).reduce((s, e) => s + e.wordsAdded, 0)
          return todayWords > 0 ? `${todayWords.toLocaleString()} words` : 'No writing yet'
        })()} />
      </div>

      {/* Goal progress */}
      {goal > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Word Count Goal</span>
            <span className="text-sm text-gray-500">{totalWords.toLocaleString()} / {goal.toLocaleString()}</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${goalPct >= 1 ? 'bg-green-500' : 'bg-opossum-500'}`}
              style={{ width: `${goalPct * 100}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1">{Math.round(goalPct * 100)}% complete</div>
        </div>
      )}

      {/* Heatmap */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="text-sm font-medium text-gray-700 mb-3">Activity — last 9 weeks</div>
        <div className="flex gap-1 flex-wrap">
          {heatmap.map((h) => (
            <div
              key={h.date}
              title={`${isoToDisplay(h.date)}: ${h.words.toLocaleString()} words`}
              className="w-3.5 h-3.5 rounded-sm cursor-default"
              style={{ backgroundColor: heatColor(h.words, heatMax) }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
          <span>Less</span>
          {[0, 0.1, 0.35, 0.65, 1].map((p) => (
            <div key={p} className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: heatColor(p * heatMax, heatMax) }} />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Bar chart last 14 days */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="text-sm font-medium text-gray-700 mb-3">Daily words — last 14 days</div>
        <div className="flex items-end gap-1 h-20">
          {daily.map((d) => {
            const pct = dailyMax > 0 ? d.words / dailyMax : 0
            const isToday = d.date === today
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${isoToDisplay(d.date)}: ${d.words.toLocaleString()} words`}>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max(pct * 72, d.words > 0 ? 4 : 0)}px`,
                    backgroundColor: isToday ? '#7c3aed' : d.words > 0 ? '#a78bfa' : '#e5e7eb',
                  }}
                />
                <span className="text-gray-400" style={{ fontSize: '8px' }}>
                  {new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' })}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent sessions table */}
      {recentSessions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="text-sm font-medium text-gray-700 px-4 py-3 border-b border-gray-100">Recent Sessions</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-right px-4 py-2 font-medium">Words Added</th>
                <th className="text-right px-4 py-2 font-medium">Total Words</th>
                <th className="text-right px-4 py-2 font-medium">Session Time</th>
              </tr>
            </thead>
            <tbody>
              {recentSessions.map((e, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">{isoToDisplay(e.date)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">
                    {e.wordsAdded > 0
                      ? <span className="text-green-600">+{e.wordsAdded.toLocaleString()}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">{e.totalWords.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-gray-400">{e.sessionMs > 0 ? formatMs(e.sessionMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recentSessions.length === 0 && (
        <div className="text-center text-sm text-gray-400 mt-8">
          No sessions recorded yet. Start writing to see your stats here.
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }): JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? 'text-opossum-600' : 'text-gray-800'}`}>{value}</div>
    </div>
  )
}
