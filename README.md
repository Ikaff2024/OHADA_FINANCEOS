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

Node.js 22.13.0 ou plus recent est requis, car le MVP utilise le module natif `node:sqlite`.
La configuration de deploiement est documentee dans `docs/deployment.md`; `.env.example` liste les variables attendues.

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
- Healthcheck base de donnees avec runtime SQLite explicite et verification PostgreSQL optionnelle
- Colonnes `organization_id` sur les tables metier pour preparer l'isolation multi-entreprise
- Contexte organisation applique aux lectures et ecritures API authentifiees

## Acces de demonstration

```text
Email: admin@demo.ohada
Mot de passe: admin12345
```

## API

- `GET /api/health`
- `GET /api/health/database`
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
- `GET /api/reports/closing-controls`

## Phase 2

Le suivi detaille est dans `docs/phase-2-status.md`.

## Prochaine priorite

Brancher l'adapter PostgreSQL runtime et isoler les donnees par organisation sur les modules metier.
