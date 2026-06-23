# Plan de mise en production — OHADA FinanceOS

Document de pilotage CTO/architecture. Objectif : passer le MVP à un produit
exploitable en production, de façon sûre et incrémentale.

Dernière mise à jour : 2026-06-23.

## Principe directeur

On sécurise d'abord la base de code actuelle (filet de tests + CI + qualité)
**avant** toute réécriture de framework. Une migration (Next.js/TypeScript,
NestJS…) ne se fait jamais sans tests verts au préalable.

## État de référence

- Backend Node.js HTTP natif (~8 500 lignes), pas de framework.
- Frontend vanilla HTML/CSS/JS (`public/`).
- Double runtime SQLite (dev) / PostgreSQL (cible prod).
- Auth scrypt + sessions bearer, rate-limit login, garde de démarrage prod.
- Docker pilote, backups/restore PostgreSQL à rétention, e2e PostgreSQL.

---

## Phase 0 — Filet de sécurité ✅ (en cours / livré)

But : ne plus jamais casser la production silencieusement.

| Action | État |
| --- | --- |
| ESLint (flat config) + scripts `lint` / `lint:fix` | ✅ |
| Prettier + scripts `format` / `format:check` (code normalisé) | ✅ |
| Script `test` agrégeant unités + e2e serveur | ✅ |
| CI GitHub Actions : lint, format, tests SQLite, e2e PostgreSQL, audit | ✅ |
| `npm audit` à 0 vulnérabilité haute (nodemailer 9, ws, protobufjs) | ✅ |
| Branch protection sur `main` (review + CI obligatoires) | ⬜ à activer côté GitHub |
| Dependabot (`.github/dependabot.yml`) | ✅ |
| Suite de tests structurée `node:test` sur le cœur comptable (`test/`) | ✅ |
| Couverture mesurée via `npm run test:coverage` (cible ≥ 70 % cœur comptable) | 🟡 outil prêt, seuil à affiner |

**Definition of Done** : toute PR vers `main` est bloquée si lint, format,
tests SQLite, e2e PostgreSQL ou audit échouent.

## Phase 1 — Durcissement production 🟠 (en cours)

| Action | État | Détail |
| --- | --- | --- |
| Observabilité | ✅ | Logger JSON structuré natif (`src/logger.js`), `request-id` de corrélation propagé, redaction des secrets, niveaux via `LOG_LEVEL`, access-log par requête |
| Sécurité HTTP | ✅ | CSP stricte, COOP, HSTS (opt-in `OHADA_ENABLE_HSTS`), limite de taille de body (`413`), timeouts de requête |
| Métriques | ✅ | Endpoint Prometheus `GET /api/metrics` (uptime, heap/rss, `http_requests_total`, histogramme de latence), protégeable par `OHADA_METRICS_TOKEN` |
| Suivi des erreurs | ⬜ | Sentry (ou équivalent) pour les exceptions non gérées |
| Protection CSRF | ⬜ | À ajouter si bascule vers cookies ; aujourd'hui auth par bearer token (non vulnérable CSRF) |
| Sessions partagées | ⬜ | Externaliser sessions + rate-limit (PostgreSQL/Redis) pour permettre le multi-instance |
| Secrets | ⬜ | Sortir du `.env` clair → Docker secrets / SOPS / vault cloud ; rotation admin par défaut forcée |
| Migrations | ⬜ | Idempotence garantie + procédure de rollback testée |
| Backups | ⬜ | Test de **restauration réelle** périodique ; définir RPO/RTO |

**Definition of Done** : un incident applicatif est détecté et tracé (logs +
alerte) en moins de 5 min ; l'app tourne en ≥ 2 instances sans perte de session.

## Phase 2 — Scalabilité & robustesse 🟠

| Action | Détail |
| --- | --- |
| PostgreSQL par défaut en prod | SQLite réservé au dev ; pooling, SSL, timeouts |
| Worker jobs robuste | 🟡 Retry borné (`OHADA_MAX_JOB_ATTEMPTS`) + re-queue + dead-letter ajoutés ; claim concurrent sûr (`FOR UPDATE SKIP LOCKED` côté PostgreSQL). Reste : sortir le `setInterval` dans un process worker dédié et compteur de tentatives persistant en base |
| Stockage S3-compatible | Remplacer le stockage disque local (déjà anticipé dans le code) |
| Exports serveur PDF/XLS | Fiabiliser la génération des états financiers côté serveur |
| Isolation multi-tenant | Tester le filtrage `organization_id` sur **toutes** les routes (fuite inter-dossiers = critique) |
| Tests de charge | Sur les endpoints rapports (les plus lourds) |

**Definition of Done** : un crash du worker n'impacte pas l'API ; aucune donnée
d'une organisation n'est accessible depuis une autre (test automatisé).

## Phase 3 — Conformité métier & exploitation 🟠 (continu)

| Action | Détail |
| --- | --- |
| Validation comptable OHADA | Jeu de tests « golden » sur balance/bilan/résultat/TVA validés par un expert-comptable |
| Piste d'audit immuable | Garantir non-altérabilité + horodatage du journal d'audit existant |
| Runbook d'exploitation | On-call, alerting, procédure incident, page de statut |
| RGPD / données financières | Chiffrement au repos, politique de rétention, droit à l'effacement |
| Documentation API | OpenAPI/Swagger pour les 38 endpoints ; guide de déploiement par cible cloud |

**Definition of Done** : les états financiers sont validés par un comptable sur
un jeu de référence ; un runbook permet à un ingénieur d'astreinte de gérer un
incident sans contexte préalable.

---

## Commandes qualité (local)

```bash
npm run lint          # ESLint
npm run format:check  # Vérifie le formatage Prettier
npm run format        # Applique le formatage
npm test              # Unités + e2e serveur (SQLite)
npm audit             # Vulnérabilités des dépendances
```

La CI (`.github/workflows/ci.yml`) exécute ces étapes plus l'e2e PostgreSQL
complet sur un service Postgres 16 jetable à chaque PR.
