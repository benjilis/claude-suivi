# Claude Suivi

Petite appli Windows (Electron) qui vit dans la zone de notification et montre d'un coup d'œil ce que font tes sessions Claude en parallèle : le point, les actions qui t'attendent, une carte par session, un bloc-notes.

Les sessions Claude la mettent à jour toutes seules grâce à un *skill* qui appelle une petite API locale.

## Installation sur un nouveau PC

Prérequis : Node.js et Git.

```bash
git clone <url-du-depot> claude-suivi
cd claude-suivi
npm ci
npm run install-skill
npm start
```

- `npm run install-skill` copie le skill dans `%USERPROFILE%\.claude\skills\claude-suivi\`.
- Ensuite, on peut aussi lancer l'appli avec le raccourci **`Lancer Claude Suivi.bat`**.

## Utilisation

- **Clic gauche** sur l'icône : le panneau s'ouvre au-dessus ; re-clic ou clic ailleurs : il se replie.
- **Clic droit** : Ouvrir, Tout effacer, Lancer au démarrage, Notifications, Quitter.
- Un point rouge apparaît sur l'icône (et une notification Windows discrète) quand une session passe à « attend ta réponse » ou « bloqué ».
- Les cartes « fait » de plus de 24 h se replient dans « Terminés ».

### Lancer au démarrage de Windows

Désactivé par défaut. Active-le dans le menu clic droit ou via l'engrenage ⚙ du panneau.

## API locale

Écoute **uniquement sur `127.0.0.1:4777`** (jamais sur le réseau). Les requêtes venant d'un navigateur (en-tête `Origin`) ou d'un autre nom d'hôte sont refusées.

| Route | Rôle |
|---|---|
| `GET /sante` | `{ "ok": true }` : l'appli tourne |
| `GET /etat` | tout l'état en JSON |
| `PUT /sessions/:id` | crée/met à jour une carte : `{ titre, projet, etat, detail, aToi? }` |
| `DELETE /sessions/:id` | supprime une carte |
| `PUT /point` | `{ texte }` : le résumé en haut du panneau |
| `POST /actions` | `{ texte, projet? }` : ajoute une action « à toi de jouer » |
| `DELETE /actions/:id` | retire une action |

`etat` vaut `encours`, `attente`, `bloque`, `fait` ou `afaire`. `points` (facultatif, liste de puces courtes) s'affiche en plein écran (bouton ⛶). `lien` (facultatif, `https://`, `http://` ou `claude://`) rend la carte cliquable. Les textes sont coupés avec « … » : titre 60 caractères, projet 40, detail 140, action 100, point 200. Détails et exemples PowerShell/curl : [skill/claude-suivi/SKILL.md](skill/claude-suivi/SKILL.md).

## Où sont les données

`%APPDATA%\claude-suivi\etat.json` (état) et `reglages.json` (notifications). Hors du dépôt, donc jamais versionnées.

## Développement

```bash
npm test
```

Tests de l'API (`node:test`) : chaque route, persistance, refus des connexions non locales.
