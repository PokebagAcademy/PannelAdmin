'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { formatSize, type ReadResponse } from './types'

const MonacoEditor = dynamic(() => import('./monaco-editor').then((m) => m.MonacoEditor), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center mono-caps text-[10px] text-ink-500">
      chargement de l&apos;éditeur<span className="blink" />
    </div>
  ),
})

export function FileViewer({
  path,
  content,
  loading,
  canWrite,
  onSave,
  onReload,
  onDownload,
  onClose,
}: {
  path: string
  content: ReadResponse | null
  loading: boolean
  canWrite: boolean
  onSave: (newContent: string) => Promise<{ ok: boolean; error?: string }>
  onReload?: () => void
  onDownload: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<string>('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'saved'; at: number }
    | { kind: 'error'; msg: string }
  >({ kind: 'idle' })

  // Reset draft when content changes (new file loaded)
  useEffect(() => {
    if (content && !content.binary) {
      setDraft(content.content)
      setDirty(false)
      setSaveStatus({ kind: 'idle' })
    }
  }, [content])

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && canWrite && content && !content.binary) void doSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, canWrite, content, draft])

  async function doSave() {
    if (!content || content.binary) return
    setSaving(true)
    setSaveStatus({ kind: 'idle' })
    const res = await onSave(draft)
    setSaving(false)
    if (res.ok) {
      setDirty(false)
      setSaveStatus({ kind: 'saved', at: Date.now() })
      setTimeout(() => setSaveStatus({ kind: 'idle' }), 3000)
    } else {
      setSaveStatus({ kind: 'error', msg: res.error ?? 'erreur' })
    }
  }

  const name = path.split('/').pop() ?? path

  return (
    <>
      <div className="px-6 py-3 border-b border-ink-800 flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm text-ink-100 truncate">{name}</span>
            {dirty && <span className="text-amber text-xs shrink-0">●</span>}
          </div>
          <div className="font-mono text-[10px] text-ink-500 truncate">{path}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveStatus.kind === 'saved' && (
            <span className="mono-caps text-[10px] text-phosphor">✓ sauvegardé</span>
          )}
          {saveStatus.kind === 'error' && (
            <span className="mono-caps text-[10px] text-rust">✗ {saveStatus.msg}</span>
          )}
          {content && !content.binary && canWrite && (
            <button
              onClick={doSave}
              disabled={!dirty || saving}
              className="btn-primary text-[10px] py-1 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'sauve…' : 'save (⌘s)'}
            </button>
          )}
          {onReload && (
            <button
              onClick={onReload}
              disabled={loading || dirty}
              title={dirty ? 'Sauvegarde ou annule tes modifications d\'abord' : 'Recharger depuis le serveur'}
              className="btn-ghost text-[10px] py-1 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↻ reload
            </button>
          )}
          <button onClick={onDownload} className="btn-ghost text-[10px] py-1 px-3">
            download
          </button>
          <button
            onClick={onClose}
            className="mono-caps text-[10px] text-ink-400 hover:text-amber px-2"
            title="Fermer"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center mono-caps text-[10px] text-ink-500">
            lecture du fichier<span className="blink" />
          </div>
        ) : !content ? (
          <div className="flex-1" />
        ) : content.binary ? (
          <BinaryView content={content} onDownload={onDownload} />
        ) : (
          <>
            <MonacoEditor
              value={draft}
              language={content.language}
              readOnly={!canWrite}
              onChange={(v) => {
                setDraft(v)
                setDirty(v !== content.content)
              }}
            />
            <div className="border-t border-ink-800 px-4 py-1.5 mono-caps text-[9px] text-ink-500 flex items-center justify-between shrink-0">
              <span>
                {content.language} · {formatSize(content.size)} · {draft.length.toLocaleString()} chars
              </span>
              <span>{canWrite ? 'rw' : 'ro'}</span>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function BinaryView({
  content,
  onDownload,
}: {
  content: Extract<ReadResponse, { binary: true }>
  onDownload: () => void
}) {
  if (content.isImage && content.dataUrl) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 overflow-auto bg-ink-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={content.dataUrl}
          alt=""
          className="max-w-full max-h-full object-contain border border-ink-800"
        />
      </div>
    )
  }
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="text-center max-w-sm">
        <div className="mono-caps text-[10px] text-amber mb-3">// fichier binaire</div>
        <p className="font-display text-2xl text-ink-200 mb-3">
          {content.tooLarge ? 'Trop volumineux' : 'Non éditable'}
        </p>
        <p className="text-sm text-ink-500 font-mono leading-relaxed mb-6">
          {content.message ?? 'Ce fichier ne peut pas être affiché dans l\'éditeur.'}
          <br />
          Taille : {formatSize(content.size)}
        </p>
        <button onClick={onDownload} className="btn-primary">
          télécharger
        </button>
      </div>
    </div>
  )
}
