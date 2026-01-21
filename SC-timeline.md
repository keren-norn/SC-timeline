# SC-timeline (lecture + édition collaborative)

## Pages
- `index.html` : lecture publique
- `editor.html` : édition collaborative (login Supabase)

## Données
- `data/tiki_toki_1771887.json` : base (lecture seule)
- Supabase table `timeline_overrides` : overrides (modifs)

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
