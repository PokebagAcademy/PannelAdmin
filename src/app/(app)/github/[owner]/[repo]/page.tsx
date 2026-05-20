import Link from 'next/link'
import { RepoDetail } from './repo-detail'

export default async function RepoPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>
}) {
  const { owner, repo } = await params
  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <header className="mb-8 animate-reveal">
        <Link
          href="/github"
          className="mono-caps text-[10px] text-ink-400 hover:text-amber transition-colors"
        >
          ← repos
        </Link>
        <p className="mono-caps text-xs text-amber mt-6 mb-3">// {owner}</p>
        <h1 className="font-display text-5xl text-ink-100">{repo}</h1>
      </header>

      <RepoDetail owner={owner} repo={repo} />
    </div>
  )
}
