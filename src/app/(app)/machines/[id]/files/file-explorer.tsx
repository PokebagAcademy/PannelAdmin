'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type SftpEntry,
  type ReadResponse,
  formatSize,
  formatDate,
  joinPath,
  pathSegments,
  parentOf,
} from './types'
import { FileViewer } from './file-viewer'

type SearchHit = {
  name: string
  path: string
  type: 'file' | 'dir' | 'link'
  size: number
  mtime: number
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'searching'; q: string }
  | {
      kind: 'done'
      q: string
      hits: SearchHit[]
      scanned: number
      truncated: boolean
      durationCap: boolean
      durationMs: number
    }
  | { kind: 'error'; q: string; msg: string }

export function FileExplorer({
  machineId,
  canWrite,
  initialPath,
}: {
  machineId: string
  canWrite: boolean
  initialPath: string
}) {
  const [path, setPath] = useState(initialPath)
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<ReadResponse | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Search state ---
  const [searchInput, setSearchInput] = useState('')
  const [includeAll, setIncludeAll] = useState(false)
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' })
  const searchCtrlRef = useRef<AbortController | null>(null)

  // --- URL sync ---
  useEffect(() => {
    const url = new URL(window.location.href)
    if (path === '.') url.searchParams.delete('path')
    else url.searchParams.set('path', path)
    window.history.replaceState(null, '', url.toString())
  }, [path])

  // --- Load directory listing ---
  const loadDir = useCallback(
    async (p: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/sftp/${machineId}/list?path=${encodeURIComponent(p)}`)
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'erreur')
          setEntries([])
        } else {
          setEntries(data.entries)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'erreur réseau')
        setEntries([])
      } finally {
        setLoading(false)
      }
    },
    [machineId],
  )

  useEffect(() => {
    loadDir(path)
    setSelected(null)
    setFileContent(null)
  }, [path, loadDir])

  // --- Open file ---
  async function openFile(name: string, fullOverride?: string) {
    const full = fullOverride ?? joinPath(path, name)
    setSelected(full)
    setFileContent(null)
    setFileLoading(true)
    try {
      const res = await fetch(`/api/sftp/${machineId}/read?path=${encodeURIComponent(full)}`)
      const data = (await res.json()) as ReadResponse
      setFileContent(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lecture impossible')
    } finally {
      setFileLoading(false)
    }
  }

  // --- Save ---
  async function saveFile(newContent: string): Promise<{ ok: boolean; error?: string }> {
    if (!selected) return { ok: false, error: 'no_selection' }
    const res = await fetch(
      `/api/sftp/${machineId}/write?path=${encodeURIComponent(selected)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        body: newContent,
      },
    )
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error ?? 'sauvegarde impossible' }
    void loadDir(path)
    return { ok: true }
  }

  // --- Uploads ---
  async function uploadFiles(files: FileList | File[]) {
    if (!canWrite) return
    setUploading(true)
    setUploadProgress(Array.from(files).map((f) => `${f.name} : en attente…`))
    const fd = new FormData()
    for (const f of Array.from(files)) fd.append('file', f)
    try {
      const res = await fetch(
        `/api/sftp/${machineId}/upload?path=${encodeURIComponent(path)}`,
        { method: 'POST', body: fd },
      )
      const data = await res.json()
      if (Array.isArray(data.results)) {
        setUploadProgress(
          data.results.map((r: { name: string; ok: boolean; size?: number; error?: string }) =>
            r.ok ? `${r.name} : OK (${formatSize(r.size ?? 0)})` : `${r.name} : ${r.error}`,
          ),
        )
      }
      void loadDir(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload impossible')
    } finally {
      setUploading(false)
      setTimeout(() => setUploadProgress([]), 5000)
    }
  }

  function onDragOver(e: React.DragEvent) {
    if (!canWrite) return
    e.preventDefault()
    setDragOver(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (!canWrite) return
    if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files)
  }

  async function deleteEntry(name: string, type: SftpEntry['type'], fullOverride?: string) {
    const full = fullOverride ?? joinPath(path, name)
    const what = type === 'dir' ? `le dossier "${name}" et tout son contenu` : `"${name}"`
    if (!confirm(`Supprimer ${what} ?`)) return
    const res = await fetch(`/api/sftp/${machineId}/delete?path=${encodeURIComponent(full)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Suppression impossible : ${data.error ?? 'erreur'}`)
      return
    }
    if (selected === full) {
      setSelected(null)
      setFileContent(null)
    }
    void loadDir(path)
    // Refresh search results if we're in search view
    if (search.kind === 'done') void runSearch(search.q)
  }

  async function createFolder() {
    const name = prompt('Nom du nouveau dossier :')
    if (!name) return
    const res = await fetch(`/api/sftp/${machineId}/mkdir`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parent: path, name }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Création impossible : ${data.error ?? 'erreur'}`)
      return
    }
    void loadDir(path)
  }

  async function renameEntry(oldName: string) {
    const newName = prompt('Nouveau nom :', oldName)
    if (!newName || newName === oldName) return
    const from = joinPath(path, oldName)
    const to = joinPath(path, newName)
    const res = await fetch(`/api/sftp/${machineId}/rename`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, to }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Renommage impossible : ${data.error ?? 'erreur'}`)
      return
    }
    void loadDir(path)
  }

  function downloadEntry(name: string, fullOverride?: string) {
    const full = fullOverride ?? joinPath(path, name)
    window.location.href = `/api/sftp/${machineId}/download?path=${encodeURIComponent(full)}`
  }

  // --- Search ---
  async function runSearch(q: string) {
    if (!q.trim()) return
    // Cancel any in-flight search
    searchCtrlRef.current?.abort()
    const ctrl = new AbortController()
    searchCtrlRef.current = ctrl

    setSearch({ kind: 'searching', q })
    try {
      const params = new URLSearchParams({ q, path })
      if (includeAll) params.set('includeAll', '1')
      const res = await fetch(`/api/sftp/${machineId}/search?${params}`, {
        signal: ctrl.signal,
      })
      const data = await res.json()
      if (!res.ok) {
        setSearch({ kind: 'error', q, msg: data.error ?? 'erreur' })
        return
      }
      setSearch({
        kind: 'done',
        q,
        hits: data.hits,
        scanned: data.scanned,
        truncated: data.truncated,
        durationCap: data.durationCap,
        durationMs: data.durationMs,
      })
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      setSearch({
        kind: 'error',
        q,
        msg: err instanceof Error ? err.message : 'erreur réseau',
      })
    }
  }

  function clearSearch() {
    searchCtrlRef.current?.abort()
    setSearchInput('')
    setSearch({ kind: 'idle' })
  }

  function navigateTo(hit: SearchHit) {
    if (hit.type === 'dir') {
      setPath(hit.path)
      clearSearch()
    } else {
      const parent = parentOf(hit.path)
      // Navigate to parent dir AND open the file
      setPath(parent)
      // Slight delay so the dir listing reloads then we open
      setTimeout(() => openFile(hit.name, hit.path), 50)
      clearSearch()
    }
  }

  const segs = pathSegments(path)
  const inSearchMode = search.kind !== 'idle'

  return (
    <div
      className="flex-1 grid grid-cols-[420px_1fr] min-h-0"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <section className="border-r border-ink-800 flex flex-col min-h-0 relative">
        {/* Breadcrumb */}
        <div className="px-4 py-3 border-b border-ink-800 shrink-0 flex items-center gap-1 overflow-x-auto">
          {segs.map((s, i) => (
            <span key={s.full} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="text-ink-600 font-mono text-xs">/</span>}
              <button
                onClick={() => setPath(s.full)}
                className={`mono-caps text-[11px] hover:text-amber transition-colors ${
                  i === segs.length - 1 ? 'text-amber' : 'text-ink-300'
                }`}
              >
                {s.label}
              </button>
            </span>
          ))}
        </div>

        {/* Search bar */}
        <div className="px-4 py-2 border-b border-ink-800 shrink-0 space-y-1.5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void runSearch(searchInput)
            }}
            className="flex items-center gap-1.5"
          >
            <div className="relative flex-1">
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    clearSearch()
                  }
                }}
                placeholder="chercher (entrée pour lancer)…"
                className="input pl-7 py-1 text-xs"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500 font-mono text-xs">
                ⌕
              </span>
              {inSearchMode && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-amber font-mono text-[10px]"
                  title="Échap"
                >
                  ✕
                </button>
              )}
            </div>
          </form>
          <label className="flex items-center gap-1.5 mono-caps text-[9px] text-ink-500 cursor-pointer hover:text-ink-300">
            <input
              type="checkbox"
              checked={includeAll}
              onChange={(e) => setIncludeAll(e.target.checked)}
              className="accent-amber w-3 h-3"
            />
            inclure logs, world/region, cache…
          </label>
        </div>

        {/* Toolbar (only when not searching) */}
        {!inSearchMode && (
          <div className="px-4 py-2 border-b border-ink-800 shrink-0 flex items-center gap-2 text-[10px]">
            <button
              onClick={() => loadDir(path)}
              className="mono-caps text-ink-400 hover:text-amber transition-colors px-2 py-1"
            >
              ↻ refresh
            </button>
            {path !== '.' && (
              <button
                onClick={() => setPath(parentOf(path))}
                className="mono-caps text-ink-400 hover:text-amber transition-colors px-2 py-1"
              >
                ↑ parent
              </button>
            )}
            {canWrite && (
              <>
                <span className="text-ink-700">|</span>
                <button
                  onClick={createFolder}
                  className="mono-caps text-ink-400 hover:text-amber transition-colors px-2 py-1"
                >
                  + dossier
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mono-caps text-ink-400 hover:text-amber transition-colors px-2 py-1"
                >
                  ↑ upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void uploadFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </>
            )}
          </div>
        )}

        {/* Body — either directory listing or search results */}
        <div className="flex-1 overflow-y-auto">
          {inSearchMode ? (
            <SearchView
              state={search}
              canWrite={canWrite}
              onSelect={navigateTo}
              onDownload={(h) => downloadEntry(h.name, h.path)}
              onDelete={(h) => deleteEntry(h.name, h.type, h.path)}
            />
          ) : loading ? (
            <div className="p-6 mono-caps text-[10px] text-ink-500">
              lecture du dossier<span className="blink" />
            </div>
          ) : error ? (
            <div className="p-6 font-mono text-xs text-rust">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-6 mono-caps text-[10px] text-ink-500">dossier vide</div>
          ) : (
            <ul>
              {entries.map((e) => (
                <li
                  key={e.name}
                  className={`group relative px-4 py-1.5 flex items-center gap-3 cursor-pointer transition-colors ${
                    selected === joinPath(path, e.name)
                      ? 'bg-amber/10 border-l-2 border-amber pl-[14px]'
                      : 'hover:bg-ink-800/40 border-l-2 border-transparent'
                  }`}
                  onClick={() => {
                    if (e.type === 'dir') setPath(joinPath(path, e.name))
                    else void openFile(e.name)
                  }}
                  onDoubleClick={() => {
                    if (e.type !== 'dir') downloadEntry(e.name)
                  }}
                >
                  <EntryIcon type={e.type} name={e.name} />
                  <span className="flex-1 min-w-0 font-mono text-sm text-ink-100 truncate">
                    {e.name}
                  </span>
                  <span className="font-mono text-[10px] text-ink-400 shrink-0 w-16 text-right">
                    {e.type === 'dir' ? '—' : formatSize(e.size)}
                  </span>
                  <span className="font-mono text-[10px] text-ink-400 w-24 text-right shrink-0 hidden xl:block">
                    {formatDate(e.mtime)}
                  </span>

                  {/* Actions overlay — covers the right edge on hover so they're always reachable */}
                  <div className="absolute inset-y-0 right-0 pl-4 pr-4 flex items-center gap-1 bg-gradient-to-l from-ink-900 via-ink-900/95 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    {e.type === 'file' && (
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation()
                          downloadEntry(e.name)
                        }}
                        title="Télécharger"
                        className="px-2 py-0.5 mono-caps text-[10px] text-ink-200 hover:text-amber"
                      >
                        dl
                      </button>
                    )}
                    {canWrite && (
                      <>
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation()
                            void renameEntry(e.name)
                          }}
                          title="Renommer"
                          className="px-2 py-0.5 mono-caps text-[10px] text-ink-200 hover:text-amber"
                        >
                          mv
                        </button>
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation()
                            void deleteEntry(e.name, e.type)
                          }}
                          title="Supprimer"
                          className="px-2 py-0.5 mono-caps text-[10px] text-ink-200 hover:text-rust"
                        >
                          rm
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {uploadProgress.length > 0 && (
          <div className="border-t border-ink-800 p-3 bg-ink-900 max-h-32 overflow-y-auto shrink-0">
            <div className="mono-caps text-[9px] text-amber mb-1">
              {uploading ? 'uploading' : 'upload terminé'}
            </div>
            <ul className="space-y-0.5 font-mono text-[10px] text-ink-300">
              {uploadProgress.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {dragOver && canWrite && (
          <div className="absolute inset-0 z-10 bg-amber/10 border-2 border-dashed border-amber flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="font-display text-3xl text-amber mb-2">Déposer ici</p>
              <p className="mono-caps text-[10px] text-amber">
                upload vers {path === '.' ? '~' : path}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col min-h-0">
        {selected ? (
          <FileViewer
            path={selected}
            content={fileContent}
            loading={fileLoading}
            canWrite={canWrite}
            onSave={saveFile}
            onReload={() => void openFile(selected.split('/').pop() ?? '', selected)}
            onDownload={() => {
              const name = selected.split('/').pop() ?? ''
              downloadEntry(name, selected)
            }}
            onClose={() => {
              setSelected(null)
              setFileContent(null)
            }}
          />
        ) : (
          <EmptyState canWrite={canWrite} />
        )}
      </section>
    </div>
  )
}

function SearchView({
  state,
  canWrite,
  onSelect,
  onDownload,
  onDelete,
}: {
  state: SearchState
  canWrite: boolean
  onSelect: (h: SearchHit) => void
  onDownload: (h: SearchHit) => void
  onDelete: (h: SearchHit) => void
}) {
  if (state.kind === 'idle') return null

  if (state.kind === 'searching')
    return (
      <div className="p-6 mono-caps text-[10px] text-ink-500">
        recherche &quot;{state.q}&quot;<span className="blink" />
      </div>
    )

  if (state.kind === 'error')
    return (
      <div className="p-6 font-mono text-xs text-rust">
        erreur recherche : {state.msg}
      </div>
    )

  return (
    <>
      <div className="px-4 py-2 border-b border-ink-800 bg-ink-900/50 sticky top-0 z-[1]">
        <div className="mono-caps text-[9px] text-ink-400 flex items-center justify-between">
          <span>
            <span className="text-amber">{state.hits.length}</span> résultat
            {state.hits.length > 1 ? 's' : ''} ·{' '}
            <span className="text-ink-500">{state.scanned} scannés</span> ·{' '}
            <span className="text-ink-500">{(state.durationMs / 1000).toFixed(1)}s</span>
          </span>
          {(state.truncated || state.durationCap) && (
            <span className="text-amber">
              ⚠ {state.durationCap ? 'temps' : 'limite'} atteint
            </span>
          )}
        </div>
      </div>
      {state.hits.length === 0 ? (
        <div className="p-6 mono-caps text-[10px] text-ink-500">
          aucun fichier ne correspond à &quot;{state.q}&quot;
        </div>
      ) : (
        <ul>
          {state.hits.map((h) => (
            <li
              key={h.path}
              className="group px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-ink-800/40 transition-colors border-l-2 border-transparent"
              onClick={() => onSelect(h)}
            >
              <EntryIcon type={h.type} name={h.name} />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm text-ink-100 truncate">{h.name}</div>
                <div className="font-mono text-[10px] text-ink-500 truncate">{h.path}</div>
              </div>
              <span className="font-mono text-[10px] text-ink-500 shrink-0">
                {h.type === 'dir' ? '—' : formatSize(h.size)}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {h.type === 'file' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDownload(h)
                    }}
                    className="px-1.5 py-0.5 mono-caps text-[9px] text-ink-400 hover:text-amber"
                  >
                    dl
                  </button>
                )}
                {canWrite && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(h)
                    }}
                    className="px-1.5 py-0.5 mono-caps text-[9px] text-ink-400 hover:text-rust"
                  >
                    rm
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function EntryIcon({ type, name }: { type: 'dir' | 'file' | 'link'; name: string }) {
  if (type === 'dir')
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <path
          d="M1.5 3.5 A1 1 0 0 1 2.5 2.5 H6 L7.5 4 H13.5 A1 1 0 0 1 14.5 5 V12.5 A1 1 0 0 1 13.5 13.5 H2.5 A1 1 0 0 1 1.5 12.5 Z"
          fill="#d8a04a"
          fillOpacity="0.2"
          stroke="#d8a04a"
          strokeWidth="1.2"
        />
      </svg>
    )
  if (type === 'link')
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <path d="M6 10 L10 6 M6 6 H10 V10" stroke="#7fd396" strokeWidth="1.5" fill="none" />
        <rect x="2" y="2" width="12" height="12" stroke="#7fd396" strokeWidth="1" fill="none" />
      </svg>
    )
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const isImage = /^(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(ext)
  const isArchive = /^(zip|tar|gz|tgz|rar|7z|jar)$/.test(ext)
  const color = isImage ? '#7fd396' : isArchive ? '#c4523a' : '#9aa39a'
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path
        d="M3 1.5 H9.5 L13 5 V14 A0.5 0.5 0 0 1 12.5 14.5 H3 A0.5 0.5 0 0 1 2.5 14 V2 A0.5 0.5 0 0 1 3 1.5 Z"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
      />
      <path d="M9.5 1.5 V5 H13" stroke={color} strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function EmptyState({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="text-center max-w-sm">
        <div className="mono-caps text-[10px] text-amber mb-4">// viewer idle</div>
        <p className="font-display text-3xl text-ink-200 mb-3">
          Sélectionne un fichier<span className="blink" />
        </p>
        <p className="text-sm text-ink-400 font-mono leading-relaxed">
          Clique sur un fichier pour le visualiser ou l&apos;éditer.
          <br />
          Tape un nom dans la barre de recherche puis <kbd className="text-amber">↵</kbd>{' '}
          pour chercher récursivement.
          {canWrite && (
            <>
              <br />
              Glisse-dépose des fichiers dans le panneau de gauche pour les uploader.
            </>
          )}
        </p>
      </div>
    </div>
  )
}