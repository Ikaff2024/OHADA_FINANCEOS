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
| `OHADA_DEFAULT_ORGANIZATION_ID`, `OHADA_DEFAULT_COMPANY_NAME` | Identite du premier dossier PostgreSQL |
| `OHADA_DEFAULT_COUNTRY`, `OHADA_DEFAULT_CURRENCY` | Pays et devise du premier dossier |
| `OHADA_DEFAULT_FISCAL_YEAR_START`, `OHADA_DEFAULT_FISCAL_YEAR_END` | Premier exercice comptable |
| `OHADA_SESSION_TTL_HOURS` | Duree de validite des sessions bearer |
| `OHADA_JOB_WORKER_INTERVAL_MS` | Frequence de traitement de la file de jobs |
| `OHADA_EXPOSE_AUTH_TOKENS` | Reserve aux tests locaux; doit rester `false` en production |
| `OHADA_CORS_ALLOWED_ORIGINS` | Origines frontend autorisees, separees par des virgules |
| `DATABASE_URL` | URL PostgreSQL cible pour le deploiement production |
| `PGSSLMODE` | Mode SSL PostgreSQL; ne desactiver que pour une base locale |
| `OHADA_PG_CONNECTION_TIMEOUT_MS` | Timeout de connexion PostgreSQL utilise par l'application et les healthchecks |
| `PG_DOCKER_CONTAINER` | Conteneur local optionnel contenant `pg_dump` et `pg_restore` |
| `PG_BIN_DIR` | Repertoire optionnel des outils PostgreSQL natifs |
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

## Stack pilote Docker

Creer la configuration locale non versionnee puis remplacer tous les secrets et URLs:

```bash
copy .env.production.example .env.production
npm.cmd run pilot:up
```

La stack applique les migrations, initialise le premier dossier et son proprietaire uniquement si la base est vide, puis demarre l'application. Verifier ensuite:

```bash
curl http://localhost:3050/api/health
npm.cmd run pilot:logs
```

Commandes d'exploitation:

```bash
npm.cmd run pilot:backup
npm.cmd run pilot:restore -- data/backups/sauvegarde.dump --confirm
npm.cmd run pilot:down
```

`pilot:down` conserve les volumes. Ne pas utiliser `docker compose down -v` sur un environnement contenant des donnees utiles. Placer un reverse proxy HTTPS devant le port applicatif et ne pas exposer directement PostgreSQL.

## Verification SMTP

Verifier le format et l'envoi des emails avec le serveur SMTP de test local:

```bash
npm.cmd run check:smtp
```

Apres configuration des variables SMTP dans `.env`, verifier la connexion au fournisseur reel:

```bash
npm.cmd run smtp:check
```

## Sauvegarde PostgreSQL

Les commandes utilisent `pg_dump` et `pg_restore` depuis le `PATH`, `PG_BIN_DIR` ou le conteneur indique par `PG_DOCKER_CONTAINER`.

Creer une sauvegarde binaire:

```bash
npm.cmd run db:pg:backup
```

Un chemin peut etre fourni explicitement:

```bash
npm.cmd run db:pg:backup -- data/backups/avant-migration.dump
```

Restaurer vers la base designee par `DATABASE_URL`:

```bash
npm.cmd run db:pg:restore -- data/backups/avant-migration.dump --confirm
```

La restauration utilise `--clean --if-exists` et remplace les objets presents dans la base cible. Toujours restaurer d'abord dans une base de controle et executer ensuite `db:pg:check` puis `check:pg:e2e`.

Pour la validation complete des mutations, utiliser exclusivement une base jetable dont le nom contient `test` ou `e2e`:

```bash
npm.cmd run check:pg:full
```

Ce test couvre les utilisateurs, invitations, reset, periodes, verrouillage, ecritures, lettrage, imports bancaires et jobs d'export. Il nettoie les donnees et fichiers qu'il cree.

## Points d'attention production

- Changer `OHADA_DEFAULT_ADMIN_PASSWORD` avant tout deploiement partage.
- Laisser `OHADA_EXPOSE_AUTH_TOKENS=false` en production.
- Configurer `APP_URL` avec l'URL HTTPS publique avant d'envoyer des invitations.
- Monter `OHADA_STORAGE_DIR` sur un volume persistant.
- Sauvegarder la base quotidiennement.
- Tester regulierement la restauration dans une base distincte.
- Garder `DATABASE_URL` hors Git.
- Utiliser HTTPS devant le serveur applicatif.
