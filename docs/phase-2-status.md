# Phase 2 - Socle Technique

Etat au 2026-05-10.

## Objectif

Construire une base propre, maintenable et prete a evoluer vers un produit commercialisable.

## Fait

- Backend local structure autour d'une API JSON Node.js native.
- Persistance SQLite locale avec schemas explicites et seed de demonstration.
- Authentification email/mot de passe avec hash `scrypt` et sessions bearer.
- Ecran de connexion frontend, session conservee dans le navigateur et bouton de deconnexion.
- Organisation de demonstration creee automatiquement depuis l'entreprise.
- Creation d'organisations/dossiers depuis l'API et l'interface avec societe, exercice et proprietaire initial.
- Utilisateurs avec roles `owner`, `admin`, `accountant`, `viewer`.
- Administration frontend des utilisateurs: creation, changement de role et activation/desactivation.
- Protection serveur des principales routes d'ecriture selon les roles.
- API metier fermee par defaut apres les routes publiques de sante et d'authentification.
- Exercices comptables avec creation, verrouillage et reouverture.
- Plan comptable SYSCOHADA enrichi.
- Creation de comptes comptables propres au dossier et utilisables dans les ecritures/etats.
- Creation de journaux comptables propres au dossier et selection du journal en saisie.
- Journaux et ecritures comptables equilibrees.
- Modification d'ecritures tant que l'exercice n'est pas verrouille.
- Imports bancaires CSV avec preview, detection de doublons, commit et annulation.
- Etats financiers: balance, grand livre, balance auxiliaire, bilan, compte de resultat, controles de cloture.
- Exports CSV/XLS cote navigateur.
- File de jobs simple pour preparer les imports et traitements longs.
- Stockage local de fichiers, isole en tests et pret a etre remplace par S3-compatible.
- Worker local qui traite les jobs d'export financier et produit un fichier JSON telechargeable.
- Configuration centralisee par variables d'environnement avec `.env.example`.
- Schema PostgreSQL cible disponible dans `db/postgres/schema.sql`.
- Export SQL SQLite vers PostgreSQL disponible avec `npm.cmd run db:pg:dump`.
- Tables metier preparees avec `organization_id` pour l'isolation multi-entreprise.
- Contexte organisation transmis par l'API pour filtrer les snapshots et rattacher les nouvelles donnees.
- Tests serveur couvrant les parcours comptables critiques et le nouveau socle phase 2.

## Partiellement fait

- Frontend: interface fonctionnelle en HTML/CSS/JavaScript, pas encore migree vers React / Next.js / TypeScript.
- Backend: API maintenable pour MVP, pas encore migree vers NestJS ou FastAPI.
- Base de donnees: SQLite solide pour MVP local, schema PostgreSQL pret, adapter runtime PostgreSQL reste a brancher.
- Auth: le flux de connexion et l'administration des roles sont disponibles; il reste les invitations email et la reinitialisation de mot de passe.
- Jobs: worker local disponible pour les exports financiers; il reste a etendre aux imports lourds.
- Exports: exports navigateur et generation serveur historisee disponibles.

## Reste a faire pour finir la phase 2

- Ajouter les invitations email et la reinitialisation de mot de passe.
- Ajouter un switcher d'organisation et un parcours d'invitation pour les utilisateurs rattaches a plusieurs dossiers.
- Introduire PostgreSQL avec migrations reproductibles.
- Brancher l'adapter runtime PostgreSQL sur `DATABASE_URL`.
- Choisir la trajectoire framework: migration progressive vers Next.js + TypeScript et NestJS/FastAPI, ou stabilisation courte du MVP actuel avant migration.
- Etendre le worker aux imports lourds et aux exports XLS/PDF.
- Formaliser les variables d'environnement et un guide de deploiement Render/Fly/Railway/VPS.
