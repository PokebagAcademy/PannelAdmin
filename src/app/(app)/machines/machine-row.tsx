'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Machine = {
  id: string
  name: string
  description: string | null
  host: string
  port: number
  username: string
  authType: 'key' | 'password'
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | {
      kind: 'ok'
      execOk: boolean
      uname?: string
      remoteUser?: string
      sampleEntries: string[]
      note?: string
      diagnostics: string[]
    }
  | { kind: 'err'; error: string; diagnostics: string[] }

export function MachineRow({
  machine,
  canDelete,
}: {
  machine: Machine
  canDelete: boolean
}) {
  const [state, setState] = useState<TestState>({ kind: 'idle' })
  const [showDiag, setShowDiag] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  async function test() {
    setState({ kind: 'testing' })
    setShowDiag(false)
    const res = await fetch(`/api/machines/${machine.id}/test`, { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      setState({
        kind: 'ok',
        execOk: data.execOk,
        uname: data.uname,
        remoteUser: data.remoteUser,
        sampleEntries: data.sampleEntries ?? [],
        note: data.note,
        diagnostics: data.diagnostics ?? [],
      })
    } else {
      setState({
        kind: 'err',
        error: data.error ?? 'erreur inconnue',
        diagnostics: data.diagnostics ?? [],
      })
    }
  }

  async function remove() {
    if (!confirm(`Supprimer ${machine.name} ?`)) return
    start(async () => {
      const res = await fetch(`/api/machines/${machine.id}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
      else alert('Suppression impossible.')
    })
  }

  return (
    <li className="grid grid-cols-[1fr_2fr_120px_140px_180px] gap-4 px-6 py-4 items-center hover:bg-ink-800/40 transition-colors">
      <div className="min-w-0">
        <div className="font-mono text-sm text-ink-100 truncate">{machine.name}</div>
        {machine.description && (
          <div className="text-xs text-ink-500 truncate mt-0.5">{machine.description}</div>
        )}
      </div>
      <div className="font-mono text-xs text-ink-300 truncate">
        {machine.username}@{machine.host}
        <span className="text-ink-500">:{machine.port}</span>
      </div>
      <div>
        <span className="pill">{machine.authType === 'key' ? 'ssh-key' : 'password'}</span>
      </div>
      <div>
        <StatusPill state={state} />
      </div>
      <div className="flex justify-end gap-2">
        <Link
          href={`/machines/${machine.id}/files`}
          className="btn-primary text-[10px] py-1 px-2"
        >
          browse
        </Link>
        <button
          onClick={test}
          disabled={state.kind === 'testing'}
          className="btn-ghost text-[10px] py-1 px-2"
        >
          {state.kind === 'testing' ? '…' : 'test'}
        </button>
        {canDelete && (
          <button
            onClick={remove}
            disabled={pending}
            className="btn-danger text-[10px] py-1 px-2"
          >
            del
          </button>
        )}
      </div>

      {state.kind === 'ok' && (
        <div className="col-span-5 -mt-1 space-y-1.5 font-mono text-[11px]">
          <div className="text-phosphor/80 border-l-2 border-phosphor pl-3">
            <span className="text-ink-500">$ sftp readdir →</span>{' '}
            {state.sampleEntries.length > 0
              ? state.sampleEntries.join('  ')
              : '(dossier vide)'}
          </div>
          {state.execOk && state.uname && (
            <div className="text-phosphor/60 border-l-2 border-phosphor/40 pl-3">
              <span className="text-ink-500">$ uname -a →</span> {state.uname}
              {state.remoteUser && (
                <span className="text-ink-500"> · user: {state.remoteUser}</span>
              )}
            </div>
          )}
          {state.note && <div className="text-amber/70 pl-3">⚠ {state.note}</div>}
          <DiagToggle
            show={showDiag}
            onToggle={() => setShowDiag(!showDiag)}
            diagnostics={state.diagnostics}
          />
        </div>
      )}

      {state.kind === 'err' && (
        <div className="col-span-5 -mt-1 space-y-1.5 font-mono text-[11px]">
          <div className="text-rust border-l-2 border-rust pl-3">{state.error}</div>
          <DiagToggle
            show={showDiag}
            onToggle={() => setShowDiag(!showDiag)}
            diagnostics={state.diagnostics}
          />
        </div>
      )}
    </li>
  )
}

function DiagToggle({
  show,
  onToggle,
  diagnostics,
}: {
  show: boolean
  onToggle: () => void
  diagnostics: string[]
}) {
  if (diagnostics.length === 0) return null
  return (
    <div className="pl-3">
      <button
        onClick={onToggle}
        className="mono-caps text-[9px] text-ink-500 hover:text-amber transition-colors"
      >
        {show ? '▾' : '▸'} diagnostics ({diagnostics.length})
      </button>
      {show && (
        <pre className="mt-2 p-3 bg-ink-950 border border-ink-800 rounded-sm text-ink-300 text-[10px] overflow-x-auto whitespace-pre-wrap">
          {diagnostics.join('\n')}
        </pre>
      )}
    </div>
  )
}

function StatusPill({ state }: { state: TestState }) {
  if (state.kind === 'testing')
    return (
      <span className="pill-warn">
        test…<span className="blink" />
      </span>
    )
  if (state.kind === 'ok')
    return <span className="pill-ok">● sftp ok{state.execOk ? ' + shell' : ''}</span>
  if (state.kind === 'err') return <span className="pill-err">● erreur</span>
  return <span className="pill">○ unknown</span>
}
