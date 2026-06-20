# Deploiement MVP

Ce document fixe le contrat de configuration pour sortir du mode local sans changer les habitudes de developpement.

## Variables

Copier `.env.example` vers `.env` en local ou configurer les memes variables chez l'hebergeur.

| Variable | Usage |
| --- | --- |
| `PORT` | Port HTTP du serveur |
| `APP_URL` | URL publique utilisee pour generer les liens d'invitation et de reinitialisation |
| `OHADA_DB_PATH` | Chemin SQLite du MVP local |
| `OHADA_STORAGE_DIR` | Dossier de stockage local des exports et fichiers |
| `OHADA_DEFAULT_ADMIN_EMAIL` | Email du premier administrateur cree au demarrage |
| `OHADA_DEFAULT_ADMIN_PASSWORD` | Mot de passe initial du premier administrateur |
| `OHADA_SESSION_TTL_HOURS` | Duree de validite des sessions bearer |
| `OHADA_JOB_WORKER_INTERVAL_MS` | Frequence de traitement de la file de jobs |
| `OHADA_EXPOSE_AUTH_TOKENS` | Reserve aux tests locaux; doit rester `false` en production |
| `OHADA_CORS_ALLOWED_ORIGINS` | Origines frontend autorisees, separees par des virgules |
| `DATABASE_URL` | URL PostgreSQL cible pour le deploiement production |
| `PGSSLMODE` | Mode SSL PostgreSQL; ne desactiver que pour une base locale |
| `SMTP_HOST`, `SMTP_PORT` | Serveur SMTP transactionnel |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Identifiants et expediteur SMTP |
| `GEMINI_API_KEY` | Cle optionnelle pour l'assistant comptable |

## Chemin recommande

1. Garder SQLite pour les demos locales et les tests rapides.
2. Creer une base PostgreSQL et renseigner `DATABASE_URL`.
3. Appliquer les migrations versionnees:

```bash
npm.cmd run db:migrate:pg
```

Le schema courant reste lisible dans `db/postgres/schema.sql`; les migrations executables vivent dans `db/postgres/migrations`.

4. Generer les donnees SQLite au format PostgreSQL:

```bash
npm.cmd run db:pg:dump
```

Le fichier `data/postgres-seed.sql` produit peut ensuite etre applique avec `psql` apres le schema.

Il peut aussi etre applique sans `psql`:

```bash
npm.cmd run db:pg:seed
```

Pour migrer puis charger le seed en une commande:

```bash
npm.cmd run db:pg:setup
```

Verifier le runtime et la disponibilite PostgreSQL:

```bash
curl http://localhost:3050/api/health/database?checkPostgres=1
```

Verifier que l'adapter runtime PostgreSQL sait lire les tables coeur:

```bash
npm.cmd run db:pg:check
```

Activer le runtime PostgreSQL pour les lectures principales et l'authentification:

```bash
OHADA_DB_RUNTIME=postgres
```

5. Brancher les mutations metier restantes sur l'adapter PostgreSQL.
6. Deployer sur Render, Fly, Railway ou VPS avec stockage local persistant.
7. Remplacer ensuite le stockage local par un service S3-compatible.

## Points d'attention production

- Changer `OHADA_DEFAULT_ADMIN_PASSWORD` avant tout deploiement partage.
- Laisser `OHADA_EXPOSE_AUTH_TOKENS=false` en production.
- Configurer `APP_URL` avec l'URL HTTPS publique avant d'envoyer des invitations.
- Monter `OHADA_STORAGE_DIR` sur un volume persistant.
- Sauvegarder la base quotidiennement.
- Garder `DATABASE_URL` hors Git.
- Utiliser HTTPS devant le serveur applicatif.
