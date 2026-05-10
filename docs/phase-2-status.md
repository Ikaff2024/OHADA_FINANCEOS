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
- Utilisateurs avec roles `owner`, `admin`, `accountant`, `viewer`.
- Administration frontend des utilisateurs: creation, changement de role et activation/desactivation.
- Protection serveur des principales routes d'ecriture selon les roles.
- API metier fermee par defaut apres les routes publiques de sante et d'authentification.
- Exercices comptables avec creation, verrouillage et reouverture.
- Plan comptable SYSCOHADA enrichi.
- Journaux et ecritures comptables equilibrees.
- Imports bancaires CSV avec preview, detection de doublons, commit et annulation.
- Etats financiers: balance, grand livre, balance auxiliaire, bilan, compte de resultat, controles de cloture.
- Exports CSV/XLS cote navigateur.
- File de jobs simple pour preparer les imports et traitements longs.
- Stockage local de fichiers, isole en tests et pret a etre remplace par S3-compatible.
- Worker local qui traite les jobs d'export financier et produit un fichier JSON telechargeable.
- Tests serveur couvrant les parcours comptables critiques et le nouveau socle phase 2.

## Partiellement fait

- Frontend: interface fonctionnelle en HTML/CSS/JavaScript, pas encore migree vers React / Next.js / TypeScript.
- Backend: API maintenable pour MVP, pas encore migree vers NestJS ou FastAPI.
- Base de donnees: SQLite solide pour MVP local, PostgreSQL reste a brancher avant de viser une exploitation multi-clients.
- Auth: le flux de connexion et l'administration des roles sont disponibles; il reste les invitations email et la reinitialisation de mot de passe.
- Jobs: worker local disponible pour les exports financiers; il reste a etendre aux imports lourds.
- Exports: exports navigateur et generation serveur historisee disponibles.

## Reste a faire pour finir la phase 2

- Ajouter les invitations email et la reinitialisation de mot de passe.
- Etendre la protection par organisation a toutes les donnees metier.
- Ajouter la notion d'organisation dans les ecritures et donnees metier pour preparer le vrai multi-tenant.
- Introduire PostgreSQL avec migrations reproductibles.
- Choisir la trajectoire framework: migration progressive vers Next.js + TypeScript et NestJS/FastAPI, ou stabilisation courte du MVP actuel avant migration.
- Etendre le worker aux imports lourds et aux exports XLS/PDF.
- Formaliser les variables d'environnement et un guide de deploiement Render/Fly/Railway/VPS.
