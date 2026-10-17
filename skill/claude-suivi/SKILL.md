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
| `aToi` | (facultatif) action pour l'utilisateur, ajoutée à « À toi de jouer » |
| `lien` | (facultatif) lien cliquable qui ouvre la session : `https://…` ou `claude://…`. **Ne l'invente jamais** : mets-le seulement si tu connais l'adresse exacte, sinon omet le champ. `""` l'efface |

**Textes courts, lisibles d'un coup d'œil** (le surplus est coupé avec « … ») : `titre` 60 caractères, `projet` 40, `detail` 140, `aToi` 100, `point` 200. Écris des phrases brèves, sans détails techniques.

**Id stable** : `projet-sujet` en minuscules sans espaces ni accents (ex. `mon-site-accueil`). Garde **le même id** pendant toute la session pour mettre à jour la même carte. L'id va dans l'URL, jamais d'espaces.

Autres routes : `DELETE /sessions/:id`, `PUT /point` `{ "texte": "..." }` (résumé global d'une phrase), `POST /actions` `{ "texte": "...", "projet": "..." }`, `DELETE /actions/:id`, `GET /etat`.

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
