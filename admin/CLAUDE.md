# CLAUDE.md — Zéro Chichi Admin

App d'administration de Zéro Chichi : Eric y ajoute ses recettes depuis son téléphone, sans passer par Claude.
Les règles du fichier `CLAUDE.md` à la racine s'appliquent aussi ici (français simple, sans jargon,
branche + Pull Request, rien sur `main` sans l'accord d'Eric). Ce fichier ajoute ce qui est propre à l'admin.

- Adresse : **https://zc-admin.philbass.workers.dev/** — démonstration sans clé ni envoi : `…/?demo`
- Icône : fond vert profond, casserole orange, bandeau orange « ADMIN » (`admin/public/icon-*.png`)

## Règles propres à l'admin

- **Fusion des Pull Requests** : Eric valide ; il peut simplement écrire « fusionne » dans la conversation
  et Claude fusionne. Pas de fusion automatique, même pour une petite correction (choix d'Eric, nov. 2026).
- **Changement visuel** de l'admin : maquette ou captures (mode `?demo`) avant de coder pour de bon.
- **Ne jamais remettre l'admin sous `philbass.github.io/zero-chichi/`** : le téléphone la prend alors pour
  une page de Zéro Chichi (« application déjà installée ») et ne peut pas l'installer à part.
  `public/admin/index.html` (côté Zéro Chichi) redirige seulement l'ancienne adresse.
- Les clés ne passent jamais par l'app ni par Claude : Eric les colle lui-même dans les secrets GitHub.

## Comment ça marche

```
Téléphone (admin/)  ──X-Admin-Code──▶  Relais Cloudflare (worker-admin/)  ──▶  Claude · Gemini · GitHub
```

Parcours : photo(s) et/ou texte → **Claude** met en forme → **Gemini** dessine l'illustration →
aperçu (modifier, « Autre illustration ») → date → **publication**.

| Fichier | Rôle |
|---|---|
| `admin/Admin.jsx` | Tous les écrans : code d'accès, accueil, saisie, traitement, aperçu, modifier, publication, calendrier, recettes, réglages. Brouillon gardé sur le téléphone (`localStorage` `zca:brouillon`). |
| `admin/api.js` | Appels au relais (même adresse que l'app) ; mode `?demo` avec des réponses simulées. |
| `admin/illus.js` | Prompt d'illustration : le même que `scripts/illustrer.mjs` (style, mise en scène selon la catégorie). |
| `admin/admin.css` | Styles, mêmes couleurs et polices que Zéro Chichi. |
| `admin/public/` | Icônes, manifeste, service worker (ne garde jamais les réponses du relais). |
| `worker-admin/src/index.js` | Relais : `GET /etat`, `POST /former` (Claude), `POST /illustrer` (Gemini), `POST /publier` (GitHub). |
| `worker-admin/wrangler.toml` | Nom `zc-admin`, modèles (`CLAUDE_MODEL`, `GEMINI_MODEL`), dossier de l'app (`../dist-admin`). |
| `vite.admin.config.js` | Build de l'app → `dist-admin/`. |
| `.github/workflows/admin.yml` | À chaque envoi sur `main` qui touche l'admin : build de l'app + mise en ligne du relais avec les secrets. |

Code partagé avec Zéro Chichi (une modification là-bas touche aussi l'admin) : `src/imageTools.js`
(détourage), `src/nutrition.js` (macros), `src/season.js`, `src/lib.js`, `scripts/illustrations/`.

## Publication d'une recette

- **Envoi direct sur `main`**, sans Pull Request : un seul commit avec la ligne ajoutée à la fin de
  `ALL_RECIPES` dans `src/data.js` (format JSON, un objet par ligne) et `public/assets/illus/<id>.webp`.
  C'est l'aperçu dans l'app qui vaut validation. La date `added` fait le reste (date future = programmée).
- Identifiant déjà pris → `-2`, `-3`… Si `main` a bougé pendant l'envoi, le relais recommence (3 essais).
- « Prochain créneau libre » = premier lundi, mercredi ou vendredi libre après la dernière recette programmée.

## Claude (mise en forme)

- Consignes et exemples construits dans `consignes()` du relais, à partir de `src/data.js` (quelques
  recettes en exemple + la liste des recettes existantes pour les liens `[[id|texte]]` de l'astuce).
- Réponse attendue via l'outil `recette` (schéma `SCHEMA`), avec `tool_choice: auto` : **le modèle
  `claude-opus-5-5` refuse `tool_choice` « tool » / « any »** (erreur 400). Filet de sécurité : recette
  lue aussi si Claude la renvoie en JSON dans son texte.
- `remarques` : ce que Claude a dû deviner, affiché à Eric dans l'aperçu, jamais publié.

## Secrets (dépôt GitHub › Settings › Secrets and variables › Actions)

| Secret | Contenu |
|---|---|
| `ADMIN_CODE` | Code d'accès choisi par Eric (tapé une fois sur le téléphone) |
| `ANTHROPIC_API_KEY` | Clé Claude (console.anthropic.com, facturation à part de l'abonnement Claude) |
| `GEMINI_API_KEY` | Clé Gemini (déjà utilisée par les illustrations automatiques) |
| `ADMIN_GITHUB_TOKEN` | Jeton GitHub « fine-grained », dépôt zero-chichi seulement, Contents en lecture/écriture. **Expire** : à renouveler (même nom de secret), puis relancer le workflow « Publier Zéro Chichi Admin ». |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Partagés avec les liens courts (`worker/`) |

Après un changement de secret, relancer le workflow (onglet Actions › « Publier Zéro Chichi Admin » ›
Run workflow) : les secrets ne sont copiés sur Cloudflare qu'à la mise en ligne.

## Vérifier

```bash
npx vite build -c vite.admin.config.js     # l'app
npx eslint admin worker-admin
cd worker-admin && npx wrangler@4 deploy --dry-run   # la configuration Cloudflare
```

Pour les captures : `npx vite preview` après le build, puis ouvrir l'app avec `?demo`.
