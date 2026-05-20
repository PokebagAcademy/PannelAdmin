import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NewRepoForm } from './new-form'

export default async function NewRepoPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session || role === 'viewer') redirect('/github')

  const install = await prisma.githubAppInstallation.findFirst()
  if (!install) redirect('/settings/github')

  return (
    <div className="p-8 lg:p-12 max-w-3xl">
      <header className="mb-10 animate-reveal">
        <Link
          href="/github"
          className="mono-caps text-[10px] text-ink-400 hover:text-amber transition-colors"
        >
          ← repos
        </Link>
        <p className="mono-caps text-xs text-amber mt-6 mb-3">// new repo</p>
        <h1 className="font-display text-5xl text-ink-100">Nouveau repo</h1>
        <p className="text-ink-400 mt-2">
          Créé via la GitHub App, sur ton organisation, avec un template Cobblemon
          prêt à compiler.
        </p>
      </header>

      <NewRepoForm
        defaultAuthor={session.user?.name ?? session.user?.email ?? ''}
      />
    </div>
  )
}
