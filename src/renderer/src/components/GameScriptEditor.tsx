import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Project,
  GameScript,
  GameConversation,
  GameNode,
  GameNodeType,
  GameDialogueLine,
  GameChoice,
  GameBarkLine,
  GameVariable,
} from '../stores/projectStore'
import { useProjectStore } from '../stores/projectStore'

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

function newLine(speaker = ''): GameDialogueLine {
  return { id: uid(), speaker, text: '', condition: '' }
}

function newChoice(): GameChoice {
  return { id: uid(), text: '', destinationNodeId: '', condition: '' }
}

function newNode(index: number, type: GameNodeType = 'conversation'): GameNode {
  const id = `NODE_${String(index).padStart(3, '0')}`
  return {
    id,
    label: type === 'start' ? 'Start' : `Node ${index}`,
    type,
    lines: [newLine()],
    choices: [],
    actions: [],
    notes: '',
  }
}

function newConversation(index: number): GameConversation {
  const startNode = newNode(1, 'start')
  return {
    id: uid(),
    name: `Conversation ${index}`,
    startNodeId: startNode.id,
    nodes: [startNode],
  }
}

function emptyScript(): GameScript {
  return {
    conversations: [newConversation(1)],
    barks: [],
    variables: [],
  }
}

function buildPlainText(script: GameScript): string {
  const lines: string[] = []
  for (const conv of script.conversations) {
    lines.push(`${'='.repeat(60)}`)
    lines.push(`CONVERSATION: ${conv.name}`)
    lines.push(`${'='.repeat(60)}`)
    lines.push('')
    for (const node of conv.nodes) {
      lines.push(`[${node.id}${node.label && node.label !== node.id ? ` — ${node.label}` : ''}]`)
      if (node.type !== 'conversation') lines.push(`  Type: ${node.type.toUpperCase()}`)
      if (node.lines.length > 0) {
        for (const line of node.lines) {
          if (line.condition) lines.push(`  (if ${line.condition})`)
          if (line.speaker) lines.push(`  ${line.speaker.toUpperCase()}`)
          if (line.text) {
            for (const para of line.text.split('\n')) {
              lines.push(`    ${para}`)
            }
          }
          lines.push('')
        }
      }
      if (node.choices.length > 0) {
        for (const choice of node.choices) {
          const cond = choice.condition ? ` [if ${choice.condition}]` : ''
          lines.push(`  > ${choice.text || '(no text)'}${cond}  →  ${choice.destinationNodeId || '???'}`)
        }
        lines.push('')
      }
      if (node.actions.length > 0) {
        for (const action of node.actions) lines.push(`  # ${action}`)
        lines.push('')
      }
      lines.push('')
    }
  }
  if (script.barks.length > 0) {
    lines.push(`${'='.repeat(60)}`)
    lines.push('BARKS')
    lines.push(`${'='.repeat(60)}`)
    lines.push('')
    const byCategory: Record<string, typeof script.barks> = {}
    for (const b of script.barks) {
      const cat = b.category || 'uncategorized'
      ;(byCategory[cat] = byCategory[cat] ?? []).push(b)
    }
    for (const [cat, barks] of Object.entries(byCategory)) {
      lines.push(`[${cat.toUpperCase()}]`)
      for (const b of barks) {
        const trig = b.trigger ? ` (trigger: ${b.trigger})` : ''
        lines.push(`  ${b.speaker ? b.speaker.toUpperCase() + ': ' : ''}${b.text}${trig}`)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

function countWords(script: GameScript): number {
  let n = 0
  for (const conv of script.conversations) {
    for (const node of conv.nodes) {
      for (const line of node.lines) {
        n += line.text.trim().split(/\s+/).filter(Boolean).length
      }
      for (const choice of node.choices) {
        n += choice.text.trim().split(/\s+/).filter(Boolean).length
      }
    }
  }
  for (const bark of script.barks) {
    n += bark.text.trim().split(/\s+/).filter(Boolean).length
  }
  return n
}

function speakerWordCounts(script: GameScript): Record<string, number> {
  const map: Record<string, number> = {}
  for (const conv of script.conversations) {
    for (const node of conv.nodes) {
      for (const line of node.lines) {
        if (!line.speaker.trim()) continue
        const wc = line.text.trim().split(/\s+/).filter(Boolean).length
        map[line.speaker] = (map[line.speaker] ?? 0) + wc
      }
    }
  }
  for (const bark of script.barks) {
    if (!bark.speaker.trim()) continue
    const wc = bark.text.trim().split(/\s+/).filter(Boolean).length
    map[bark.speaker] = (map[bark.speaker] ?? 0) + wc
  }
  return map
}

// ── Node type badge ────────────────────────────────────────────────────────────

const NODE_TYPE_META: Record<GameNodeType, { label: string; color: string }> = {
  start:        { label: 'START',       color: 'bg-green-100 text-green-800 border-green-200' },
  conversation: { label: 'CONV',        color: 'bg-blue-100 text-blue-800 border-blue-200' },
  cutscene:     { label: 'CUTSCENE',    color: 'bg-purple-100 text-purple-800 border-purple-200' },
  bark_group:   { label: 'BARK GROUP',  color: 'bg-orange-100 text-orange-800 border-orange-200' },
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Badge({ type }: { type: GameNodeType }): JSX.Element {
  const m = NODE_TYPE_META[type]
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-widest ${m.color}`}>
      {m.label}
    </span>
  )
}

function InlineInput({
  value, onChange, placeholder, className = '', mono = false
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  mono?: boolean
}): JSX.Element {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-transparent border-b border-gray-200 focus:border-gray-400 outline-none px-0 py-0.5 text-sm ${mono ? 'font-mono' : ''} ${className}`}
    />
  )
}

function TextArea({
  value, onChange, placeholder, rows = 2
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}): JSX.Element {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-gray-400 resize-none leading-relaxed"
    />
  )
}

// ── Condition validation helper ────────────────────────────────────────────────

function validateCondition(cond: string, varNames: string[]): string[] {
  if (!cond.trim() || varNames.length === 0) return []
  const tokens = cond.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? []
  const keywords = new Set(['AND', 'OR', 'NOT', 'and', 'or', 'not', 'true', 'false', 'TRUE', 'FALSE'])
  return tokens.filter((t) => !keywords.has(t) && !varNames.includes(t) && isNaN(Number(t)))
}

// ── Dialogue line editor ───────────────────────────────────────────────────────

function LineEditor({
  line,
  allSpeakers,
  allVariables,
  onChange,
  onDelete,
  showDelete,
}: {
  line: GameDialogueLine
  allSpeakers: string[]
  allVariables: string[]
  onChange: (l: GameDialogueLine) => void
  onDelete: () => void
  showDelete: boolean
}): JSX.Element {
  const [showCond, setShowCond] = useState(!!line.condition)
  const condWarnings = validateCondition(line.condition ?? '', allVariables)

  return (
    <div className="group relative bg-white border border-gray-200 rounded-lg p-3 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <input
          value={line.speaker}
          onChange={(e) => onChange({ ...line, speaker: e.target.value })}
          placeholder="SPEAKER"
          list="speaker-list"
          className="text-xs font-bold uppercase tracking-wider bg-transparent border-b border-gray-300 focus:border-gray-600 outline-none py-0.5 w-32"
        />
        <datalist id="speaker-list">
          {allSpeakers.map((s) => <option key={s} value={s} />)}
        </datalist>
        <button
          onClick={() => setShowCond((v) => !v)}
          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ml-auto ${showCond ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
          title="Toggle condition"
        >
          if
        </button>
        {showDelete && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {showCond && (
        <div className="mb-2">
          <input
            value={line.condition ?? ''}
            onChange={(e) => onChange({ ...line, condition: e.target.value })}
            placeholder="condition (e.g. reputation > 50)"
            list="variable-list"
            className={`font-mono text-xs w-full bg-transparent border-b outline-none py-0.5 ${condWarnings.length > 0 ? 'border-red-300 text-red-700' : 'border-gray-200 text-yellow-700 focus:border-yellow-400'}`}
          />
          {condWarnings.length > 0 && (
            <div className="text-[10px] text-red-500 mt-0.5">Undefined: {condWarnings.join(', ')}</div>
          )}
        </div>
      )}

      <TextArea
        value={line.text}
        onChange={(v) => onChange({ ...line, text: v })}
        placeholder="Dialogue text..."
        rows={2}
      />

      {line.voId && (
        <div className="text-[10px] text-gray-400 mt-1 font-mono">{line.voId}</div>
      )}
    </div>
  )
}

// ── Choice editor ──────────────────────────────────────────────────────────────

function ChoiceEditor({
  choice,
  allNodeIds,
  allVariables,
  onChange,
  onDelete,
}: {
  choice: GameChoice
  allNodeIds: string[]
  allVariables: string[]
  onChange: (c: GameChoice) => void
  onDelete: () => void
}): JSX.Element {
  const [showCond, setShowCond] = useState(!!choice.condition)
  const destValid = !choice.destinationNodeId || allNodeIds.includes(choice.destinationNodeId)
  const condWarnings = validateCondition(choice.condition ?? '', allVariables)

  return (
    <div className="group flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2.5 mb-1.5">
      <span className="text-blue-400 text-sm mt-0.5 shrink-0">▸</span>
      <div className="flex-1 min-w-0">
        <div className="flex gap-2 items-center mb-1">
          <InlineInput
            value={choice.text}
            onChange={(v) => onChange({ ...choice, text: v })}
            placeholder="Player response text..."
            className="flex-1"
          />
          <span className="text-gray-400 text-xs shrink-0">→</span>
          <input
            value={choice.destinationNodeId}
            onChange={(e) => onChange({ ...choice, destinationNodeId: e.target.value })}
            placeholder="NODE_ID"
            list="node-id-list"
            className={`font-mono text-xs w-28 bg-transparent border-b outline-none py-0.5 ${destValid ? 'border-gray-300 text-gray-700 focus:border-gray-500' : 'border-red-300 text-red-600 focus:border-red-500'}`}
            title={destValid ? '' : 'Node ID not found in this conversation'}
          />
          <button
            onClick={() => setShowCond((v) => !v)}
            className={`text-[10px] px-1 py-0.5 rounded border shrink-0 ${showCond ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'border-gray-200 text-gray-300 hover:text-gray-600'}`}
          >
            if
          </button>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-sm shrink-0"
          >
            ✕
          </button>
        </div>
        {showCond && (
          <div>
            <input
              value={choice.condition ?? ''}
              onChange={(e) => onChange({ ...choice, condition: e.target.value })}
              placeholder="condition (e.g. has_item_key)"
              list="variable-list"
              className={`font-mono text-xs w-full bg-transparent border-b outline-none py-0.5 ${condWarnings.length > 0 ? 'border-red-300 text-red-700' : 'border-gray-200 text-yellow-700 focus:border-yellow-400'}`}
            />
            {condWarnings.length > 0 && (
              <div className="text-[10px] text-red-500 mt-0.5">Undefined: {condWarnings.join(', ')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Node editor ────────────────────────────────────────────────────────────────

function NodeEditor({
  node,
  allSpeakers,
  allNodeIds,
  allVariables,
  onChange,
  onDelete,
  isStart,
}: {
  node: GameNode
  allSpeakers: string[]
  allNodeIds: string[]
  allVariables: string[]
  onChange: (n: GameNode) => void
  onDelete: () => void
  isStart: boolean
}): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [showActions, setShowActions] = useState(node.actions.length > 0)
  const [showNotes, setShowNotes] = useState(!!node.notes)
  const [editingId, setEditingId] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)

  function updateLine(idx: number, l: GameDialogueLine): void {
    const lines = [...node.lines]
    lines[idx] = l
    onChange({ ...node, lines })
  }

  function deleteLine(idx: number): void {
    onChange({ ...node, lines: node.lines.filter((_, i) => i !== idx) })
  }

  function addLine(): void {
    const lastSpeaker = node.lines[node.lines.length - 1]?.speaker ?? ''
    onChange({ ...node, lines: [...node.lines, newLine(lastSpeaker)] })
  }

  function updateChoice(idx: number, c: GameChoice): void {
    const choices = [...node.choices]
    choices[idx] = c
    onChange({ ...node, choices })
  }

  function deleteChoice(idx: number): void {
    onChange({ ...node, choices: node.choices.filter((_, i) => i !== idx) })
  }

  function addChoice(): void {
    onChange({ ...node, choices: [...node.choices, newChoice()] })
  }

  function updateActions(raw: string): void {
    onChange({ ...node, actions: raw.split('\n').filter(Boolean) })
  }

  return (
    <div className={`mb-4 rounded-xl border-2 overflow-hidden ${isStart ? 'border-green-300' : 'border-gray-200'}`}>
      {/* Node header */}
      <div
        className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none ${isStart ? 'bg-green-50' : 'bg-gray-50'}`}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="text-gray-400 text-xs">{collapsed ? '▶' : '▼'}</span>

        {editingId ? (
          <input
            autoFocus
            defaultValue={node.id}
            className="font-mono text-sm font-bold bg-white border border-gray-300 rounded px-1 py-0.5 w-32"
            onBlur={(e) => {
              const val = e.target.value.trim().toUpperCase().replace(/\s+/g, '_') || node.id
              onChange({ ...node, id: val })
              setEditingId(false)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="font-mono text-sm font-bold text-gray-700 hover:text-gray-900 cursor-text"
            title="Click to edit node ID"
            onClick={(e) => { e.stopPropagation(); setEditingId(true) }}
          >
            {node.id}
          </span>
        )}

        {editingLabel ? (
          <input
            autoFocus
            defaultValue={node.label}
            className="text-sm bg-white border border-gray-300 rounded px-1 py-0.5 flex-1"
            onBlur={(e) => {
              onChange({ ...node, label: e.target.value.trim() || node.label })
              setEditingLabel(false)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="text-sm text-gray-500 hover:text-gray-800 cursor-text flex-1"
            onClick={(e) => { e.stopPropagation(); setEditingLabel(true) }}
          >
            {node.label}
          </span>
        )}

        <Badge type={node.type} />

        <select
          value={node.type}
          onChange={(e) => { onChange({ ...node, type: e.target.value as GameNodeType }); e.stopPropagation() }}
          onClick={(e) => e.stopPropagation()}
          className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 ml-1"
        >
          <option value="conversation">Conversation</option>
          <option value="cutscene">Cutscene</option>
          <option value="bark_group">Bark Group</option>
          <option value="start">Start</option>
        </select>

        {!isStart && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="text-gray-300 hover:text-red-400 text-sm ml-1 transition-colors"
            title="Delete node"
          >
            ✕
          </button>
        )}
      </div>

      {/* Node body */}
      {!collapsed && (
        <div className="p-4 bg-white">
          <datalist id="node-id-list">
            {allNodeIds.map((id) => <option key={id} value={id} />)}
          </datalist>

          {/* Dialogue lines */}
          <div className="mb-3">
            {node.lines.map((line, i) => (
              <LineEditor
                key={line.id}
                line={line}
                allSpeakers={allSpeakers}
                allVariables={allVariables}
                onChange={(l) => updateLine(i, l)}
                onDelete={() => deleteLine(i)}
                showDelete={node.lines.length > 1}
              />
            ))}
            <button
              onClick={addLine}
              className="text-xs text-gray-400 hover:text-gray-700 border border-dashed border-gray-300 hover:border-gray-400 rounded px-3 py-1.5 w-full transition-colors"
            >
              + Add line
            </button>
          </div>

          {/* Player choices */}
          <div className="mb-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Player Choices</div>
            {node.choices.map((choice, i) => (
              <ChoiceEditor
                key={choice.id}
                choice={choice}
                allNodeIds={allNodeIds}
                allVariables={allVariables}
                onChange={(c) => updateChoice(i, c)}
                onDelete={() => deleteChoice(i)}
              />
            ))}
            <button
              onClick={addChoice}
              className="text-xs text-blue-400 hover:text-blue-600 border border-dashed border-blue-200 hover:border-blue-400 rounded px-3 py-1.5 w-full transition-colors"
            >
              + Add player choice
            </button>
          </div>

          {/* Actions */}
          <div className="mb-2">
            <button
              onClick={() => setShowActions((v) => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-1"
            >
              {showActions ? '▼' : '▶'} Actions {node.actions.length > 0 && `(${node.actions.length})`}
            </button>
            {showActions && (
              <textarea
                value={node.actions.join('\n')}
                onChange={(e) => updateActions(e.target.value)}
                placeholder={'SET quest_started = true\nGIVE item_key\nTRIGGER scene_fade'}
                rows={3}
                className="w-full font-mono text-xs bg-gray-900 text-green-400 border border-gray-700 rounded px-2 py-1.5 outline-none resize-none"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-1"
            >
              {showNotes ? '▼' : '▶'} Writer notes
            </button>
            {showNotes && (
              <TextArea
                value={node.notes ?? ''}
                onChange={(v) => onChange({ ...node, notes: v })}
                placeholder="Notes for this node (context, design intent, VO direction...)"
                rows={2}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Conversation editor ────────────────────────────────────────────────────────

function ConversationEditor({
  conv,
  allSpeakers,
  allVariables,
  onChange,
  onDelete,
}: {
  conv: GameConversation
  allSpeakers: string[]
  allVariables: string[]
  onChange: (c: GameConversation) => void
  onDelete: () => void
}): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [editingName, setEditingName] = useState(false)

  const allNodeIds = conv.nodes.map((n) => n.id)
  const nodeCount = conv.nodes.length

  function addNode(): void {
    const next = newNode(conv.nodes.length + 1)
    onChange({ ...conv, nodes: [...conv.nodes, next] })
  }

  function updateNode(idx: number, n: GameNode): void {
    const nodes = [...conv.nodes]
    nodes[idx] = n
    onChange({ ...conv, nodes })
  }

  function deleteNode(idx: number): void {
    onChange({ ...conv, nodes: conv.nodes.filter((_, i) => i !== idx) })
  }

  return (
    <div className="mb-8 border border-gray-300 rounded-2xl overflow-hidden">
      {/* Conversation header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-100 border-b border-gray-200">
        <button onClick={() => setCollapsed((v) => !v)} className="text-gray-400 text-xs">
          {collapsed ? '▶' : '▼'}
        </button>

        {editingName ? (
          <input
            autoFocus
            defaultValue={conv.name}
            className="text-base font-semibold bg-white border border-gray-300 rounded px-2 py-0.5 flex-1"
            onBlur={(e) => {
              onChange({ ...conv, name: e.target.value.trim() || conv.name })
              setEditingName(false)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
          />
        ) : (
          <span
            className="text-base font-semibold text-gray-800 cursor-text hover:text-gray-900 flex-1"
            onDoubleClick={() => setEditingName(true)}
            title="Double-click to rename"
          >
            {conv.name}
          </span>
        )}

        <span className="text-xs text-gray-400">{nodeCount} node{nodeCount !== 1 ? 's' : ''}</span>
        <button
          onClick={onDelete}
          className="text-gray-300 hover:text-red-400 text-sm transition-colors"
          title="Delete conversation"
        >
          ✕
        </button>
      </div>

      {!collapsed && (
        <div className="p-5 bg-white">
          {conv.nodes.map((node, i) => (
            <NodeEditor
              key={node.id}
              node={node}
              allSpeakers={allSpeakers}
              allNodeIds={allNodeIds}
              allVariables={allVariables}
              onChange={(n) => updateNode(i, n)}
              onDelete={() => deleteNode(i)}
              isStart={node.id === conv.startNodeId}
            />
          ))}
          <button
            onClick={addNode}
            className="text-sm text-gray-500 hover:text-gray-800 border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-xl px-4 py-3 w-full transition-colors"
          >
            + Add node
          </button>
        </div>
      )}
    </div>
  )
}

// ── Bark sheet ─────────────────────────────────────────────────────────────────

function BarkSheet({
  barks,
  onChange,
}: {
  barks: GameBarkLine[]
  onChange: (b: GameBarkLine[]) => void
}): JSX.Element {
  const categories = Array.from(new Set(barks.map((b) => b.category ?? ''))).filter(Boolean)

  function updateBark(idx: number, b: GameBarkLine): void {
    const next = [...barks]; next[idx] = b; onChange(next)
  }

  function deleteBark(idx: number): void {
    onChange(barks.filter((_, i) => i !== idx))
  }

  function addBark(): void {
    onChange([...barks, { id: uid(), speaker: '', text: '', trigger: '', category: '', notes: '' }])
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">Bark Sheet</h3>
          <p className="text-xs text-gray-500 mt-0.5">Ambient, combat, and idle lines — no branching</p>
        </div>
        <button
          onClick={addBark}
          className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + Add bark
        </button>
      </div>

      {barks.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          No barks yet. Add ambient lines, combat callouts, and idle dialogue here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left pb-2 pr-3 w-32">Speaker</th>
                <th className="text-left pb-2 pr-3">Line</th>
                <th className="text-left pb-2 pr-3 w-36">Category</th>
                <th className="text-left pb-2 pr-3 w-40">Trigger condition</th>
                <th className="pb-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {barks.map((bark, i) => (
                <tr key={bark.id} className="group border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 pr-3">
                    <input
                      value={bark.speaker}
                      onChange={(e) => updateBark(i, { ...bark, speaker: e.target.value })}
                      placeholder="NPC_NAME"
                      className="text-xs font-bold uppercase w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      value={bark.text}
                      onChange={(e) => updateBark(i, { ...bark, text: e.target.value })}
                      placeholder="Line text..."
                      className="w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-sm"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      value={bark.category ?? ''}
                      onChange={(e) => updateBark(i, { ...bark, category: e.target.value })}
                      placeholder="idle / combat / react"
                      list="bark-category-list"
                      className="text-xs w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300 font-mono text-gray-600"
                    />
                    <datalist id="bark-category-list">
                      {categories.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      value={bark.trigger ?? ''}
                      onChange={(e) => updateBark(i, { ...bark, trigger: e.target.value })}
                      placeholder="e.g. player_near AND alert"
                      className="text-xs font-mono w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-yellow-700"
                    />
                  </td>
                  <td className="py-1.5">
                    <button
                      onClick={() => deleteBark(i)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Variable registry ──────────────────────────────────────────────────────────

function VariableRegistry({
  variables,
  onChange,
}: {
  variables: GameVariable[]
  onChange: (v: GameVariable[]) => void
}): JSX.Element {
  function updateVar(idx: number, v: GameVariable): void {
    const next = [...variables]; next[idx] = v; onChange(next)
  }

  function deleteVar(idx: number): void {
    onChange(variables.filter((_, i) => i !== idx))
  }

  function addVar(): void {
    onChange([...variables, { id: uid(), name: '', type: 'boolean', defaultValue: 'false', description: '' }])
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">Variable Registry</h3>
          <p className="text-xs text-gray-500 mt-0.5">Flags and variables used in conditions throughout the script</p>
        </div>
        <button
          onClick={addVar}
          className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + Add variable
        </button>
      </div>

      {variables.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          No variables yet. Define flags and variables that your conditions reference.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-200">
              <th className="text-left pb-2 pr-3 w-40">Name</th>
              <th className="text-left pb-2 pr-3 w-28">Type</th>
              <th className="text-left pb-2 pr-3 w-28">Default</th>
              <th className="text-left pb-2 pr-3">Description</th>
              <th className="pb-2 w-6" />
            </tr>
          </thead>
          <tbody>
            {variables.map((v, i) => (
              <tr key={v.id} className="group border-b border-gray-50 hover:bg-gray-50">
                <td className="py-1.5 pr-3">
                  <input
                    value={v.name}
                    onChange={(e) => updateVar(i, { ...v, name: e.target.value })}
                    placeholder="variable_name"
                    className="font-mono text-xs w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <select
                    value={v.type}
                    onChange={(e) => updateVar(i, { ...v, type: e.target.value as GameVariable['type'] })}
                    className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white"
                  >
                    <option value="boolean">boolean</option>
                    <option value="integer">integer</option>
                    <option value="string">string</option>
                  </select>
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    value={v.defaultValue}
                    onChange={(e) => updateVar(i, { ...v, defaultValue: e.target.value })}
                    placeholder={v.type === 'boolean' ? 'false' : v.type === 'integer' ? '0' : '""'}
                    className="font-mono text-xs w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    value={v.description ?? ''}
                    onChange={(e) => updateVar(i, { ...v, description: e.target.value })}
                    placeholder="What does this variable track?"
                    className="text-xs w-full bg-transparent outline-none border-b border-transparent focus:border-gray-300 text-gray-500"
                  />
                </td>
                <td className="py-1.5">
                  <button
                    onClick={() => deleteVar(i)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Graph canvas ───────────────────────────────────────────────────────────────

const NODE_W = 220
const NODE_H_BASE = 80  // grows with lines/choices
const GRID = 260        // default spacing when auto-placing

function autoPos(index: number): { x: number; y: number } {
  const col = index % 3
  const row = Math.floor(index / 3)
  return { x: 60 + col * (NODE_W + 60), y: 60 + row * 160 }
}

const GRAPH_NODE_COLORS: Record<GameNodeType, { border: string; header: string; dot: string }> = {
  start:        { border: '#22c55e', header: '#dcfce7', dot: '#22c55e' },
  conversation: { border: '#60a5fa', header: '#dbeafe', dot: '#60a5fa' },
  cutscene:     { border: '#a78bfa', header: '#ede9fe', dot: '#a78bfa' },
  bark_group:   { border: '#fb923c', header: '#ffedd5', dot: '#fb923c' },
}

function GraphCanvas({
  conv,
  allSpeakers,
  allVariables,
  onChange,
}: {
  conv: GameConversation
  allSpeakers: string[]
  allVariables: string[]
  onChange: (c: GameConversation) => void
}): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [zoom, setZoom] = useState(1)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const dragging = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const panning = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null)

  // Ensure all nodes have positions
  const nodesWithPos = useMemo(() =>
    conv.nodes.map((n, i) => ({
      ...n,
      x: n.x ?? autoPos(i).x,
      y: n.y ?? autoPos(i).y,
    }))
  , [conv.nodes])

  function nodeById(id: string) {
    return nodesWithPos.find((n) => n.id === id)
  }

  // ── Drag nodes ────────────────────────────────────────────────────────────────

  function onNodeMouseDown(e: React.MouseEvent, nodeId: string): void {
    if (e.button !== 0) return
    e.stopPropagation()
    const node = nodeById(nodeId)
    if (!node) return
    dragging.current = { nodeId, startX: e.clientX, startY: e.clientY, origX: node.x!, origY: node.y! }
    setSelectedNodeId(nodeId)
  }

  function onCanvasMouseDown(e: React.MouseEvent): void {
    if (e.button !== 0) return
    if (e.target === canvasRef.current || (e.target as HTMLElement).dataset.canvasBg) {
      panning.current = { startX: e.clientX, startY: e.clientY, origPanX: pan.x, origPanY: pan.y }
      setSelectedNodeId(null)
    }
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (dragging.current) {
        const { nodeId, startX, startY, origX, origY } = dragging.current
        const dx = (e.clientX - startX) / zoom
        const dy = (e.clientY - startY) / zoom
        const newX = Math.max(0, origX + dx)
        const newY = Math.max(0, origY + dy)
        const updated = conv.nodes.map((n) =>
          n.id === nodeId ? { ...n, x: newX, y: newY } : n
        )
        onChange({ ...conv, nodes: updated })
      }
      if (panning.current) {
        const dx = e.clientX - panning.current.startX
        const dy = e.clientY - panning.current.startY
        setPan({ x: panning.current.origPanX + dx, y: panning.current.origPanY + dy })
      }
    }
    function onMouseUp(): void {
      dragging.current = null
      panning.current = null
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [conv, onChange, zoom])

  // ── Zoom ──────────────────────────────────────────────────────────────────────

  function onWheel(e: React.WheelEvent): void {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    setZoom((z) => Math.min(2, Math.max(0.25, z + delta)))
  }

  function resetView(): void {
    setPan({ x: 40, y: 40 })
    setZoom(1)
  }

  // ── Arrow drawing ─────────────────────────────────────────────────────────────

  function arrowPath(fromNode: typeof nodesWithPos[0], toNode: typeof nodesWithPos[0], choiceIdx: number, totalChoices: number): string {
    const spacing = 16
    const offset = (choiceIdx - (totalChoices - 1) / 2) * spacing
    const x1 = fromNode.x! + NODE_W
    const y1 = fromNode.y! + NODE_H_BASE / 2 + offset
    const x2 = toNode.x!
    const y2 = toNode.y! + NODE_H_BASE / 2
    const cx = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`
  }

  // Build all arrows from choices
  const arrows: { path: string; color: string; label: string; destExists: boolean }[] = []
  const choicesByNode: Record<string, number> = {}
  for (const node of nodesWithPos) {
    choicesByNode[node.id] = node.choices.length
  }
  for (const node of nodesWithPos) {
    const colors = GRAPH_NODE_COLORS[node.type]
    node.choices.forEach((choice, ci) => {
      const dest = nodeById(choice.destinationNodeId)
      if (dest) {
        arrows.push({
          path: arrowPath(node, dest, ci, node.choices.length),
          color: colors.dot,
          label: choice.text.slice(0, 28) || '→',
          destExists: true,
        })
      }
    })
  }

  const selectedNode = selectedNodeId ? conv.nodes.find((n) => n.id === selectedNodeId) : null
  const allNodeIds = conv.nodes.map((n) => n.id)

  function updateSelectedNode(updated: GameNode): void {
    onChange({ ...conv, nodes: conv.nodes.map((n) => n.id === updated.id ? updated : n) })
  }

  function addNode(): void {
    const newN = newNode(conv.nodes.length + 1)
    const pos = autoPos(conv.nodes.length)
    newN.x = pos.x + pan.x * -1 / zoom + 80
    newN.y = pos.y
    onChange({ ...conv, nodes: [...conv.nodes, newN] })
    setSelectedNodeId(newN.id)
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Canvas area */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden bg-gray-100 cursor-grab active:cursor-grabbing"
        style={{ backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        onMouseDown={onCanvasMouseDown}
        onWheel={onWheel}
      >
        {/* Controls */}
        <div className="absolute top-3 right-3 flex gap-1.5 z-20">
          <button onClick={addNode} className="text-xs bg-gray-900 text-white px-2.5 py-1.5 rounded-lg shadow hover:bg-gray-700 transition-colors">+ Node</button>
          <button onClick={resetView} className="text-xs bg-white border border-gray-300 text-gray-600 px-2.5 py-1.5 rounded-lg shadow hover:bg-gray-50 transition-colors">Reset view</button>
          <div className="text-xs bg-white border border-gray-300 text-gray-500 px-2.5 py-1.5 rounded-lg shadow select-none">{Math.round(zoom * 100)}%</div>
        </div>

        {/* Hint */}
        {conv.nodes.length <= 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-400 pointer-events-none select-none">
            Drag nodes to arrange • Scroll to zoom • Pan with click+drag on background
          </div>
        )}

        {/* Transformed world */}
        <div
          data-canvas-bg="true"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', width: '4000px', height: '3000px' }}
        >
          {/* SVG arrows */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              {Object.entries(GRAPH_NODE_COLORS).map(([type, c]) => (
                <marker key={type} id={`arrow-${type}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill={c.dot} />
                </marker>
              ))}
            </defs>
            {arrows.map((a, i) => (
              <g key={i}>
                <path
                  d={a.path}
                  fill="none"
                  stroke={a.color}
                  strokeWidth="1.5"
                  strokeDasharray={a.destExists ? undefined : '4 3'}
                  opacity="0.7"
                  markerEnd={`url(#arrow-conversation)`}
                />
              </g>
            ))}
          </svg>

          {/* Node cards */}
          {nodesWithPos.map((node) => {
            const colors = GRAPH_NODE_COLORS[node.type]
            const isSelected = selectedNodeId === node.id
            const isStart = node.id === conv.startNodeId
            const previewLines = node.lines.slice(0, 2)
            return (
              <div
                key={node.id}
                onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  width: NODE_W,
                  userSelect: 'none',
                  cursor: 'grab',
                }}
              >
                <div
                  className="rounded-xl overflow-hidden shadow-md transition-shadow"
                  style={{
                    border: `2px solid ${isSelected ? '#1f2937' : colors.border}`,
                    boxShadow: isSelected ? '0 0 0 3px rgba(0,0,0,0.15)' : undefined,
                    background: 'white',
                  }}
                >
                  {/* Header */}
                  <div className="px-3 py-2 flex items-center gap-2" style={{ background: colors.header }}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colors.dot }} />
                    <span className="font-mono text-xs font-bold text-gray-700 truncate flex-1">{node.id}</span>
                    {isStart && <span className="text-[9px] font-bold text-green-700 bg-green-100 border border-green-200 px-1 rounded uppercase tracking-wider">start</span>}
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider">{node.type === 'bark_group' ? 'barks' : node.type}</span>
                  </div>

                  {/* Label */}
                  {node.label && node.label !== node.id && (
                    <div className="px-3 pt-1.5 text-xs text-gray-500 truncate">{node.label}</div>
                  )}

                  {/* Line previews */}
                  <div className="px-3 py-2 space-y-1">
                    {previewLines.map((line, li) => (
                      <div key={li} className="text-xs">
                        {line.speaker && <span className="font-bold uppercase text-gray-500 mr-1.5 text-[10px]">{line.speaker}:</span>}
                        <span className="text-gray-700 line-clamp-2">{line.text || <span className="italic text-gray-300">empty line</span>}</span>
                      </div>
                    ))}
                    {node.lines.length > 2 && (
                      <div className="text-[10px] text-gray-400">+{node.lines.length - 2} more line{node.lines.length - 2 !== 1 ? 's' : ''}</div>
                    )}
                  </div>

                  {/* Choice pills */}
                  {node.choices.length > 0 && (
                    <div className="px-3 pb-2 flex flex-col gap-1">
                      {node.choices.slice(0, 3).map((choice) => (
                        <div key={choice.id} className="flex items-center gap-1 bg-blue-50 rounded px-2 py-0.5">
                          <span className="text-blue-400 text-[10px]">▸</span>
                          <span className="text-[10px] text-blue-700 truncate flex-1">{choice.text || <span className="italic text-blue-300">choice text</span>}</span>
                          {choice.destinationNodeId && (
                            <span className="font-mono text-[9px] text-gray-400 shrink-0">→ {choice.destinationNodeId}</span>
                          )}
                        </div>
                      ))}
                      {node.choices.length > 3 && (
                        <div className="text-[10px] text-gray-400 px-1">+{node.choices.length - 3} more choices</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Side panel — node editor */}
      {selectedNode ? (
        <div className="w-80 border-l border-gray-200 bg-white overflow-auto shrink-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
            <span className="font-mono text-sm font-bold text-gray-700">{selectedNode.id}</span>
            <button onClick={() => setSelectedNodeId(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
          </div>
          <div className="flex-1 overflow-auto p-3">
            <NodeEditor
              node={selectedNode}
              allSpeakers={allSpeakers}
              allNodeIds={allNodeIds}
              allVariables={allVariables}
              onChange={updateSelectedNode}
              onDelete={() => {
                onChange({ ...conv, nodes: conv.nodes.filter((n) => n.id !== selectedNode.id) })
                setSelectedNodeId(null)
              }}
              isStart={selectedNode.id === conv.startNodeId}
            />
          </div>
        </div>
      ) : (
        <div className="w-56 border-l border-gray-200 bg-gray-50 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{conv.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{conv.nodes.length} nodes</div>
          </div>
          <div className="p-3 space-y-1 overflow-auto flex-1">
            {conv.nodes.map((n) => {
              const c = GRAPH_NODE_COLORS[n.type]
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedNodeId(n.id)}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />
                  <span className="font-mono text-xs text-gray-700 truncate">{n.id}</span>
                  {n.label && n.label !== n.id && (
                    <span className="text-[10px] text-gray-400 truncate">{n.label}</span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="p-3 border-t border-gray-200">
            <button
              onClick={addNode}
              className="w-full text-xs text-gray-500 hover:text-gray-800 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg py-2 transition-colors"
            >
              + Add node
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Speaker stats sidebar ──────────────────────────────────────────────────────

function SpeakerPanel({ script }: { script: GameScript }): JSX.Element {
  const counts = speakerWordCounts(script)
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])

  if (sorted.length === 0) {
    return (
      <div className="text-xs text-gray-400 px-4 py-6 text-center">
        No speakers yet
      </div>
    )
  }

  const max = sorted[0][1]
  return (
    <div className="px-3 py-4">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Speakers</div>
      {sorted.map(([speaker, wc]) => (
        <div key={speaker} className="mb-3">
          <div className="flex justify-between text-xs mb-0.5">
            <span className="font-medium text-gray-700 uppercase text-[11px] tracking-wide">{speaker}</span>
            <span className="text-gray-400">{wc.toLocaleString()}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-opossum-500 rounded-full" style={{ width: `${(wc / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main editor ────────────────────────────────────────────────────────────────

type GameTab = 'script' | 'graph' | 'barks' | 'variables'

export interface GameScriptEditorHandle {
  saveNow: () => Promise<void>
  exportPlainText: () => string
}

const GameScriptEditor = React.forwardRef<GameScriptEditorHandle, { project: Project }>(
function GameScriptEditor({ project }, ref) {
  const { updateActiveProject } = useProjectStore()
  const [script, setScript] = useState<GameScript>(emptyScript())
  const [tab, setTab] = useState<GameTab>('script')
  const [activeConvIdx, setActiveConvIdx] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showSpeakers, setShowSpeakers] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveScript = useRef<GameScript>(emptyScript())

  // Load on mount
  useEffect(() => {
    if (!project.path) return
    window.api.loadContent(project.path).then((raw) => {
      const data = raw as { script?: GameScript } | null
      if (data?.script) {
        setScript(data.script)
        liveScript.current = data.script
      }
    }).catch(() => {})
  }, [project.path])

  const doSave = useCallback(async (s: GameScript) => {
    setSaveStatus('saving')
    const wordCount = countWords(s)
    await window.api.saveContent(project.path, { script: s, wordCount })
    updateActiveProject({ wordCount })
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [project.path, updateActiveProject])

  const scheduleSave = useCallback((s: GameScript) => {
    liveScript.current = s
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(s), 1500)
  }, [doSave])

  function updateScript(s: GameScript): void {
    setScript(s)
    scheduleSave(s)
  }

  React.useImperativeHandle(ref, () => ({
    saveNow: () => doSave(liveScript.current),
    exportPlainText: () => buildPlainText(liveScript.current),
  }))

  // Keyboard save
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.metaKey && e.key === 's') {
        e.preventDefault()
        doSave(liveScript.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doSave])

  const wordCount = countWords(script)
  const convCount = script.conversations.length
  const barkCount = script.barks.length
  const nodeCount = script.conversations.reduce((s, c) => s + c.nodes.length, 0)

  function addConversation(): void {
    const next = newConversation(script.conversations.length + 1)
    updateScript({ ...script, conversations: [...script.conversations, next] })
  }

  function updateConversation(idx: number, c: GameConversation): void {
    const conversations = [...script.conversations]
    conversations[idx] = c
    updateScript({ ...script, conversations })
  }

  function deleteConversation(idx: number): void {
    updateScript({ ...script, conversations: script.conversations.filter((_, i) => i !== idx) })
  }

  // All speakers across entire script (for autocomplete)
  const allSpeakers = Array.from(new Set([
    ...script.conversations.flatMap((c) => c.nodes.flatMap((n) => n.lines.map((l) => l.speaker))),
    ...script.barks.map((b) => b.speaker),
  ].filter(Boolean)))

  // Variable names for condition autocomplete + validation
  const allVariableNames = script.variables.map((v) => v.name).filter(Boolean)

  // Count undefined variable references across all conditions (for badge in tab)
  const undefinedVarCount = (() => {
    const seen = new Set<string>()
    for (const conv of script.conversations) {
      for (const node of conv.nodes) {
        for (const line of node.lines) {
          for (const w of validateCondition(line.condition ?? '', allVariableNames)) seen.add(w)
        }
        for (const choice of node.choices) {
          for (const w of validateCondition(choice.condition ?? '', allVariableNames)) seen.add(w)
        }
      }
    }
    return seen.size
  })()

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        {([
          { id: 'script', label: `Script (${convCount} conv, ${nodeCount} nodes)` },
          { id: 'graph',  label: 'Graph' },
          { id: 'barks',  label: `Barks (${barkCount})` },
          { id: 'variables', label: `Variables (${script.variables.length})${undefinedVarCount > 0 ? ` ⚠ ${undefinedVarCount}` : ''}` },
        ] as { id: GameTab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-sm px-3 py-1 rounded-lg transition-colors ${tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
          <span>{wordCount.toLocaleString()} words</span>
          {saveStatus === 'saving' && <span className="animate-pulse">Saving…</span>}
          {saveStatus === 'saved' && <span className="text-green-600">Saved</span>}
          <button
            onClick={() => setShowSpeakers((v) => !v)}
            className={`px-2 py-1 rounded border text-xs transition-colors ${showSpeakers ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
          >
            Speakers
          </button>
        </div>
      </div>

      {/* Graph conversation selector */}
      {tab === 'graph' && script.conversations.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0">
          <span className="text-xs text-gray-500">Conversation:</span>
          {script.conversations.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActiveConvIdx(i)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${activeConvIdx === i ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main content */}
        <div className="flex-1 overflow-auto" style={{ overflow: tab === 'graph' ? 'hidden' : undefined }}>
          {tab === 'script' && (
            <div className="p-5 max-w-4xl mx-auto">
              <datalist id="variable-list">
                {allVariableNames.map((n) => <option key={n} value={n} />)}
              </datalist>
              {script.conversations.map((conv, i) => (
                <ConversationEditor
                  key={conv.id}
                  conv={conv}
                  allSpeakers={allSpeakers}
                  allVariables={allVariableNames}
                  onChange={(c) => updateConversation(i, c)}
                  onDelete={() => deleteConversation(i)}
                />
              ))}
              <button
                onClick={addConversation}
                className="w-full py-4 border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-2xl text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                + New conversation
              </button>
            </div>
          )}

          {tab === 'graph' && script.conversations.length > 0 && (
            <GraphCanvas
              conv={script.conversations[Math.min(activeConvIdx, script.conversations.length - 1)]}
              allSpeakers={allSpeakers}
              allVariables={allVariableNames}
              onChange={(c) => {
                const idx = Math.min(activeConvIdx, script.conversations.length - 1)
                updateConversation(idx, c)
              }}
            />
          )}

          {tab === 'barks' && (
            <BarkSheet
              barks={script.barks}
              onChange={(b) => updateScript({ ...script, barks: b })}
            />
          )}

          {tab === 'variables' && (
            <div className="flex h-full overflow-hidden">
              <div className="flex-1 overflow-auto">
                <VariableRegistry
                  variables={script.variables}
                  onChange={(v) => updateScript({ ...script, variables: v })}
                />
                {undefinedVarCount > 0 && (
                  <div className="mx-5 mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="text-sm font-semibold text-red-700 mb-2">⚠ Undefined variable references</div>
                    <p className="text-xs text-red-600">
                      Some conditions reference variable names not in the registry. Check the Script tab — undefined names are highlighted in red.
                    </p>
                  </div>
                )}
              </div>
              <div className="w-56 border-l border-gray-200 bg-gray-50 overflow-auto shrink-0 p-4">
                <SpeakerPanel script={script} />
              </div>
            </div>
          )}
        </div>

        {/* Speaker sidebar — hidden in graph mode (graph has its own side panel) */}
        {showSpeakers && tab !== 'graph' && (
          <div className="w-44 border-l border-gray-200 bg-gray-50 overflow-auto shrink-0">
            <SpeakerPanel script={script} />
          </div>
        )}
      </div>
    </div>
  )
})

export default GameScriptEditor
