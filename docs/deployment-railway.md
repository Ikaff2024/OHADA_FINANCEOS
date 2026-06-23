# Déploiement sur Railway

Guide pas-à-pas pour mettre OHADA FinanceOS en ligne sur [Railway](https://railway.app).
Pas besoin d'être développeur : suivre les étapes dans l'ordre.

## Vue d'ensemble

On crée **un projet Railway contenant deux services** :

1. **PostgreSQL** — la base de données (Railway la fournit en un clic).
2. **L'application** — construite automatiquement depuis le dépôt GitHub via le
   fichier `Dockerfile` déjà présent.

Au démarrage, l'application applique les migrations de base de données, crée le
dossier de démonstration si la base est vide, puis démarre. La configuration est
déjà dans `railway.json` ; il n'y a rien à coder.

---

## Étape 1 — Créer le projet et la base de données

1. Sur Railway : **New Project**.
2. **Add a service → Database → PostgreSQL**. Railway crée la base et génère sa
   variable `DATABASE_URL` automatiquement.

## Étape 2 — Ajouter l'application

1. Dans le même projet : **New → GitHub Repo**, et choisir ce dépôt.
2. Railway détecte le `Dockerfile` et le `railway.json` : il sait construire et
   démarrer l'application sans configuration supplémentaire.

## Étape 3 — Renseigner les variables d'environnement

Sur le service **application**, onglet **Variables**, ajouter les valeurs
ci-dessous. Les variables marquées 🔴 sont obligatoires.

| Variable | Valeur | Notes |
| --- | --- | --- |
| `OHADA_DB_RUNTIME` 🔴 | `postgres` | Utilise PostgreSQL en production |
| `DATABASE_URL` 🔴 | `${{Postgres.DATABASE_URL}}` | Référence la base du projet (syntaxe Railway) |
| `PGSSLMODE` 🔴 | `disable` | Réseau privé Railway, pas de TLS interne |
| `NODE_ENV` 🔴 | `production` | |
| `OHADA_DEFAULT_ADMIN_EMAIL` 🔴 | votre email admin | Compte créé au premier démarrage |
| `OHADA_DEFAULT_ADMIN_PASSWORD` 🔴 | mot de passe **fort (≥ 12 caractères)** | L'application refuse de démarrer avec un mot de passe faible |
| `OHADA_DEFAULT_ADMIN_NAME` | `Administrateur` | |
| `APP_URL` 🔴 | `https://<votre-app>.up.railway.app` | Sert à construire les liens d'email |
| `OHADA_CORS_ALLOWED_ORIGINS` | `https://<votre-app>.up.railway.app` | |
| `OHADA_ENABLE_HSTS` | `true` | Railway fournit le HTTPS, on peut l'activer |
| `OHADA_METRICS_TOKEN` | une longue chaîne aléatoire | Protège `/api/metrics` |
| `OHADA_EXPOSE_AUTH_TOKENS` | `false` | Doit rester `false` en production |
| `LOG_LEVEL` | `info` | |
| `OHADA_STORAGE_DIR` | `/app/storage/uploads` | Doit correspondre au volume (étape 4) |
| `OHADA_DEFAULT_ORGANIZATION_ID` | `demo-company` | Paramètres du dossier initial |
| `OHADA_DEFAULT_COMPANY_NAME` | nom de l'entreprise | |
| `OHADA_DEFAULT_COUNTRY` | `CI` | Code pays OHADA |
| `OHADA_DEFAULT_CURRENCY` | `XOF` | |
| `OHADA_DEFAULT_FISCAL_YEAR_START` | `2026-01-01` | |
| `OHADA_DEFAULT_FISCAL_YEAR_END` | `2026-12-31` | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | identifiants SMTP | Pour les emails réels (invitations, mot de passe oublié). Sans cela, les liens sont écrits dans les logs |
| `GEMINI_API_KEY` | clé API Google | Optionnel : assistant comptable IA |

> ⚠️ **Ne pas définir `PORT`** : Railway l'attribue automatiquement et
> l'application l'utilise déjà.

## Étape 4 — Stockage des fichiers (configuré ✅)

Un volume persistant `ohada_financeos-volume` est monté sur `/app/storage/uploads`
(aligné avec `OHADA_STORAGE_DIR`). Les exports/fichiers survivent aux
redéploiements. Écriture validée en production (`POST /api/files/text` → 201).

> Note technique : le conteneur tourne en `root` pour pouvoir écrire dans le
> volume Railway (monté root). Durcissement futur : repasser en utilisateur non
> privilégié avec un entrypoint qui ajuste les droits du volume (`gosu`).

## Étape 5 — Domaine et vérification

1. **Settings → Networking → Generate Domain** pour obtenir l'URL publique.
   Reporter cette URL dans `APP_URL` et `OHADA_CORS_ALLOWED_ORIGINS` (étape 3).
2. Attendre la fin du déploiement (Railway montre les logs).
3. Vérifier la santé : ouvrir `https://<votre-app>.up.railway.app/api/health` →
   doit répondre `{"ok":true,...}`.
4. Se connecter avec l'email/mot de passe admin définis à l'étape 3.

---

## Contraintes actuelles (à connaître)

- **Une seule instance** (`numReplicas: 1`, déjà fixé dans `railway.json`). Les
  sessions, le anti-abus de connexion et le compteur de tentatives de tâches
  sont en mémoire ; passer à plusieurs instances nécessite d'abord de les
  externaliser (voir `production-readiness.md`, Phase 2). Ne pas augmenter le
  nombre de replicas pour l'instant.
- **Sauvegardes** : Railway sauvegarde la base, mais prévoir aussi des
  `pg_dump` réguliers (`npm run db:pg:backup`) vers un stockage externe, et
  **tester une restauration** au moins une fois.

## Mises à jour

Chaque `git push` sur la branche connectée déclenche un nouveau déploiement.
Les migrations de base de données s'appliquent automatiquement au démarrage
(elles sont idempotentes : seules les nouvelles sont exécutées).

## En cas de problème

- L'application ne démarre pas → vérifier les logs Railway. Cause fréquente :
  `OHADA_DEFAULT_ADMIN_PASSWORD` trop faible (< 12 caractères) ou `DATABASE_URL`
  absente.
- `/api/health` renvoie `503` → la base n'est pas joignable : vérifier que le
  service PostgreSQL tourne et que `DATABASE_URL` pointe bien dessus.
