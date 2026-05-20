export type SftpEntry = {
  name: string
  type: 'dir' | 'file' | 'link'
  size: number
  mtime: number
  mode: number
}

export type ReadResponse =
  | {
      path: string
      size: number
      binary: false
      content: string
      language: string
      mtime: number
    }
  | {
      path: string
      size: number
      binary: true
      isImage?: boolean
      dataUrl?: string
      tooLarge?: boolean
      message?: string
    }

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatDate(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday)
    return `aujourd'hui ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  const dayMs = 24 * 3600 * 1000
  const diff = now.getTime() - d.getTime()
  if (diff < 7 * dayMs)
    return d.toLocaleDateString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function joinPath(base: string, name: string): string {
  if (base === '.' || base === '') return name
  if (base.endsWith('/')) return base + name
  return base + '/' + name
}

export function parentOf(path: string): string {
  if (path === '.' || path === '/' || path === '') return '.'
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  if (parts.length === 0) return path.startsWith('/') ? '/' : '.'
  return (path.startsWith('/') ? '/' : '') + parts.join('/')
}

export function pathSegments(path: string): { label: string; full: string }[] {
  if (path === '.' || path === '' || path === '/')
    return [{ label: '~', full: '.' }]
  const parts = path.split('/').filter(Boolean)
  const segs: { label: string; full: string }[] = [{ label: '~', full: '.' }]
  let acc = path.startsWith('/') ? '' : ''
  for (const p of parts) {
    acc = acc ? acc + '/' + p : path.startsWith('/') ? '/' + p : p
    segs.push({ label: p, full: acc })
  }
  return segs
}
