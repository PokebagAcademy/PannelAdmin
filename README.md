# Cobblepanel — Phase 1

Panel d'administration pour serveur Minecraft Cobblemon multi-machines.
Phase 1 = fondations : auth GitHub, gestion machines SFTP, layout du panel.

## Stack

- **Next.js 15** (App Router, TypeScript, Server Components)
- **Auth.js v5** avec GitHub OAuth restreint à une organisation
- **Prisma 5** + **PostgreSQL 16**
- **Redis 7** (sessions, queues à venir)
- **Tailwind CSS** + design system custom (dark-mode-first, terminal-inspired)
- **node-ssh** pour les tests de connexion SSH
- **Docker Compose** pour le déploiement

## Prérequis

- Docker + Docker Compose
- Une GitHub OAuth App (Settings → Developer settings → OAuth Apps → New)
  - Homepage URL: `https://panel.tondomaine.tld` (ou `http://localhost:3000` en dev)
  - Authorization callback URL: `<URL>/api/auth/callback/github`
- Le slug de ton organisation GitHub

## Configuration

1. Copier `.env.example` vers `.env` :
   ```bash
   cp .env.example .env
   ```
2. Remplir toutes les variables (voir commentaires dans le fichier).
3. **Générer les secrets** :
   ```bash
   # AUTH_SECRET
   openssl rand -base64 32
   # ENCRYPTION_KEY (32 bytes hex = 64 chars)
   openssl rand -hex 32
   ```

## Lancement (dev)

```bash
docker compose up -d postgres redis
pnpm install
pnpm prisma migrate dev
pnpm dev
```

## Lancement (prod, sur ton VPS)

```bash
docker compose up -d --build
docker compose exec app pnpm prisma migrate deploy
```

## Premier admin

Au premier login d'un membre de ton orga GitHub, son compte est créé en
base avec le rôle `viewer`. Pour le passer admin :

```bash
docker compose exec postgres psql -U cobble -d cobblepanel \
  -c "UPDATE \"User\" SET role = 'admin' WHERE email = 'toi@example.com';"
```

Ensuite tu peux promouvoir/gérer les autres depuis l'UI.

## Roadmap

- **Phase 1** (cette release) — Auth + machines + scaffold UI ✅
- **Phase 2** — File browser SFTP + Monaco editor + drag/drop upload
- **Phase 3** — GitHub App, repos, PRs depuis le panel
- **Phase 4** — Chat Claude in-app (BYOK) + tool use loop
- **Phase 4b** — MCP server remote pour l'équipe
- **Phase 5** — Sandbox Docker builds + deploy automatisé
