'use client'

import { useEffect, useRef, useState } from 'react'

type Line =
  | { kind: 'in'; text: string; ts: number }
  | { kind: 'out'; text: string; ts: number; durationMs?: number }
  | { kind: 'err'; text: string; ts: number }
  | { kind: 'system'; text: string; ts: number }

const COMMON_COMMANDS = [
  'list',
  'say',
  'tell',
  'time set day',
  'time set night',
  'weather clear',
  'weather rain',
  'difficulty',
  'gamemode',
  'tp',
  'give',
  'help',
  'seed',
  'whitelist list',
]

const HISTORY_KEY_PREFIX = 'rcon-history:'

export function RconConsole({
  machineId,
  machineName,
}: {
  machineId: string
  machineName: string
}) {
  const [lines, setLines] = useState<Line[]>([
    {
      kind: 'system',
      text: `connecté à ${machineName} — tape une commande (sans "/" devant)`,
      ts: Date.now(),
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [histIndex, setHistIndex] = useState<number>(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load history from sessionStorage (per-machine)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY_PREFIX + machineId)
      if (raw) setHistory(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [machineId])

  // Persist history
  useEffect(() => {
    try {
      sessionStorage.setItem(HISTORY_KEY_PREFIX + machineId, JSON.stringify(history.slice(-100)))
    } catch {
      /* ignore */
    }
  }, [history, machineId])

  // Auto-scroll on new line
  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: 'auto',
    })
  }, [lines])

  async function exec(rawCommand: string) {
    const command = rawCommand.trim().replace(/^\//, '')
    if (!command) return

    setLines((l) => [...l, { kind: 'in', text: command, ts: Date.now() }])
    setHistory((h) => (h[h.length - 1] === command ? h : [...h, command]))
    setHistIndex(-1)
    setBusy(true)

    try {
      const res = await fetch(`/api/machines/${machineId}/rcon`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLines((l) => [
          ...l,
          {
            kind: 'err',
            text: `${data.error ?? 'erreur'}${data.hint ? ` — ${data.hint}` : ''}`,
            ts: Date.now(),
          },
        ])
      } else {
        const text = (data.response ?? '').trim() || '(réponse vide)'
        setLines((l) => [
          ...l,
          { kind: 'out', text, ts: Date.now(), durationMs: data.durationMs },
        ])
      }
    } catch (err) {
      setLines((l) => [
        ...l,
        {
          kind: 'err',
          text: err instanceof Error ? err.message : 'erreur réseau',
          ts: Date.now(),
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !busy) {
        void exec(input)
        setInput('')
        setShowSuggestions(false)
      }
    } else if (e.key === 'ArrowUp') {
      if (history.length === 0) return
      e.preventDefault()
      const next = histIndex < 0 ? history.length - 1 : Math.max(0, histIndex - 1)
      setHistIndex(next)
      setInput(history[next])
    } else if (e.key === 'ArrowDown') {
      if (histIndex < 0) return
      e.preventDefault()
      const next = histIndex + 1
      if (next >= history.length) {
        setHistIndex(-1)
        setInput('')
      } else {
        setHistIndex(next)
        setInput(history[next])
      }
    } else if (e.key === 'Tab') {
      // Crude tab-complete on common commands
      const lower = input.toLowerCase()
      const match = COMMON_COMMANDS.find((c) => c.startsWith(lower) && c !== lower)
      if (match) {
        e.preventDefault()
        setInput(match)
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setLines([{ kind: 'system', text: '— cleared —', ts: Date.now() }])
    }
  }

  const suggestions = input
    ? COMMON_COMMANDS.filter((c) => c.startsWith(input.toLowerCase()) && c !== input).slice(0, 5)
    : []

  return (
    <div className="card overflow-hidden animate-reveal flex flex-col h-[70vh]">
      <div className="px-4 py-2 border-b border-ink-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="pill-ok">● rcon</span>
          <span className="mono-caps text-[10px] text-ink-400">
            {lines.filter((l) => l.kind === 'in').length} commandes exécutées
          </span>
        </div>
        <div className="flex items-center gap-2 mono-caps text-[9px] text-ink-500">
          <span>↑↓ historique</span>
          <span>·</span>
          <span>↹ complétion</span>
          <span>·</span>
          <span>⌃L clear</span>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto bg-ink-950 font-mono text-[12px] leading-relaxed p-4"
      >
        {lines.map((line, i) => (
          <ConsoleLine key={i} line={line} />
        ))}
        {busy && (
          <div className="text-ink-500 mono-caps text-[10px] mt-1">
            en attente du serveur<span className="blink" />
          </div>
        )}
      </div>

      <div className="border-t border-ink-800 px-3 py-2 shrink-0 relative">
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-ink-900 border border-ink-700 rounded-sm overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setInput(s)
                  setShowSuggestions(false)
                  inputRef.current?.focus()
                }}
                className="block w-full text-left px-3 py-1.5 font-mono text-xs text-ink-200 hover:bg-amber/10 hover:text-amber"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="font-mono text-amber text-sm shrink-0">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setShowSuggestions(true)
              setHistIndex(-1)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            disabled={busy}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            placeholder='ex: list   ou   say hello   ou   time set day'
            className="flex-1 bg-transparent text-ink-100 font-mono text-sm outline-none placeholder:text-ink-500"
          />
          {busy && <span className="text-amber font-mono text-xs">…</span>}
        </div>
      </div>
    </div>
  )
}

function ConsoleLine({ line }: { line: Line }) {
  const time = formatTime(line.ts)
  if (line.kind === 'in') {
    return (
      <div className="flex gap-2 mt-2">
        <span className="text-ink-500 text-[10px] shrink-0 mt-[3px]">{time}</span>
        <span className="text-amber shrink-0">{'>'}</span>
        <span className="text-ink-100">{line.text}</span>
      </div>
    )
  }
  if (line.kind === 'out') {
    return (
      <div className="flex gap-2 pl-[60px]">
        <span className="text-phosphor whitespace-pre-wrap break-words flex-1">{line.text}</span>
        {line.durationMs != null && (
          <span className="text-ink-500 text-[10px] shrink-0 mt-[3px]">
            {line.durationMs}ms
          </span>
        )}
      </div>
    )
  }
  if (line.kind === 'err') {
    return (
      <div className="flex gap-2 mt-1">
        <span className="text-ink-500 text-[10px] shrink-0 mt-[3px]">{time}</span>
        <span className="text-rust shrink-0">!</span>
        <span className="text-rust">{line.text}</span>
      </div>
    )
  }
  // system
  return (
    <div className="text-ink-500 mono-caps text-[10px] italic">// {line.text}</div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
