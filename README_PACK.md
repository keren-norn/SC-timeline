# SC-timeline — pack GitHub (workflow hybride)

Ce pack ajoute un outil de **fusion d’overrides** + une structure d’archives.

## Fichiers
- `merge_overrides_1771887.html` : fusionne 2 exports JSON (A et B) et génère un JSON fusionné.
- `data/README.md` : explique comment archiver volontairement des snapshots.
- `data/snapshots/` : dossier conseillé pour stocker les snapshots datés.

## Où les mettre (repo GitHub)
À la racine du repo :
- `Time-Line_SC.html` (ton viewer, déjà présent)
- `Export_TMSC.json` (ton export base, déjà présent)
- `merge_overrides_1771887.html` (outil fusion)

Et ajoute le dossier `data/` (optionnel mais recommandé).

## Utilisation du fusionneur
1. Ouvre `merge_overrides_1771887.html`
2. Charge ton JSON (A) + celui de ton ami (B)
3. Clique **Fusionner**
4. Télécharge `tikitoki_edits_1771887_merged.json`
5. Dans le viewer, clique **Importer (JSON)** et importe le fichier fusionné.

## Archive volontaire (recommandé)
Quand tu veux “figer” un état :
1. Exporte tes overrides (bouton Exporter dans le viewer)
2. Renomme et commit dans `data/snapshots/` :
   - `overrides_1771887_YYYY-MM-DD.json`
