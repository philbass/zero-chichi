// Journal des nouveautés. La plus récente en premier.
// Les nouvelles recettes sont retrouvées automatiquement grâce à leur date d'ajout (champ `added`).
export const NEWS = [
  {
    id: '2026-11-14',
    date: '2026-11-14',
    title: 'Partage, tablette et macros',
    groups: [
      {
        name: 'Partager',
        items: [
          { icon: 'send', title: 'Envoie tes recettes perso', text: "Un simple lien : ton ami ajoute ta recette à son app d'un geste.", top: true },
          { icon: 'share', title: "Partage l'app", text: "Bouton en haut de l'accueil, avec un QR code à faire scanner.", action: 'app', top: true },
          { icon: 'link', title: 'Lien direct vers une recette', text: "Le lien, et le QR code au bas de la fiche image, ouvrent la recette dans l'app." },
          { icon: 'install', title: 'Installation guidée', text: "Une bannière explique comment mettre l'app sur l'écran d'accueil." },
        ],
      },
      {
        name: 'En cuisine',
        items: [
          { icon: 'chart', title: 'Les macros de chaque recette', text: 'Calories, protéines, glucides et lipides estimés par personne.', action: 'random', top: true },
          { icon: 'clock', title: "Temps d'attente à part", text: "« 45 min + 6 h de marinade » : tu vois tout de suite le temps passé en cuisine." },
          { icon: 'tablet', title: 'Mode tablette', text: 'Plein écran, fiche sur deux colonnes, ingrédients toujours visibles en cuisinant.' },
        ],
      },
      {
        name: 'Plus de plaisir',
        items: [
          { icon: 'dice', title: 'Au hasard', text: "3 recettes tirées à chaque lancement. Le dé en propose trois autres.", action: 'home' },
          { icon: 'sparkle', title: 'Des animations', text: 'Cœur qui bat, ingrédients qui filent vers les courses, confettis quand c\'est prêt.' },
          { icon: 'image', title: 'Photos détourées', text: 'Quand tu ajoutes une recette perso, ta photo est détourée et le titre retiré.', action: 'new' },
          { icon: 'sort', title: 'Catégories rangées', text: 'Les recettes les plus récentes en premier.' },
        ],
      },
    ],
    fixes: [
      'Nouvelles illustrations : crêpes, cake jambon-olives, cake au citron, cake chorizo-chèvre.',
      'Sauce chien : cives (ou ciboules) à la place de la cébette.',
    ],
  },
];

export const NEWS_ICONS = {
  send: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4z'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4M12 2v13'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  install: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 7v5l3 2'],
  tablet: ['M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M11 18h2'],
  dice: ['M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z', 'M8.5 8.5h.01M15.5 15.5h.01M15.5 8.5h.01M8.5 15.5h.01'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 17l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8.5 7a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3', 'm21 15-5-5L5 21'],
  sort: ['M3 6h13M3 12h9M3 18h5', 'M18 8v12m0 0-3-3m3 3 3-3'],
};

const KEY = 'zc:newsSeen'; // carte « Quoi de neuf ? » fermée
const VISITED = 'zc:newsVisited'; // page « Nouveautés » ouverte
// Premier lancement de l'app : rien n'est « nouveau » pour quelqu'un qui découvre tout.
const FIRST_VISIT = (() => { try { return !localStorage.getItem('zc:favs') && !localStorage.getItem(KEY); } catch { return false; } })();
if (FIRST_VISIT) { try { localStorage.setItem(KEY, NEWS[0].id); localStorage.setItem(VISITED, NEWS[0].id); } catch { /* stockage indisponible */ } }

export const latestNews = NEWS[0];
export const newsSeen = () => { try { return localStorage.getItem(KEY) === NEWS[0].id; } catch { return true; } };
export const markNewsSeen = () => { try { localStorage.setItem(KEY, NEWS[0].id); } catch { /* stockage indisponible */ } };
export const newsVisited = () => { try { return localStorage.getItem(VISITED) === NEWS[0].id; } catch { return true; } };
export const markNewsVisited = () => { try { localStorage.setItem(VISITED, NEWS[0].id); } catch { /* stockage indisponible */ } };
