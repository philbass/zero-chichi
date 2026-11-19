# CLAUDE.md — Zéro Chichi

Appli de recettes courtes et simples, en français. PWA installable (téléphone, tablette), en ligne sur
GitHub Pages : https://philbass.github.io/zero-chichi/

Le propriétaire (Eric) n'est pas développeur : réponds-lui en français, simplement, sans jargon.

## Règles de travail

- **Rien ne part sur `main` sans validation.** Un envoi sur `main` publie immédiatement l'app.
  Travaille sur une branche, ouvre une Pull Request, montre un aperçu (capture, maquette ou description
  claire) et attends l'accord d'Eric avant de fusionner.
- **Changements visuels** : toujours une maquette ou un aperçu avant de coder pour de bon.
- Les nouveautés visibles par l'utilisateur s'ajoutent en tête de `src/news.js` (page « Quoi de neuf ? »).
  Les nouvelles recettes y apparaissent toutes seules grâce à leur champ `added` : pas besoin de les lister.
- Ne pas réintroduire la commande vocale : abandonnée (trop aléatoire). La lecture à voix haute, elle, reste.

## Commandes

```bash
npm install
npm run dev      # développement
npm run build    # vite build + precache.mjs (liste des fichiers pour le hors ligne) → dist/
npm run lint     # ESLint (quelques erreurs/avertissements existants, à ne pas aggraver)
```

Pas de tests automatisés : vérifie au minimum que `npm run build` passe.

## Architecture

React 19 + Vite, JavaScript (pas de TypeScript), aucune bibliothèque d'interface. Seule dépendance
en plus de React : `qrcode-generator`. `vite.config.js` utilise `base: './'` (chemins relatifs).

| Fichier | Rôle |
|---|---|
| `src/App.jsx` | Presque toute l'interface : accueil, recherche, catégories, fiche recette, mode cuisine, favoris, courses |
| `src/data.js` | **Toutes les recettes** (`ALL_RECIPES`) et la liste des catégories `CATS` |
| `src/store.js` | Recettes perso et modifications de l'utilisateur (localStorage `zc:userdata` ; base partagée quand l'app tourne dans une page Claude) |
| `src/RecipeEditor.jsx` | Saisie d'une recette perso (photo, titre, ingrédients, étapes, « Coller une recette entière ») |
| `src/lib.js` | Utilitaires : formats de temps/quantités, analyse de texte de recette, prompts IA, images |
| `src/season.js` | Saison d'une recette devinée d'après ingrédients et type de plat |
| `src/seasonLogo.jsx` | Accessoire aquarelle à côté de « Zéro » dans le logo, qui change selon la date (`public/assets/saisons/`) |
| `src/news.js` | Journal des nouveautés (le plus récent en premier) |
| `src/onboarding.jsx` | Visite guidée vidéo au format « Stories », affichée au premier lancement |
| `src/speech.js` | Lecture à voix haute (voix française de France par défaut) |
| `src/timers.jsx`, `share.jsx`, `shareCard.js`, `print.jsx`, `nutrition.js`, `pull.jsx` | Minuteurs, partage (lien + QR code), impression A4, macros, tirer pour actualiser |
| `src/stats.js` | Statistiques GoatCounter (`zerochichi`), actives seulement sur `philbass.github.io` |
| `src/imageTools.js` | Détourage des illustrations (partagé avec le script d'illustration) |
| `public/sw.js` | Service worker hors ligne (cache `zero-chichi-vN`) |
| `src/shortLink.js` + `worker/` | Liens courts des recettes perso : service Cloudflare `lien.philbass.workers.dev` (KV `PARTAGES`, recettes gardées un an), mis en ligne par `.github/workflows/lien.yml` (secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Sans réponse en 4 s, l'app garde le lien long. |
| `pages-recettes.mjs` | Au build : une page par recette publiée (`dist/r/<id>/`, aperçu illustré `og.jpg`) qui ouvre `#recette=<id>` ; `public/404.html` rattrape les recettes publiées depuis le dernier build. |

## Ajouter une recette

Dans `src/data.js`, un objet par ligne dans `ALL_RECIPES` :

```js
{"id":"tartiflette","added":"2026-11-13","img":"tartiflette.webp","name":"Tartiflette",
 "cats":["Plats"],"t":50,"p":4,
 "ing":[[1,"kg","pommes de terre"],[200,"g","lardons fumés"],["","","sel, poivre"]],
 "steps":["Fais fondre les oignons émincés.","Enfourne 20 min."],
 "tip":"Accompagne d'une [[sauce-gribiche|sauce gribiche]]."}
```

- `id` : unique, en minuscules avec tirets. Sert aussi de nom d'image (`public/assets/illus/<id>.webp`).
- `added` : date AAAA-MM-JJ. **Une date future = publication programmée** : la recette reste cachée
  jusqu'à ce jour-là, sans remise en ligne. Rythme actuel : lundi, mercredi, vendredi et samedi, dans un
  ordre qui suit les saisons. Montrer la liste et les recettes à Eric avant de programmer.
- `cats` : catégories prises dans `CATS` (Entrées, Soupe, Plats, Viandes, Accompagnement, Pâtes,
  Tartes salées, Desserts, Cakes, Pain, Sauces, Apéro).
- `t` : temps actif en minutes ; `p` : portions de base.
- `ing` : `[quantité, unité, nom]`. Quantité vide ou texte libre (`"300 à 400 g"`) si non ajustable.
- Facultatifs : `tip` (astuce ; lien vers une autre recette avec `[[id|texte]]`), `wait`
  (`[minutes, "de repos"]` : marinade, repos, au frais…), `yield` (`["croque","croques"]` au lieu de
  « pers. »), `parts`, `season` (forcer la saison : `['été']`, `[]` = toute l'année).

**Style de rédaction** : tutoiement, étapes courtes (une action par étape), précisions dans `tip`.

## Illustrations

Style « carnet » : encre sépia et aquarelle, fond retiré, **aucun texte dans l'image**.
Image par défaut (ustensiles) : `public/assets/illus/_defaut.webp`.

Génération automatique (`.github/workflows/illustrations.yml` → `scripts/illustrer.mjs`, API Gemini,
secret `GEMINI_API_KEY`) : sur toute branche autre que `main` qui modifie `src/data.js`, les recettes
sans image reçoivent la leur, commitée sur la branche, avec un aperçu posté sur la Pull Request.

- Prompt : `scripts/illustrations/style.txt` ; mises en scène variées par catégorie : `scenes.json`.
- Refaire une image : commentaire `/refaire id1 id2` sur la PR (par le propriétaire), ou ajouter
  l'identifiant dans `scripts/illustrations/a-refaire.txt`.

## Mise en ligne et hors ligne

- `.github/workflows/pages.yml` : build et publication sur GitHub Pages à chaque envoi sur `main`.
- Quand un changement doit forcer la mise à jour du cache hors ligne, incrémente `CACHE` dans
  `public/sw.js` (`zero-chichi-v6` → `v7`…).
- Les vidéos `.mp4` sont exclues du précache.
