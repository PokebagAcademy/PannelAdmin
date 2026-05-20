import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cobblepanel',
  description: 'Panel d\'administration Cobblemon',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="relative">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  )
}
