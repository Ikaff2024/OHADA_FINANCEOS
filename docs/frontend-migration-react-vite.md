# Plan de migration du frontend vers React + Vite

Objectif : aligner le frontend de **OHADA FinanceOS** sur la stack de
**AuthNTIC** (React + Vite) afin de **réutiliser directement** ses modules
d'états financiers SYSCOHADA et son design system, sans repartir de zéro.

Statut : plan validé (option « audit + plan avant de coder »). Dernière mise à
jour : 2026-07-02.

## 1. Audit d'AuthNTIC (source des composants à intégrer)

Stack : **React 18 + Vite 5 + React Router 7 + lucide-react + Supabase**.

Structure `src/` :
- `modules/` — **tous les états SYSCOHADA** : `BilanActifModule`, `BilanPassifModule`,
  `CRModule`, `BalanceModule`, `TafireModule`, `FluxModule`, `NotesModule`,
  `ControlesModule`, `FIRDModule`, `MenuModule`, `ParamsModule`.
- `components/` — design system : `UI.jsx` (+`UI.module.css`), `Layout.jsx`
  (+`Layout.module.css`), `Dashboard.jsx`, `LiasseApp.jsx`, `Login.jsx`,
  `ProtectedRoute.jsx`.
- `utils/` — `compute.js` (calculs), `format.js` (formatage montants).
- `data/` — `plan_comptable.js`, `defaultData.js`.
- `hooks/` — `useStorage.js` (données), `useAuth.jsx` (auth).
- `lib/supabase.js` — client Supabase (client init seulement).
- `index.css` — **design tokens** (palette navy `#0d2b4e` + or `#c9a84c`, rayons,
  ombres, polices DM Sans/DM Mono). Styling en **CSS variables + CSS Modules**
  (pas de Tailwind → portable).

### Constat clé : couplage Supabase minimal et isolé
- Les **modules d'états sont des composants purs** : `Module({ data, onSave })`.
  Ils n'importent que `components/UI.jsx`, `data/plan_comptable.js`,
  `utils/format.js`. **Aucun n'importe Supabase** (vérifié).
- Tout le couplage backend tient dans **un seul hook** : `useStorage(companyId)`,
  qui charge/sauve **un unique blob JSON** (`liasse_data.data`) et renvoie
  `{ data, save, reset, loading }`. Le code annonce déjà « useStorage sera
  bientôt adapté ».
- `LiasseApp.jsx` est le seul orchestrateur : il appelle `useStorage` et passe
  `data`/`save` à chaque module.

### Réutilisabilité
| Réutilisable **tel quel** | À réécrire pour OHADA |
| --- | --- |
| `modules/*` (états SYSCOHADA) | `hooks/useStorage.js` (→ API OHADA) |
| `utils/compute.js`, `format.js` | `hooks/useAuth.jsx` (→ auth bearer OHADA) |
| `data/plan_comptable.js`, `defaultData.js` | `lib/supabase.js` (→ client API OHADA) |
| `components/UI.jsx` + `Layout.jsx` (design system) | `Login.jsx`, `ProtectedRoute.jsx` |
| `index.css` (design tokens) | |

**Conclusion** : la valeur (états + calculs + design) est portable ; seule une
fine couche data/auth (~1 hook + client + écran login) est à adapter.

## 2. Architecture cible

- **Frontend** : React + Vite (nouveau), remplaçant `public/` (vanilla).
- **Backend** : **inchangé** — Node + PostgreSQL sur Railway (éprouvé, testé,
  déployé). Le frontend React appelle l'**API JSON OHADA existante** (bearer).
- **Pas de Supabase** pour OHADA : on garde une seule plateforme backend.

### Intégration des modules « liasse » d'AuthNTIC
1. Ajouter côté backend OHADA un stockage du blob liasse par organisation :
   `GET /api/liasse` et `PUT /api/liasse` (table `liasse_data` : organization_id,
   data JSON) — trivial (miroir de `useStorage`).
2. Écrire un `useStorage` OHADA qui lit/écrit via ces endpoints (au lieu de
   Supabase). ~50 lignes ; signature identique → les modules ne changent pas.
3. Brancher `useAuth` sur l'auth OHADA (token bearer déjà en place).
4. Copier `modules/*`, `utils/*`, `data/*`, `components/UI+Layout`, `index.css`.

## 3. Plan par phases (sans casser la prod)

**Phase 0 — Socle (≈2–3 j)**
- Scaffold `web/` : Vite + React + React Router, ESLint/Prettier partagés.
- Porter le design system d'AuthNTIC (`index.css` tokens, `UI.jsx`, `Layout.jsx`).
- Client API OHADA (fetch + bearer + `x-organization-id`) et `useAuth` (login OHADA).

**Phase 1 — Intégration liasse SYSCOHADA (≈1 sem)**
- Endpoint backend `GET/PUT /api/liasse` (+ migration table).
- `useStorage` OHADA ; monter `LiasseApp` + tous les `modules/*` réutilisés.
- Livrable : les **états financiers officiels** (bilan, CR, TAFIRE, flux, notes…)
  disponibles dans OHADA — l'objectif « ne pas partir de zéro » atteint.

**Phase 2 — Portage des vues OHADA (incrémental, ≈2–4 sem)**
- Reconstruire en React, vue par vue, les écrans propres à OHADA (saisie,
  journal, grand livre, imports, lettrage, audit, paramètres, assistant chat).
- L'app vanilla actuelle **reste servie** jusqu'à parité, puis bascule.

**Phase 3 — Bascule & déploiement**
- Dockerfile **multi-stage** : `npm run build` (Vite → `web/dist`) puis Node sert
  `web/dist`. Cache-busting géré par Vite (hash de fichiers) → fini les `?v=`.
- Retirer `public/` (vanilla) une fois la parité validée.

## 4. Impact déploiement
- Build Vite ajouté à l'image (multi-stage). Railway construit sans config
  supplémentaire. Les assets hashés remplacent le versionnage manuel.
- CSP : `script-src 'self'` reste valable (bundle same-origin). jsPDF déjà
  vendorisé pourra devenir une dépendance npm classique.

## 5. Risques & mitigations
- **Réécriture d'une app live** → migration **incrémentale**, app vanilla gardée
  en parallèle jusqu'à parité ; bascule réversible.
- **Divergence data model** (blob liasse vs comptabilité OHADA) → à terme, dériver
  la liasse depuis les écritures OHADA ; en v1, blob éditable importé/saisi.
- **Deux backends** (OHADA Node/PG vs AuthNTIC Supabase) → on ne fusionne pas ;
  OHADA reste maître, on ne réutilise que le **frontend** d'AuthNTIC.

## 6. Décision & prochaine étape
Recommandation : démarrer **Phase 0 + Phase 1** (socle React/Vite + intégration
des états SYSCOHADA d'AuthNTIC), qui apportent la plus grande valeur
immédiate, puis dérouler la Phase 2 vue par vue.
