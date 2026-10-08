# Glomerular outlines integration

Contributor branch: `lailajuma-coder/Quantification:codex/glomerular-outlines`.
Contributor tip: `0f6400ed5f3ce1dcecc9c113ab9abcae6baeaabc`.
Integration base: `9b4f2c434fa039c6846e97ca27850c83c968c04c`.

The six original commits are merged without rewriting contributor history. Their older baseline is reconciled with the current RGB controls, converted 8-bit fluorescence workflow, Sirius scoring, grouped studies, Excel export, PNG annotations, and existing authentication.

## Measurement behavior

- Choose **Glomeruli** and draw closed outlines on the composite pane. The result is one pooled pixel-union measurement per tile and selected channel. Overlaps count once. It is not the unweighted mean of individual glomerular percentages.
- Choose **Interstitial region** to reuse the same outlines as exclusions from both positive and analyzed pixels. Without tissue ROIs, all non-background pixels outside the glomerular union are eligible. Rectangular or freehand tissue ROIs further restrict the eligible region.
- Slide-background exclusion, when enabled, is applied in addition to the glomerular mask. An empty analyzed region raises an error instead of reporting a misleading valid zero.
- Outlines survive category changes within the current image. Opening any image clears them; they are never copied into other tiles or automated folder runs.
- Accepted study thresholds continue to work with manual per-tile analysis. Finalized records retain their own outline coordinates even after the current image changes.
- JSON/CSV and the Excel provenance/reference sheets retain the geometry and include/exclude-union handling. PNG images and saved-study images show orange numbered outlines. Preview/PNG coordinates are scaled from full-resolution source coordinates.
- Export schema advances from `1.4.0-experimental` to `1.5.0-experimental`; it does not regress to the contributor branch's older schema number.

## Integration checks

`npm test` passes 55 tests, including pooling, overlap union, interstitial complement, background interaction, polygon boundaries, outline snapshot isolation, and Excel reference geometry. Existing ROI tests continue to exercise generic tissue polygons separately from the new glomerular-outline field. TypeScript, lint and production build pass.

The existing `scripts/browser-smoke.py` is extended rather than replaced. It still exercises TIFF/JP2 conversion, channel settings, study replacement, folder analysis, Excel export, annotated PNG and ordinary freehand ROIs. A synthetic 960 by 320 pixel image additionally exercises full-resolution union/complement counts, independently calculated expected areas, downsampled RGB overlay pixels, retained category-switch geometry, JSON/CSV/Excel/PNG exports and clearing on file change.

```sh
npm ci --no-audit --no-fund
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
SMOKE_CONTAINER=your-explicit-web-container \
SMOKE_OUTPUT=/absolute/path/to/scratch/browser-evidence \
python3 scripts/browser-smoke.py
```

Browser acceptance uses synthetic images through the protected internal application connection, not a public Basic Auth login or laboratory-method validation. No real-acquisition ND2 validation is claimed. This change does not alter the private decoder, deployment topology, dependencies or auth policy. The existing dependency audit remains a failing gate with 18 findings (17 high, 1 critical).

Studies remain session-local. Export saved results before refreshing or closing the browser.
