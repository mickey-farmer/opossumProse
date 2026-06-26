import React, { useEffect, useRef, useState } from 'react'

interface Message {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
}

interface Props {
  projectName: string
  getContext: () => string
  onClose: () => void
}

export default function AIChat({ projectName, getContext, onClose }: Props): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const contextRef = useRef<string>('')

  // Capture context once when chat opens
  useEffect(() => {
    contextRef.current = getContext()
    inputRef.current?.focus()
    return () => { cleanupRef.current?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const userMsg: Message = { role: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    // Placeholder assistant bubble that fills in as chunks arrive
    setMessages((prev) => [...prev, { role: 'assistant', text: '', streaming: true }])

    cleanupRef.current?.()
    cleanupRef.current = window.api.onGeminiChatChunk((delta: string) => {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.streaming) next[next.length - 1] = { ...last, text: last.text + delta }
        return next
      })
    })

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, text: m.text }))
      await window.api.geminiChat(history, contextRef.current)
      // Mark streaming done
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.streaming) next[next.length - 1] = { ...last, streaming: false }
        return next
      })
      // Context only sent on first message
      contextRef.current = ''
    } catch {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.streaming) next[next.length - 1] = { role: 'assistant', text: 'Something went wrong. Please try again.', streaming: false }
        return next
      })
    } finally {
      cleanupRef.current?.()
      cleanupRef.current = null
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200" style={{ width: '320px', minWidth: '320px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div>
          <div className="text-sm font-semibold text-gray-800">✦ Chat with AI</div>
          <div className="text-xs text-gray-400">{projectName} · Gemini</div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center pt-8">
            <div className="text-3xl mb-3">✦</div>
            <p className="text-sm text-gray-500">Ask anything about your work — characters, plot, dialogue, themes…</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gray-900 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {msg.text}
              {msg.streaming && <span className="inline-block w-1.5 h-3.5 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 py-3 border-t border-gray-200 bg-white">
        <div className="flex items-end gap-2 bg-gray-100 rounded-2xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message… (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-sm outline-none resize-none text-gray-800 placeholder-gray-400 max-h-32"
            style={{ minHeight: '1.5rem' }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="shrink-0 w-7 h-7 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs hover:bg-gray-700 transition-colors disabled:opacity-30"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
