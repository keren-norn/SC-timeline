# SC-timeline (lecture + édition locale)

## Pages
- `index.html` : lecture publique
- `editor.html` : redirection vers `#edit` (édition locale)

## Données
- `data/timeline_base.json` : base canonique versionnée
- `data/timeline_overrides.local.json` : fichier d’overrides recommandé pour export/import manuel (branche GitHub)

## Fonctionnement
- En lecture (`#timeline`) : la timeline affiche `data/timeline_base.json`.
- En édition (`#edit`) : création/modification/suppression locales dans le navigateur.
- Les overrides d’édition sont stockés en `localStorage` (clé `tikitoki_overrides_<timeline_id>_v3`).
- Le bouton **Exporter overrides JSON** télécharge `timeline_overrides.local.json`.
- Le bouton **Importer overrides JSON** recharge un fichier d’overrides dans l’état local.

## Workflow GitHub recommandé (variante A)
1. Travailler localement en `#edit`.
2. Exporter le fichier d’overrides JSON.
3. Placer/renommer le fichier en `data/timeline_overrides.local.json`.
4. Commit ce fichier manuellement dans une branche GitHub dédiée.
5. Ouvrir une PR pour revue et application ultérieure des modifications.

La base (`timeline_base.json`) et les overrides (`timeline_overrides.local.json`) restent séparés conceptuellement pour faciliter la revue et les merges manuels.

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
