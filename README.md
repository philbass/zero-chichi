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
