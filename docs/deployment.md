# Deploiement MVP

Ce document fixe le contrat de configuration pour sortir du mode local sans changer les habitudes de developpement.

## Variables

Copier `.env.example` vers `.env` en local ou configurer les memes variables chez l'hebergeur.

| Variable | Usage |
| --- | --- |
| `PORT` | Port HTTP du serveur |
| `OHADA_DB_PATH` | Chemin SQLite du MVP local |
| `OHADA_STORAGE_DIR` | Dossier de stockage local des exports et fichiers |
| `OHADA_DEFAULT_ADMIN_EMAIL` | Email du premier administrateur cree au demarrage |
| `OHADA_DEFAULT_ADMIN_PASSWORD` | Mot de passe initial du premier administrateur |
| `OHADA_SESSION_TTL_HOURS` | Duree de validite des sessions bearer |
| `OHADA_JOB_WORKER_INTERVAL_MS` | Frequence de traitement de la file de jobs |
| `DATABASE_URL` | URL PostgreSQL cible pour le deploiement production |

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

5. Brancher l'adapter runtime PostgreSQL dans l'application.
6. Deployer sur Render, Fly, Railway ou VPS avec stockage local persistant.
7. Remplacer ensuite le stockage local par un service S3-compatible.

## Points d'attention production

- Changer `OHADA_DEFAULT_ADMIN_PASSWORD` avant tout deploiement partage.
- Monter `OHADA_STORAGE_DIR` sur un volume persistant.
- Sauvegarder la base quotidiennement.
- Garder `DATABASE_URL` hors Git.
- Utiliser HTTPS devant le serveur applicatif.
