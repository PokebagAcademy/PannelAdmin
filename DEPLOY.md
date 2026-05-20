# Cobblepanel — Déploiement en production

Guide pour mettre le panel en prod sur un VPS Linux qui héberge déjà un
site sous Nginx avec certbot, en ajoutant un sous-domaine dédié.

**Exemple utilisé** : ton site principal est `tonsite.com`, et tu veux
mettre le panel sur `cobblepanel.tonsite.com`. Remplace par tes vrais
noms partout.

---

## 1. Ajouter le sous-domaine en DNS

Sur ton registrar (OVH, Gandi, Cloudflare…), zone DNS de `tonsite.com` :

| Type | Sous-domaine | Cible |
|---|---|---|
| **A** | `cobblepanel` | IP de ton VPS |

C'est exactement le même type d'entrée que pour `www` ou tout sous-domaine.
Si Cloudflare, laisse le nuage **gris (DNS only)** — sinon Cloudflare proxy
les requêtes et le certbot HTTP-01 ne marche plus.

Propagation : quelques minutes à 1h max. Vérifie :
```bash
dig +short cobblepanel.tonsite.com
# Doit retourner l'IP de ton VPS
```

---

## 2. Prérequis sur le VPS

Tu as déjà Nginx + certbot, donc juste Docker à vérifier :

```bash
docker --version          # → 20.x ou plus
docker compose version    # → v2.x (note: sans tiret)
```

Si Docker manque :
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# Reconnecte-toi pour que le groupe prenne effet
```

---

## 3. Déposer le projet

Choisis un dossier où mettre le projet sur le VPS, par exemple `/opt/cobblepanel` :

```bash
sudo mkdir -p /opt/cobblepanel
sudo chown $USER:$USER /opt/cobblepanel
```

**Option A — git clone** (si tu as poussé le projet sur ton orga GitHub) :
```bash
cd /opt/cobblepanel
git clone git@github.com:TON-ORG/cobblepanel.git .
```

**Option B — rsync depuis ton poste de dev** :
```bash
# Depuis ton poste local, à la racine du projet local
rsync -avz --exclude node_modules --exclude .next --exclude .env \
  ./ user@ton-vps:/opt/cobblepanel/
```

---

## 4. Remplacer le docker-compose par la version prod

À la racine du projet sur le VPS :
```bash
cd /opt/cobblepanel
mv docker-compose.yml docker-compose.dev.yml.bak   # backup du dev
mv docker-compose.prod.yml docker-compose.yml
```

Différences avec le dev :
- Postgres et Redis ne sont **plus exposés** publiquement (uniquement sur le réseau Docker interne)
- L'app bind sur `127.0.0.1:3000` — Nginx est le seul à pouvoir y accéder
- `AUTH_TRUST_HOST=true` ajouté pour qu'Auth.js fasse confiance aux headers `X-Forwarded-*` de Nginx
- Restart `unless-stopped` partout

---

## 5. Variables d'environnement

```bash
cd /opt/cobblepanel
cp .env.prod.example .env
chmod 600 .env   # sécurité : seul ton user peut lire

# Générer les secrets
openssl rand -base64 32      # → AUTH_SECRET
openssl rand -hex 32         # → ENCRYPTION_KEY
openssl rand -base64 24 | tr -d '+/=' | head -c 32   # → POSTGRES_PASSWORD
```

Édite `.env` (avec `nano .env` par exemple) et remplis :

```env
NEXTAUTH_URL=https://cobblepanel.tonsite.com
AUTH_SECRET=<le résultat du openssl rand -base64 32>
POSTGRES_PASSWORD=<celui généré>
ENCRYPTION_KEY=<le 64-char hex généré>

# GitHub OAuth — réutilise dev pour l'instant
AUTH_GITHUB_ID=<même qu'en dev>
AUTH_GITHUB_SECRET=<même qu'en dev>
ALLOWED_GITHUB_ORG=<ton-orga>

# GitHub App — réutilise dev
GITHUB_APP_ID=<même qu'en dev>
GITHUB_APP_CLIENT_ID=<même qu'en dev>
GITHUB_APP_CLIENT_SECRET=<même qu'en dev>
GITHUB_APP_PRIVATE_KEY=<même qu'en dev (single-line avec \n)>
GITHUB_APP_SLUG=<même qu'en dev>
```

> ⚠️ Pour `ENCRYPTION_KEY` : si tu veux pouvoir restaurer un dump SQL de
> tes machines depuis ton dev plus tard, **utilise la même qu'en dev**.
> Sinon génère-en une nouvelle (ta prod sera vierge, faudra redéclarer
> les machines).

---

## 6. Build et lancer les containers

```bash
docker compose up -d --build
# Premier démarrage : 3-5 minutes (build Next + Prisma)

# Voir où on en est
docker compose logs -f app
# Ctrl+C pour quitter les logs (l'app continue de tourner)

# Appliquer les migrations DB
docker compose exec app pnpm prisma migrate deploy

# Sanity check : l'app doit répondre en local
curl -I http://127.0.0.1:3000
# → HTTP/1.1 200 ou 307 redirect vers /login
```

À ce stade ton app tourne mais elle est invisible depuis l'extérieur :
seul Nginx peut la voir via `127.0.0.1:3000`.

---

## 7. Configurer Nginx pour le sous-domaine

Le fichier `nginx-cobblepanel.conf` fourni est prêt, il faut juste :
- Remplacer `YOUR-DOMAIN` par `cobblepanel.tonsite.com`
- Le mettre en place
- **Commenter temporairement** le bloc HTTPS pour que certbot puisse faire son challenge

```bash
# Copier la conf
sudo cp nginx-cobblepanel.conf /etc/nginx/sites-available/cobblepanel

# Remplacer le placeholder
sudo sed -i 's/YOUR-DOMAIN.duckdns.org/cobblepanel.tonsite.com/g' \
  /etc/nginx/sites-available/cobblepanel
```

**Important** : avant de tester, il faut désactiver temporairement le bloc HTTPS
parce que les fichiers de certif n'existent pas encore. Édite le fichier :
```bash
sudo nano /etc/nginx/sites-available/cobblepanel
```

Et **commente tout le second bloc `server {` (celui qui écoute en 443)** en
mettant un `#` devant chaque ligne. Garde seulement le bloc HTTP (port 80)
pour que certbot puisse y poser son challenge.

```bash
# Activer le site
sudo ln -s /etc/nginx/sites-available/cobblepanel /etc/nginx/sites-enabled/

# Vérifier la syntaxe
sudo nginx -t
# → "syntax is ok" / "test is successful"

# Recharger
sudo systemctl reload nginx
```

Test rapide :
```bash
curl -I http://cobblepanel.tonsite.com
# → 200 ou 301 (selon ce que retourne Next sur HTTP)
```

---

## 8. Obtenir le certificat HTTPS

Comme tu utilises déjà certbot, c'est une seule commande :

```bash
sudo certbot --nginx -d cobblepanel.tonsite.com
```

Certbot va :
- Obtenir un certificat Let's Encrypt pour ton sous-domaine
- **Re-modifier** ta conf Nginx pour activer HTTPS automatiquement
- L'ajouter au renouvellement auto (qui tourne déjà chez toi)

Pendant la procédure :
- Choisis **option 2** quand il propose la redirection HTTP→HTTPS

Une fois fini :
```bash
sudo nginx -t && sudo systemctl reload nginx
curl -I https://cobblepanel.tonsite.com
# → 200 + headers HSTS
```

> ✨ Comme certbot tourne déjà chez toi, le renouvellement automatique
> couvrira ton nouveau certif sans aucune config supplémentaire.

---

## 9. Mettre à jour les credentials GitHub

Maintenant que la prod est joignable, GitHub a besoin de connaître les
nouvelles callback URLs.

### OAuth App (login users)

GitHub n'autorise **qu'une seule** callback par OAuth App. Donc :

**Recommandé** : crée une **nouvelle** OAuth App dédiée prod :
1. https://github.com/organizations/TON-ORG/settings/applications/new
2. Application name: `Cobblepanel (Prod)`
3. Homepage URL: `https://cobblepanel.tonsite.com`
4. Authorization callback URL: `https://cobblepanel.tonsite.com/api/auth/callback/github`
5. Récupère **App ID** et génère un **Client Secret**
6. Mets-les dans `.env` prod (remplaçant les valeurs dev)
7. `docker compose up -d` pour reload

Sinon (si tu veux n'avoir qu'une seule app), tu peux juste éditer la
callback URL de l'existante, mais alors le dev local sera cassé tant
que tu n'auras pas reswapé.

### GitHub App

La GitHub App **accepte plusieurs callback URLs**, donc c'est facile :

1. Settings → Developer settings → GitHub Apps → ton app → Edit
2. Dans **Callback URLs**, ajoute une nouvelle ligne :
   `https://cobblepanel.tonsite.com/api/github/app/install`
3. Dans **Setup URL**, ajoute pareil
4. **Save changes**

L'installation existante reste valide, rien à réinstaller. Le `GITHUB_APP_*`
dans `.env` ne change pas.

---

## 10. Premier login et création d'admin

1. Ouvre `https://cobblepanel.tonsite.com` dans ton navigateur
2. Clique **continuer avec GitHub** → autorise → tu reviens connecté en `viewer`
3. Promote-toi admin :

```bash
docker compose exec postgres psql -U cobble -d cobblepanel \
  -c "UPDATE \"User\" SET role = 'admin' WHERE email = 'ton@email.com';"
```

4. Refresh la page : tu vois les sections admin dans la sidebar
5. Va dans `/machines` pour redéclarer ta machine Mystrator (ou autres)

---

## 11. (Optionnel) Migrer les données du dev

Si tu veux récupérer les machines + permissions + audit log du dev :

**Sur ton poste dev** :
```bash
docker compose exec postgres pg_dump -U cobble -d cobblepanel \
  --data-only --inserts \
  -t '"Machine"' -t '"MachinePermission"' -t '"AuditLog"' \
  > dump-dev.sql
```

**Transférer et restaurer sur le VPS** :
```bash
scp dump-dev.sql user@ton-vps:/tmp/
ssh user@ton-vps
cd /opt/cobblepanel
docker compose exec -T postgres psql -U cobble -d cobblepanel < /tmp/dump-dev.sql
rm /tmp/dump-dev.sql   # contient des secrets chiffrés, on supprime
```

⚠️ Migre **uniquement si** ta prod a **la même `ENCRYPTION_KEY`** que ton
dev — sinon les clés/mots de passe SSH des machines deviennent illisibles
et tu devras redéclarer les machines de toute façon.

⚠️ **Ne migre PAS** les tables `User`, `Account`, `Session`, `McpToken` :
laisse les users se créer naturellement en se loggant en prod, et qu'ils
re-connectent leur MCP perso une fois.

---

## 12. Diffuser à l'équipe

Une fois la prod opérationnelle :

- **URL panel** : `https://cobblepanel.tonsite.com`
- **URL MCP** (pour Claude Desktop/Code/Web) : `https://cobblepanel.tonsite.com/api/mcp`

Procédure pour chaque membre :
1. Il va sur `https://cobblepanel.tonsite.com`, se connecte avec GitHub
2. Il apparaît dans `/admin/users` chez toi en `viewer`
3. Tu le promeus à `dev` et lui donnes les permissions sur les machines
4. Il configure son connector MCP avec l'URL ci-dessus dans son Claude perso

---

## Opérations courantes

### Logs en direct
```bash
cd /opt/cobblepanel
docker compose logs -f app
```

### Mettre à jour le code
```bash
cd /opt/cobblepanel
git pull   # ou rsync depuis ton poste
docker compose up -d --build
# Si nouvelle migration:
docker compose exec app pnpm prisma migrate deploy
```

### Backup quotidien de la DB
À mettre dans une crontab :
```bash
crontab -e
```
Ajouter :
```
0 3 * * * cd /opt/cobblepanel && docker compose exec -T postgres pg_dump -U cobble cobblepanel | gzip > /var/backups/cobblepanel-$(date +\%F).sql.gz
0 4 * * 0 find /var/backups -name 'cobblepanel-*.sql.gz' -mtime +30 -delete
```
(backup à 3h du matin, nettoyage des >30j le dimanche)

### Restart propre
```bash
docker compose restart app          # juste l'app
docker compose down && docker compose up -d   # full restart
```

### Limiter les logs Docker (anti remplissage du disque)
```bash
sudo nano /etc/docker/daemon.json
```
Ajouter :
```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```
```bash
sudo systemctl restart docker
```

---

## Dépannage rapide

**"502 Bad Gateway" sur `https://cobblepanel.tonsite.com`**
→ L'app Docker ne tourne pas ou pas joignable. Vérifie :
```bash
docker compose ps
curl http://127.0.0.1:3000
```

**"Cannot GET /api/auth/callback/github"**
→ Le callback URL GitHub OAuth ne matche pas exactement
`NEXTAUTH_URL`. Vérifie les deux et redéploie l'app si tu modifies `.env`.

**Connexion infinie / redirection en boucle au login**
→ Cookies non envoyés. Vérifie que `AUTH_TRUST_HOST=true` est bien dans
l'env de l'app, et que Nginx transmet bien `X-Forwarded-Proto https`.
Logs Nginx : `sudo tail -f /var/log/nginx/access.log`.

**Erreurs HTTPS / certbot bloque**
→ Vérifie d'abord que le DNS est propagé :
`dig +short cobblepanel.tonsite.com` doit retourner l'IP du VPS.

**L'app crash au démarrage avec "ENCRYPTION_KEY env var must be 64 hex chars"**
→ Vérifie ton `.env` : la valeur doit faire exactement 64 caractères
hexa (chiffres + a-f), pas plus pas moins.
