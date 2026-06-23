# Runbook d'exploitation — OHADA FinanceOS

Guide pratique pour faire tourner l'application en production. Pensé pour être
suivi même sans être développeur.

## Où ça tourne

- **Hébergeur** : Railway, projet `upbeat-happiness`, environnement `production`.
- **Services** : `OHADA_FINANCEOS` (l'application) + `Postgres` (la base de données).
- **Adresse publique** : https://ohadafinanceos-production.up.railway.app
- **Code** : GitHub `Ikaff2024/OHADA_FINANCEOS`, branche `main`. Chaque push sur
  `main` déclenche un déploiement automatique.

## Vérifications rapides (santé)

| Quoi | Comment | Résultat attendu |
| --- | --- | --- |
| L'app répond | Ouvrir `…/api/health` | `{"ok":true,...}` (HTTP 200) |
| Base de données | Même page, champ `database.postgres.ok` | `true` |
| Métriques techniques | `…/api/metrics` (avec le token) | texte de métriques |

Si `/api/health` renvoie **503** : la base de données n'est pas joignable
(voir « Incidents » plus bas). L'app se rétablit automatiquement dès que la base
revient.

## Lire les journaux (logs)

En ligne de commande (CLI Railway déjà connectée) :

```bash
railway link --project upbeat-happiness --environment production --service OHADA_FINANCEOS
railway logs --deployment        # logs de l'application (erreurs, requêtes)
railway logs --build             # logs de construction/déploiement
```

Ou via le tableau de bord Railway → service → onglet **Deployments / Logs**.

Les logs sont en JSON structuré. Repères utiles :
- `server_started` : l'app a démarré.
- `request` : chaque requête (méthode, chemin, statut, durée).
- `client_error` : une erreur survenue dans le navigateur d'un utilisateur.
- `uncaught_exception` / `unhandled_rejection` : erreur serveur inattendue.
- `job_retry` / `job_failed` : tâches de fond (exports).

## Déployer une mise à jour

```bash
git push origin main      # déclenche le build + déploiement Railway
```

Le démarrage applique automatiquement les migrations de base (idempotentes).
Surveiller `railway logs --build` jusqu'à `Healthcheck succeeded!`.

## Revenir en arrière (rollback)

Si un déploiement pose problème :

1. **Tableau de bord** (le plus simple) : service → **Deployments** → choisir le
   dernier déploiement sain → menu `⋮` → **Redeploy**.
2. **CLI** : `railway redeploy` pour relancer, ou revenir sur le code précédent :
   ```bash
   git revert <commit-fautif>
   git push origin main
   ```

## Incidents fréquents

| Symptôme | Cause probable | Action |
| --- | --- | --- |
| `/api/health` = 503 | Base PostgreSQL indisponible | Vérifier que le service `Postgres` est *Online* ; attendre le rétablissement auto |
| L'app redémarre en boucle | Variable manquante ou mauvaise | `railway logs --deployment` ; vérifier `DATABASE_URL`, `OHADA_DEFAULT_ADMIN_PASSWORD` (≥12) |
| Page blanche / erreurs UI | Erreur JavaScript | Chercher `client_error` dans les logs |
| Exports/fichiers en erreur | Volume de stockage | Vérifier le volume monté sur `/app/storage/uploads` |
| Connexion impossible | Mauvais identifiants admin | Vérifier `OHADA_DEFAULT_ADMIN_EMAIL/PASSWORD` |

## Sauvegardes et restauration

Railway sauvegarde la base. En complément, faire des sauvegardes applicatives
régulières et **tester une restauration** au moins une fois :

```bash
npm run db:pg:backup      # cree un pg_dump dans data/backups/
npm run db:pg:restore     # restaure (sur une base de test d'abord !)
```

Définir un objectif : perte de données max tolérée (RPO) et temps de
rétablissement visé (RTO). Pour un pilote : RPO 24 h, RTO quelques heures.

## Variables d'environnement

La liste complète et leur rôle sont dans `docs/deployment-railway.md` et
`.env.production.example`. Ne jamais committer de secrets ; ils vivent dans
les variables Railway.

## Contraintes actuelles

- **Une seule instance** (sessions, anti-abus de connexion et compteur de
  tentatives de tâches sont en mémoire). Ne pas augmenter le nombre de replicas
  avant de les externaliser (voir `production-readiness.md`, Phase 2).
- Le conteneur tourne en `root` pour écrire dans le volume (durcissement
  non-root prévu).
