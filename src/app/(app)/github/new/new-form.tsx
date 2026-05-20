'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Template = 'cobblemon-fabric-1.21.1' | 'none'

export function NewRepoForm({ defaultAuthor }: { defaultAuthor: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'internal' | 'public'>(
    'private',
  )
  const [template, setTemplate] = useState<Template>('cobblemon-fabric-1.21.1')

  const [modId, setModId] = useState('')
  const [modName, setModName] = useState('')
  const [modGroup, setModGroup] = useState('com.example.mymod')
  const [mainClass, setMainClass] = useState('')
  const [authors, setAuthors] = useState(defaultAuthor)

  // Auto-derive mod fields from repo name unless user edited them
  const [modTouched, setModTouched] = useState(false)
  const derived = useMemo(() => {
    const slug = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
    const pascal = name
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() + p.slice(1).toLowerCase())
      .join('') || 'Mod'
    return {
      modId: slug || 'mymod',
      modName: name || 'My Mod',
      mainClass: pascal,
    }
  }, [name])

  const effective = modTouched
    ? { modId, modName, mainClass }
    : derived

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const payload: Record<string, unknown> = {
      name,
      description,
      visibility,
      template,
    }
    if (template !== 'none') {
      payload.mod = {
        modId: effective.modId,
        modName: effective.modName,
        modGroup,
        mainClass: effective.mainClass,
        authors,
      }
    }

    start(async () => {
      const res = await fetch('/api/github/repos/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'name_taken') {
          setError('Ce nom de repo est déjà pris dans ton organisation.')
        } else if (data.hint) {
          setError(data.hint)
        } else {
          setError(typeof data.error === 'string' ? data.error : 'Création échouée.')
        }
        return
      }
      router.push(`/github/${data.fullName.split('/')[0]}/${data.fullName.split('/')[1]}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6 animate-reveal">
      <div className="card p-6 space-y-5">
        <h2 className="mono-caps text-xs text-amber">// identité du repo</h2>
        <div>
          <label className="label" htmlFor="name">Nom du repo</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="cobblemod-foo"
            pattern="[A-Za-z0-9][A-Za-z0-9\-_.]*"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            placeholder="A Cobblemon side-mod that adds custom shrines and rituals."
            className="input"
          />
        </div>
        <div>
          <div className="label">Visibilité</div>
          <div className="grid grid-cols-3 gap-px bg-ink-700 border border-ink-700">
            {(['private', 'internal', 'public'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={`p-3 mono-caps text-xs transition-colors ${
                  visibility === v
                    ? 'bg-ink-700 text-amber'
                    : 'bg-ink-900 text-ink-400 hover:text-ink-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-5">
        <h2 className="mono-caps text-xs text-amber">// template de départ</h2>
        <div>
          <div className="grid grid-cols-2 gap-px bg-ink-700 border border-ink-700">
            <button
              type="button"
              onClick={() => setTemplate('cobblemon-fabric-1.21.1')}
              className={`p-3 mono-caps text-xs transition-colors ${
                template === 'cobblemon-fabric-1.21.1'
                  ? 'bg-ink-700 text-amber'
                  : 'bg-ink-900 text-ink-400 hover:text-ink-200'
              }`}
            >
              Cobblemon · Fabric · 1.21.1
            </button>
            <button
              type="button"
              onClick={() => setTemplate('none')}
              className={`p-3 mono-caps text-xs transition-colors ${
                template === 'none'
                  ? 'bg-ink-700 text-amber'
                  : 'bg-ink-900 text-ink-400 hover:text-ink-200'
              }`}
            >
              repo vide
            </button>
          </div>
          <p className="mt-2 text-[10px] font-mono text-ink-500">
            {template === 'cobblemon-fabric-1.21.1'
              ? 'Inclut build.gradle.kts (Fabric Loom), main class Kotlin, fabric.mod.json, GitHub Actions de build.'
              : 'Crée un repo vide avec uniquement un README initial.'}
          </p>
        </div>
      </div>

      {template !== 'none' && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="mono-caps text-xs text-amber">// identité du mod</h2>
            {!modTouched && (
              <button
                type="button"
                onClick={() => {
                  setModId(derived.modId)
                  setModName(derived.modName)
                  setMainClass(derived.mainClass)
                  setModTouched(true)
                }}
                className="mono-caps text-[10px] text-ink-500 hover:text-amber transition-colors"
              >
                personnaliser
              </button>
            )}
          </div>

          {!modTouched ? (
            <div className="bg-ink-950 border border-ink-800 p-4 space-y-1.5 font-mono text-xs">
              <Row label="modId">{derived.modId}</Row>
              <Row label="modName">{derived.modName}</Row>
              <Row label="mainClass">{derived.mainClass}</Row>
              <Row label="modGroup">{modGroup}</Row>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="modId">modId (snake_case)</label>
                  <input
                    id="modId"
                    value={modId}
                    onChange={(e) => setModId(e.target.value)}
                    pattern="[a-z][a-z0-9_]*"
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="mainClass">mainClass</label>
                  <input
                    id="mainClass"
                    value={mainClass}
                    onChange={(e) => setMainClass(e.target.value)}
                    pattern="[A-Z][A-Za-z0-9]*"
                    required
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="modName">Nom affiché</label>
                <input
                  id="modName"
                  value={modName}
                  onChange={(e) => setModName(e.target.value)}
                  required
                  className="input"
                />
              </div>
            </>
          )}

          <div>
            <label className="label" htmlFor="modGroup">Package Kotlin</label>
            <input
              id="modGroup"
              value={modGroup}
              onChange={(e) => setModGroup(e.target.value)}
              pattern="[a-z][a-z0-9_.]*"
              required
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="authors">Auteurs (virgule)</label>
            <input
              id="authors"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              required
              className="input"
            />
          </div>
        </div>
      )}

      {error && (
        <div className="border border-rust/40 bg-rust/5 p-3 rounded-sm font-mono text-sm text-rust">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push('/github')}
          className="btn-ghost"
        >
          annuler
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'création…' : 'créer le repo'}
        </button>
      </div>
    </form>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-500">{label}</span>
      <span className="text-amber">{children}</span>
    </div>
  )
}
