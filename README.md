# Zéro Chichi

Application de recettes courtes, construite d'après la maquette Claude Design (direction « 1a », 8 écrans) :
accueil, recherche avec filtres, catégories, liste, fiche recette (portions ajustables), mode cuisine pas à pas,
favoris et liste de courses.

- React + Vite, sans autre dépendance.
- PWA : installable sur l'écran d'accueil, fonctionne hors ligne.
- Favoris et courses sont gardés sur l'appareil (localStorage).
- Sur téléphone, l'app occupe tout l'écran ; sur ordinateur, elle s'affiche dans un cadre de téléphone.
- Les recettes sont dans `src/data.js`, les illustrations dans `public/assets/illus/`.

```bash
npm install
npm run dev      # développement
npm run build    # version de production dans dist/
```

## Mise en ligne

Chaque envoi sur `main` publie l'app sur GitHub Pages (`.github/workflows/pages.yml`).
Sur le téléphone, ouvre l'adresse du site puis « Sur l'écran d'accueil » (iPhone, Safari) ou « Installer l'application » (Android, Chrome).

## Illustrations automatiques

Quand une recette est ajoutée sur une branche de travail sans illustration, l'automatisme
`.github/workflows/illustrations.yml` la génère avec Gemini dans le style « carnet »
(`scripts/illustrations/style.txt` + images de `scripts/illustrations/references/`),
retire le fond vert, l'ajoute à la branche et poste un aperçu sur la Pull Request.

- Clé API : secret GitHub `GEMINI_API_KEY`.
- Refaire une image : commentaire `/refaire identifiant` sur la Pull Request,
  ou ajouter l'identifiant dans `scripts/illustrations/a-refaire.txt`.
- Rien n'est mis en ligne tant que la Pull Request n'est pas fusionnée.
