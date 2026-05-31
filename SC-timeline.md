# SC-timeline (lecture + édition locale)

## Pages
- `index.html` : lecture publique
- `editor.html` : redirection vers `#edit` (édition locale)

## Données
- `data/timeline_base.json` : base canonique versionnée
- `data/timeline_overrides.local.json` : couche d’overrides versionnée (optionnelle, commitée en branche)
- `localStorage` navigateur (`tikitoki_overrides_<timeline_id>_v3`) : overrides locaux de l’utilisateur courant

## Fonctionnement
- En lecture (`#timeline`) : la timeline est rendue à partir de la base canonique.
- En édition (`#edit`) : création/modification/suppression locales dans le navigateur.
- Ordre de composition au démarrage :
  1. `data/timeline_base.json`
  2. `data/timeline_overrides.local.json` (si présent et valide)
  3. overrides `localStorage` (prioritaires sur le fichier versionné)
- Si `data/timeline_overrides.local.json` est absent, le chargement continue sans erreur bloquante.
- Les boutons d’édition locale permettent :
  - **Exporter les modifications (JSON)** : export des overrides du navigateur en `timeline_overrides.local.json`
  - **Importer des modifications (JSON)** : import dans le `localStorage` local (validation stricte du JSON)
  - **Effacer les modifications locales** : suppression du `localStorage` uniquement (sans toucher à la base ni au fichier versionné)
- Un indicateur affiche le nombre de modifications locales actives dans le navigateur.

## Workflow GitHub recommandé (variante A)
1. Travailler localement en `#edit`.
2. Exporter les modifications locales en JSON.
3. Placer/renommer le fichier en `data/timeline_overrides.local.json`.
4. Commit ce fichier manuellement dans une branche GitHub dédiée.
5. Ouvrir une PR pour revue et application ultérieure des modifications.

Différence entre les 3 couches :
- **Base canonique** : historique de référence partagé (`timeline_base.json`).
- **Overrides versionnés** : modifications partagées/revues via Git (`timeline_overrides.local.json`).
- **Modifications locales navigateur** : travail local temporaire, non synchronisé automatiquement.

La séparation base + overrides facilite la revue GitHub manuelle en branche, sans backend.

## Cache Busting (Automatic)

To ensure users always receive the latest JavaScript and CSS files without manual hard refreshes, this repository uses automatic cache busting:

- **How it works**: Every time code is pushed to the `main` branch, a GitHub Actions workflow automatically updates the asset URLs in `index.html` to include a version query parameter (e.g., `?v=abc1234`) based on the current commit SHA.

- **Affected assets**:
  - `./assets/app.css`
  - `./assets/router.js`
  - `./assets/app.js`

- **No manual intervention needed**: The version strings are updated automatically on every commit, so users will always fetch the latest assets when visiting the GitHub Pages site.

- **Workflow details**: See `.github/workflows/cache-bust.yml` for implementation. The workflow avoids infinite loops by skipping commits that only update version strings.

## Notes
- Les modifications d’interface se font dans `assets/app.js` et `assets/app.css` (partagés par lecture + édition).
