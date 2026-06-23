# OHADA FinanceOS MVP

MVP local pour valider le coeur produit: importer ou saisir des ecritures, appliquer un plan comptable OHADA simplifie, verifier l'equilibre debit/credit et produire les premiers etats financiers.

## Lancer

```bash
npm.cmd run dev
```

Puis ouvrir:

```text
http://localhost:3050
```

Pour lancer la stack pilote PostgreSQL avec Docker:

```bash
copy .env.production.example .env.production
# Remplacer les mots de passe et URLs dans .env.production
npm.cmd run pilot:up
```

Node.js 24 ou plus recent est requis, car le MVP utilise le module natif `node:sqlite` (stable sans flag a partir de Node 24).
La configuration de deploiement est documentee dans `docs/deployment.md`; `.env.example` liste les variables attendues.

Pour la mise en ligne sur Railway (cible d'hebergement retenue), suivre le guide
pas-a-pas `docs/deployment-railway.md` (`railway.json` configure deja le build et
le demarrage).

Documentation complementaire:
- `docs/runbook.md` — exploitation en production (sante, logs, deploiement, rollback, incidents, sauvegardes).
- `docs/openapi.yaml` — contrat OpenAPI de l'API (ouvrir dans editor.swagger.io).
- `docs/production-readiness.md` — plan de mise en production par phases.

## Qualite

```bash
npm.cmd run lint          # ESLint
npm.cmd run format:check  # Verifie le formatage Prettier
npm.cmd run format        # Applique le formatage
npm.cmd test              # Unites + e2e serveur (SQLite)
```

La CI (`.github/workflows/ci.yml`) execute lint, format, tests SQLite, e2e
PostgreSQL et `npm audit` sur chaque PR. Le plan de mise en production complet
est dans `docs/production-readiness.md`.

## Verifier

```bash
npm.cmd run check
npm.cmd run check:e2e
npm.cmd run check:smtp
```

Avec une base PostgreSQL configuree:

```bash
npm.cmd run db:pg:check
npm.cmd run check:pg:e2e
npm.cmd run check:pg:full
```

`check:pg:full` doit viser une base jetable dont le nom contient `test` ou `e2e`.

## Contenu du MVP

- Creation et lecture d'une entreprise de demonstration
- Parametrage de l'entreprise, de la devise et de l'exercice
- Plan comptable SYSCOHADA enrichi depuis les PDF de reference
- Creation de comptes comptables propres au dossier
- Creation de journaux comptables propres au dossier
- Saisie d'ecritures comptables equilibrees
- Modification d'ecritures tant que l'exercice reste ouvert
- References obligatoires sur les ecritures
- Validation des comptes et des montants
- Balance generale consultable en 6 ou 8 colonnes, exportable en CSV ou XLS
- Etats imprimables et exportables selon une periode datee
- Selection d'exercice pour piloter les etats et indicateurs
- Bilan simplifie
- Compte de resultat simplifie
- Declaration de TVA indicative
- Balances agees clients et fournisseurs
- API JSON locale
- Persistance SQLite dans `data/financeos.sqlite`
- Import CSV bancaire avec suggestions de comptes
- Ecritures d'abonnement mensuelles avec generation en lot
- Categorisation assistee par regles de libelles
- Correction manuelle des comptes suggeres avant import
- Memorisation locale des corrections de classification
- Detection et exclusion des doublons bancaires
- Historique des lots d'import bancaire
- Annulation d'un lot d'import et retrait des ecritures associees
- Journal filtrable par source et recherche texte
- Detail d'ecriture et suppression controlee
- Navigation par vues: Dashboard / Tresorerie, Journal, Imports, Etats financiers
- Vue Plan comptable: classes, familles, recherche et filtrage
- Creation de comptes auxiliaires rattaches aux comptes collectifs
- Balance auxiliaire par tiers
- Grand livre consultable par compte general ou auxiliaire, exportable en CSV ou XLS
- Lettrage manuel et automatique des comptes par rapprochement debit/credit
- Impression de la balance generale, du grand livre et de la balance auxiliaire
- Entete imprime avec nom de la societe et exercice
- Choix d'interface: theme classique OHADA ou theme sombre Linear Stripe
- Totaux visibles sur les balances et le grand livre
- Exercice comptable persiste dans SQLite
- Creation de l'exercice suivant
- Verrouillage / reouverture de periode
- Blocage des saisies, suppressions et annulations d'import sur periode verrouillee
- Tableau de controles de cloture avant edition des etats
- Journal d'audit des actions sensibles
- Authentification email/mot de passe avec sessions bearer
- Ecran de connexion et session conservee cote navigateur
- Invitations utilisateurs par lien/token
- Reinitialisation de mot de passe par lien/token
- Utilisateurs, roles et organisation de demonstration
- Administration des utilisateurs et roles dans l'interface
- Creation de nouveaux dossiers/organisations avec societe, exercice et proprietaire initial
- Selection du dossier actif pour les utilisateurs multi-organisations
- Protection des routes d'ecriture sensibles par role
- API metier fermee par defaut: les lectures et mutations exigent une session
- File de jobs simple pour preparer imports et generations longues
- Stockage local de fichiers texte, pret a etre remplace par un stockage S3-compatible
- Worker local pour generer des exports financiers serveur et les historiser
- Configuration centralisee par variables d'environnement
- Schema PostgreSQL cible dans `db/postgres/schema.sql`
- Migrations PostgreSQL versionnees avec `npm.cmd run db:migrate:pg`
- Export SQL des donnees SQLite vers PostgreSQL avec `npm.cmd run db:pg:dump`
- Import du seed PostgreSQL avec `npm.cmd run db:pg:seed` ou setup complet avec `npm.cmd run db:pg:setup`
- Premier module d'adapter runtime PostgreSQL avec transactions et verification `npm.cmd run db:pg:check`
- Runtime PostgreSQL activable par `OHADA_DB_RUNTIME=postgres` pour les lectures principales et l'authentification
- Mutations PostgreSQL de configuration: societe, comptes, journaux, auxiliaires et exercices
- Mutations PostgreSQL d'ecritures comptables manuelles: ajout, modification et suppression hors periode verrouillee
- Mutations PostgreSQL des imports bancaires, corrections d'apprentissage et abonnements
- Healthcheck base de donnees avec runtime SQLite explicite et verification PostgreSQL optionnelle
- Colonnes `organization_id` sur les tables metier pour preparer l'isolation multi-entreprise
- Contexte organisation applique aux lectures et ecritures API authentifiees
- Invitations et reinitialisations envoyables par SMTP, avec mode mock local
- Assistant comptable Gemini base sur le guide SYSCOHADA quand `GEMINI_API_KEY` est configuree
- Smoke test PostgreSQL couvrant authentification, lectures et cycle creation/modification/suppression d'ecriture
- Sauvegarde et restauration PostgreSQL par `pg_dump` / `pg_restore`, utilisables aussi via un conteneur Docker
- Verification SMTP locale automatisee et commande de verification du fournisseur configure
- E2E PostgreSQL complet: utilisateurs, reset, periodes, verrouillage, ecritures, lettrage, import bancaire, jobs et fichiers

## Acces de demonstration

```text
Email: admin@demo.ohada
Mot de passe: admin12345
```

## API

- `GET /api/health`
- `GET /api/health/database`
- `GET /api/metrics`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/invitations/accept`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`
- `GET /api/auth/me`
- `GET /api/organizations`
- `POST /api/organizations`
- `GET /api/users`
- `POST /api/users`
- `POST /api/users/invitations`
- `PATCH /api/users/:id`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/files`
- `POST /api/files/text`
- `GET /api/files/:id/content`
- `POST /api/reports/export`
- `GET /api/company`
- `PUT /api/company`
- `GET /api/accounts`
- `POST /api/accounts`
- `GET /api/account-classes`
- `GET /api/journals`
- `POST /api/journals`
- `GET /api/auxiliary-accounts`
- `POST /api/auxiliary-accounts`
- `GET /api/accounting-periods`
- `POST /api/accounting-periods`
- `POST /api/accounting-periods/:id/lock`
- `POST /api/accounting-periods/:id/unlock`
- `GET /api/journal-entries`
- `POST /api/journal-entries`
- `GET /api/journal-entries/:id`
- `PUT /api/journal-entries/:id`
- `DELETE /api/journal-entries/:id`
- `GET /api/bank-imports/sample`
- `POST /api/bank-imports/preview`
- `POST /api/bank-imports/commit`
- `GET /api/bank-imports/batches`
- `POST /api/bank-imports/batches/:id/void`
- `GET /api/subscriptions`
- `POST /api/subscriptions`
- `GET /api/lettering`
- `POST /api/lettering/manual`
- `POST /api/lettering/auto`
- `GET /api/audit-events`
- `GET /api/reports/trial-balance`
- `GET /api/reports/general-ledger`
- `GET /api/reports/auxiliary-balance`
- `GET /api/reports/balance-sheet`
- `GET /api/reports/income-statement`
- `GET /api/reports/vat-declaration`
- `GET /api/reports/aged-balance/clients`
- `GET /api/reports/aged-balance/suppliers`
- `GET /api/reports/closing-controls`
- `POST /api/chat`

## Phase 2

Le suivi detaille est dans `docs/phase-2-status.md`.

## Prochaine priorite

Securiser et industrialiser le deploiement pilote: SMTP reel, PostgreSQL cible, tests de mutations PostgreSQL elargis, sauvegardes et exports serveur PDF/XLS.
