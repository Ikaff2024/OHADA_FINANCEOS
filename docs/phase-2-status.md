# Phase 2 - Socle Technique

Etat au 2026-06-20.

## Objectif

Construire une base propre, maintenable et prete a evoluer vers un produit commercialisable.

## Fait

- Backend local structure autour d'une API JSON Node.js native.
- Persistance SQLite locale avec schemas explicites et seed de demonstration.
- Authentification email/mot de passe avec hash `scrypt` et sessions bearer.
- Ecran de connexion frontend, session conservee dans le navigateur et bouton de deconnexion.
- Invitations utilisateurs et reinitialisation de mot de passe par lien/token.
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
- Migrations PostgreSQL versionnees disponibles avec `npm.cmd run db:migrate:pg`.
- Export SQL SQLite vers PostgreSQL disponible avec `npm.cmd run db:pg:dump`.
- Import du seed PostgreSQL disponible avec `npm.cmd run db:pg:seed` et setup complet avec `npm.cmd run db:pg:setup`.
- Premier module d'adapter runtime PostgreSQL disponible avec conversion des parametres, transactions et controle des tables coeur.
- Runtime PostgreSQL activable par `OHADA_DB_RUNTIME=postgres` pour les lectures principales et l'authentification.
- Mutations de configuration branchees sur PostgreSQL: societe, comptes personnalises, journaux, auxiliaires et exercices.
- Mutations d'ecritures comptables manuelles branchees sur PostgreSQL: ajout, modification et suppression tant que l'exercice est ouvert.
- Imports bancaires, corrections d'apprentissage et abonnements branches sur PostgreSQL via le runtime.
- Healthcheck base de donnees indiquant le runtime SQLite et la disponibilite PostgreSQL optionnelle.
- Tables metier preparees avec `organization_id` pour l'isolation multi-entreprise.
- Contexte organisation transmis par l'API pour filtrer les snapshots et rattacher les nouvelles donnees.
- Tests serveur couvrant les parcours comptables critiques et le nouveau socle phase 2.
- Roles portes par la relation `organization_users` pour permettre des droits differents selon le dossier.
- Switcher d'organisation disponible dans l'interface et contexte actif transmis par l'API.
- Envoi SMTP branche pour les invitations et reinitialisations, avec mode mock sans configuration SMTP.
- Tokens d'invitation et de reinitialisation masques par defaut dans les reponses API.
- Garde de demarrage interdisant l'exposition des tokens en production.
- Deux migrations PostgreSQL appliquees et validees sur PostgreSQL 16.
- Smoke test PostgreSQL couvrant authentification, lectures, rapports et cycle creation/modification/suppression d'ecriture.
- Rapports complementaires: declaration de TVA et balances agees clients/fournisseurs.
- Assistant comptable Gemini branche sur le guide SYSCOHADA lorsque la cle API est configuree.
- Base SQLite locale retiree du suivi Git tout en restant disponible pour le developpement.
- Verification SMTP locale automatisee et commande de verification d'un fournisseur SMTP configure.
- Sauvegarde et restauration PostgreSQL validees sur une base distincte avec controle des volumes et smoke API.
- E2E PostgreSQL complet sur base jetable: utilisateurs, invitations, reset, periodes, verrouillage, ecritures, lettrage, import bancaire et jobs d'export.
- Contrat PostgreSQL des jobs et fichiers aligne sur SQLite, avec exports serveur fonctionnels.
- Stack pilote Docker validee de bout en bout: build, migrations, bootstrap, persistance, redemarrage et healthcheck PostgreSQL.
- Perte PostgreSQL geree sans crash applicatif: healthcheck 503 pendant l'incident puis retour automatique a 200.

## Partiellement fait

- Frontend: interface fonctionnelle en HTML/CSS/JavaScript, pas encore migree vers React / Next.js / TypeScript.
- Backend: API maintenable pour MVP, pas encore migree vers NestJS ou FastAPI.
- Base de donnees: SQLite solide pour le developpement local et runtime PostgreSQL fonctionnel; les parcours critiques disposent maintenant d'un e2e PostgreSQL sur base jetable.
- Auth: connexion, invitations, reinitialisation, SMTP et multi-organisation sont branches; il reste a valider un fournisseur SMTP reel et les politiques de delivrabilite.
- Jobs: worker local disponible pour les exports financiers; il reste a etendre aux imports lourds.
- Exports: exports navigateur et generation serveur historisee disponibles.

## Reste a faire pour finir la phase 2

- Configurer et valider les identifiants d'un fournisseur SMTP reel sur l'environnement pilote.
- Appliquer les migrations PostgreSQL sur l'environnement pilote avec sauvegarde et restauration testees.
- Completer la couverture PostgreSQL sur la creation d'organisations, les comptes personnalises et les abonnements.
- Planifier les sauvegardes automatiques et definir leur duree de retention.
- Choisir la trajectoire framework: migration progressive vers Next.js + TypeScript et NestJS/FastAPI, ou stabilisation courte du MVP actuel avant migration.
- Etendre le worker aux imports lourds et aux exports XLS/PDF.
- Completer le guide de deploiement pour une cible choisie et ajouter une procedure de rollback.
