import { signIn, auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (session) redirect('/dashboard')
  const { error } = await searchParams

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.2fr_1fr]">
      {/* Left — branding */}
      <section className="relative hidden lg:flex flex-col justify-between p-12 border-r border-ink-800 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-amber/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[20rem] h-[20rem] rounded-full bg-phosphor/5 blur-3xl" />

        <header className="relative flex items-center gap-3">
          <Logomark />
          <span className="mono-caps text-sm text-ink-300">cobblepanel</span>
          <span className="pill ml-auto">build · 0.1.0</span>
        </header>

        <div className="relative space-y-8 max-w-xl">
          <p className="mono-caps text-xs text-amber">// operations console</p>
          <h1 className="font-display text-6xl xl:text-7xl leading-[0.95] text-ink-100 text-balance">
            Le panel pour vos
            <br />
            <em className="text-amber not-italic font-normal">minestrators</em>.
          </h1>
          <p className="text-ink-300 text-lg max-w-md leading-relaxed">
            Un seul endroit pour SSH, déploiements, builds de mods et collaboration
            d'équipe sur votre serveur Cobblemon.
          </p>

          <div className="grid grid-cols-3 gap-px bg-ink-700 border border-ink-700">
            <Stat n="08" label="machines" />
            <Stat n="∞" label="déploiements" />
            <Stat n="03" label="rôles" />
          </div>
        </div>

        <footer className="relative mono-caps text-[10px] text-ink-500">
          <span className="prompt">accès restreint membres orga github</span>
        </footer>
      </section>

      {/* Right — login form */}
      <section className="flex flex-col justify-center p-8 lg:p-16 animate-reveal">
        <div className="max-w-sm w-full mx-auto space-y-8">
          <div className="lg:hidden flex items-center gap-3">
            <Logomark />
            <span className="mono-caps text-sm text-ink-300">cobblepanel</span>
          </div>

          <div>
            <p className="mono-caps text-xs text-amber mb-3">// authentification</p>
            <h2 className="font-display text-4xl text-ink-100">
              Identifiez-vous<span className="blink" />
            </h2>
            <p className="text-ink-400 text-sm mt-3">
              Seuls les membres de l&apos;organisation GitHub autorisée peuvent accéder
              au panel.
            </p>
          </div>

          {error && (
            <div className="border border-rust/40 bg-rust/5 p-3 rounded-sm">
              <p className="mono-caps text-[10px] text-rust mb-1">// erreur</p>
              <p className="text-sm text-ink-200">
                {errorMessages[error] ?? 'Connexion impossible.'}
              </p>
            </div>
          )}

          <form
            action={async () => {
              'use server'
              await signIn('github', { redirectTo: '/dashboard' })
            }}
          >
            <button type="submit" className="btn-primary w-full justify-center py-3">
              <GitHubIcon />
              <span>Continuer avec GitHub</span>
            </button>
          </form>

          <div className="border-t border-ink-800 pt-6">
            <p className="mono-caps text-[10px] text-ink-500 leading-relaxed">
              Votre clé Anthropic n&apos;est jamais requise pour vous connecter.
              <br />
              Elle sera demandée dans vos paramètres, plus tard.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

const errorMessages: Record<string, string> = {
  AccessDenied:
    "Tu n'es pas membre actif de l'organisation GitHub autorisée. Demande à un admin de t'inviter.",
  Configuration:
    "Configuration serveur incomplète. Préviens un admin (vérifier AUTH_GITHUB_* et ALLOWED_GITHUB_ORG).",
  Verification: 'Lien de vérification invalide ou expiré.',
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="bg-ink-900 p-4">
      <div className="font-display text-3xl text-amber">{n}</div>
      <div className="mono-caps text-[10px] text-ink-400 mt-1">{label}</div>
    </div>
  )
}

function Logomark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="2" y="2" width="28" height="28" stroke="#d8a04a" strokeWidth="1.5" />
      <rect x="7" y="7" width="8" height="8" fill="#d8a04a" />
      <rect x="17" y="7" width="8" height="8" stroke="#7fd396" strokeWidth="1.5" />
      <rect x="7" y="17" width="8" height="8" stroke="#7fd396" strokeWidth="1.5" />
      <rect x="17" y="17" width="8" height="8" fill="#7fd396" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.16c-3.2.69-3.88-1.36-3.88-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.71 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.9-.4.99.01 1.98.14 2.9.4 2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.84 1.18 3.1 0 4.44-2.69 5.41-5.25 5.7.41.36.78 1.05.78 2.12v3.14c0 .31.21.68.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}
