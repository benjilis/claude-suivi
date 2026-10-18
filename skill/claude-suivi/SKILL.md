---
name: claude-suivi
description: Mettre à jour le panneau Claude Suivi quand une session démarre, change d'étape, attend l'utilisateur, est bloquée ou termine. À utiliser pour signaler l'état de la session en cours à l'appli locale Claude Suivi (API sur 127.0.0.1:4777).
---

# Claude Suivi

L'utilisateur a une petite appli Windows (zone de notification) qui affiche une carte par session Claude. Tu la tiens à jour avec des appels HTTP locaux très courts. C'est discret : pas de commentaire à l'utilisateur sur ces appels.

## Règle d'or : vérifier que l'appli tourne

Avant tout, un seul test :

```powershell
try { Invoke-RestMethod http://127.0.0.1:4777/sante -TimeoutSec 2 | Out-Null; $ok = $true } catch { $ok = $false }
```
```bash
curl -s -m 2 http://127.0.0.1:4777/sante
```

**Si ça échoue : ne fais rien, n'insiste pas, ne réessaie pas, ne le mentionne pas.** L'appli n'est simplement pas lancée. Ne la lance pas toi-même.

## Quand appeler

- **Début de session / de chantier** : `etat: "encours"`.
- **Changement d'étape notable** : mets à jour `detail` (1 ou 2 phrases).
- **Tu attends l'utilisateur** (question, validation, choix) : `etat: "attente"` + `aToi` = ce qu'il doit faire.
- **Tu es bloqué** (erreur, accès manquant) : `etat: "bloque"` + `detail` = la cause.
- **Terminé** : `etat: "fait"`.
- Travail prévu mais pas commencé : `etat: "afaire"`.

N'appelle pas à chaque commande : seulement aux changements qui comptent.

## Champs — `PUT /sessions/:id`

| Champ | Contenu |
|---|---|
| `titre` | Nom court du chantier (« Refonte de la page d'accueil ») |
| `projet` | Nom du projet / dossier (« mon-site ») |
| `etat` | `encours`, `attente`, `bloque`, `fait` ou `afaire` |
| `detail` | 1-2 lignes : ce qui se passe maintenant |
| `aToi` | (facultatif) action pour l'utilisateur, ajoutée à l'onglet **To do** du panneau |
| `points` | (facultatif) 3 à 6 puces très courtes (120 caractères max chacune) : ce qui est fait, en cours, à venir. Visibles seulement quand l'utilisateur ouvre le panneau en plein écran. Remplace la liste précédente ; omis = inchangé |
| `lien` | (facultatif) lien cliquable qui ouvre la session : `https://…` ou `claude://…`. **Ne l'invente jamais** : mets-le seulement si tu connais l'adresse exacte, sinon omet le champ. `""` l'efface |

**Textes courts, lisibles d'un coup d'œil** (le surplus est coupé avec « … ») : `titre` 60 caractères, `projet` 40, `detail` 140, `aToi` 100, `point` 200. Écris des phrases brèves, sans détails techniques.

**Id stable** : `projet-sujet` en minuscules sans espaces ni accents (ex. `mon-site-accueil`). Garde **le même id** pendant toute la session pour mettre à jour la même carte. L'id va dans l'URL, jamais d'espaces.

Exemple de puces (PowerShell) : `@{ points = @('✔ Tests écrits', '… Page d accueil en cours', 'À faire : relecture') }` ; en JSON : `"points":["✔ Tests écrits","… En cours : accueil"]`.

## Activité et To do (deux onglets du panneau)

Sous « Le point », le panneau a deux onglets :

- **Activité** : le journal des dernières mises à jour (heure, session, état, phrase). **Il se remplit tout seul** à chaque `PUT /sessions/:id` qui change l'état ou le `detail` : pas d'appel en plus. Pour noter un fait qui n'est pas un changement de carte (build vert, fichier livré, décision prise) : `POST /activite` avec `{ "texte": "...", "projet": "...", "etat": "fait" }` (`projet` et `etat` facultatifs ; texte 140 caractères max ; 50 entrées gardées, 24 h).
- **To do** : les petites choses **à faire dans la foulée** que l'utilisateur risque d'oublier (relancer un test, mettre à jour la doc, répondre à quelqu'un, vérifier un résultat). **C'est à toi de le remplir** : dès que tu repères une tâche de suivi, ajoute-la avec `POST /actions` `{ "texte": "...", "projet": "..." }` (100 caractères max, une action = une chose concrète, à l'impératif : « Relancer les tests »). Le `aToi` d'une carte atterrit aussi ici. L'utilisateur la coche pour la retirer ; si tu l'as faite toi-même, retire-la avec `DELETE /actions/:id` (l'id est renvoyé par le POST, ou dans `GET /etat` → `actions`). Pas de doublons : lis `GET /etat` avant d'ajouter si tu n'es pas sûr.

Exemples PowerShell :

```powershell
$corps = @{ texte = 'Relancer les tests après la fusion'; projet = 'mon-site' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4777/actions' -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($corps)) -TimeoutSec 3 | Out-Null

$corps = @{ texte = 'Build vert, 18 tests passent'; projet = 'mon-site'; etat = 'fait' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4777/activite' -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($corps)) -TimeoutSec 3 | Out-Null
```

Exemple bash :

```bash
curl -s -m 3 -X POST http://127.0.0.1:4777/actions -H 'Content-Type: application/json; charset=utf-8' --data-binary @- >/dev/null <<'JSON'
{"texte":"Relancer les tests après la fusion","projet":"mon-site"}
JSON
```

Autres routes : `DELETE /sessions/:id`, `PUT /point` `{ "texte": "..." }` (résumé global d'une phrase), `POST /actions`, `DELETE /actions/:id`, `POST /activite`, `GET /etat`.

## Exemples PowerShell (accents corrects : corps envoyé en octets UTF-8)

```powershell
$corps = @{ titre = "Refonte de l'accueil"; projet = 'mon-site'; etat = 'encours'; detail = 'Écriture des tests de la page.' } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri 'http://127.0.0.1:4777/sessions/mon-site-accueil' -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($corps)) -TimeoutSec 3 | Out-Null
```

J'attends l'utilisateur :

```powershell
$corps = @{ etat = 'attente'; detail = 'Deux maquettes possibles.'; aToi = 'Choisir la maquette A ou B' } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri 'http://127.0.0.1:4777/sessions/mon-site-accueil' -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($corps)) -TimeoutSec 3 | Out-Null
```

Le résumé global :

```powershell
$corps = @{ texte = '3 chantiers : 1 en cours, 1 attend ta réponse.' } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri 'http://127.0.0.1:4777/point' -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($corps)) -TimeoutSec 3 | Out-Null
```

(Les champs omis dans `PUT /sessions/:id` gardent leur valeur précédente : pour passer à « fait », `@{ etat = 'fait' }` suffit.)

## Exemples bash (curl)

Sous Windows (Git Bash), les accents écrits directement dans la ligne de commande sont abîmés : envoie le JSON **par heredoc** (`--data-binary @-`), l'UTF-8 reste correct. Sous Windows, préfère PowerShell si possible.

```bash
curl -s -m 3 -X PUT http://127.0.0.1:4777/sessions/mon-site-accueil \
  -H 'Content-Type: application/json; charset=utf-8' --data-binary @- >/dev/null <<'JSON'
{"titre":"Refonte de la page d'accueil","projet":"mon-site","etat":"encours","detail":"Écriture des tests de la page."}
JSON

curl -s -m 3 -X PUT http://127.0.0.1:4777/sessions/mon-site-accueil \
  -H 'Content-Type: application/json; charset=utf-8' --data-binary @- >/dev/null <<'JSON'
{"etat":"attente","detail":"Deux maquettes possibles.","aToi":"Choisir la maquette A ou B"}
JSON
```

## Interdits

- **Jamais de secrets** (mots de passe, clés API, tokens, contenu de fichiers .env) dans aucun champ.
- Pas de données personnelles inutiles : titres et détails courts et factuels.
- Une erreur de l'API (non 2xx, délai dépassé) : ignore-la et continue ton travail.

## Pièges de guillemets

- **PowerShell** : entre apostrophes `'...'`, une apostrophe (même typographique `’`) casse la chaîne. Dès qu'un texte contient une apostrophe, utilise des guillemets doubles `"l'accueil"`.
- **bash** : avec le heredoc entouré de `'JSON'`, les apostrophes sont libres.
