# Study workflow integration

Integrates contributor tip `d33a6b10149920c532d662a541fb80aa390e7231`, preserving original commit history.

## Workflow changes

- Simultaneous composite/RGB views, independent per-channel thresholds and brightness, selected-channel or all-channel analysis.
- ND2 channel mapping from acquisition metadata and calibrated image dimensions where available.
- Reference tiles, sample/group threshold averaging, folder runs, rectangular/freehand ROIs, and sample/group summaries.
- Multi-sheet Excel export with staining, raw tile, sample/group, reference/provenance, embedded image and GraphPad-oriented sheets.
- Pointer annotation of PNG exports without modifying measurements.

## Measurement contract

Fluorescence now measures an explicitly converted 8-bit analysis copy, not the native 16-bit scores used by the preceding release. Conversion ranges and original bit depth are exported; later brightness/contrast changes affect appearance only. Thresholds from the old native workflow are not directly interchangeable with these 0-255 thresholds. Review and record conversion ranges before comparing specimens; automatic per-image scaling is not a common acquisition-intensity scale.

Sirius Red uses the fractional CMYK magenta score `(max(R,G,B)-G)/max(R,G,B)` on the converted copy, with thresholds from 0 to 1. All-black pixels have undefined scores and are excluded from the analyzed denominator. This is an experimental scoring workflow, not a validated collagen assay.

## Integration corrections

1. Saved tile and group identity uses the analysis workflow, not the currently selected marker. Reanalyzing a tile after switching channel controls replaces that tile rather than adding another statistical observation. Manual and folder analysis use matching identities.
2. Excel worksheet-name collision checks are case-insensitive, matching ExcelJS/Excel rules, so marker labels differing only in capitalization export successfully.
3. Fluorescence exports identify the converted 8-bit scoring algorithm rather than incorrectly describing measurements as native integer scores.
4. Scope the ExcelJS `uuid` override to `11.1.1`, the patched version for GHSA-w5hq-g745-h8pq. Keep unrelated dependency upgrades out of this feature integration.

## Verification

```sh
npm ci --no-audit --no-fund
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
python -m unittest discover -s analysis-service -p 'test_*.py' -v
npm audit --audit-level=moderate
```

The first integration verification passed 50 web tests and 36 analysis tests, plus TypeScript, lint and build. Audit remains a failing gate: 18 pre-existing findings (17 high, 1 critical). This is not an all-green security release.

For a protected Docker deployment, run the real browser regression using Python with Pillow and Playwright plus installed Chromium:

```sh
SMOKE_CONTAINER=your-explicit-web-container \
SMOKE_OUTPUT=/absolute/path/to/scratch/browser-evidence \
python3 scripts/browser-smoke.py
```

The script reads the existing assertion inside the selected container into process memory without printing it. It does not modify authentication or test a public Basic Auth login. It exercises actual browser UI, native TIFF/JP2 decoding, known-value 8-bit conversion and inclusive thresholds, appearance/measurement separation, RGB measurements, duplicate-tile prevention, folder analysis, Excel sheets/images, pointer PNG export, Sirius scoring, and rectangular/freehand ROIs. Fixtures are explicitly synthetic and persist only in the supplied evidence directory and disposable browser context.

Companion tests cover ND2 mapping/calibration metadata; no real laboratory ND2 acquisition or scientific-method validation is claimed by these engineering checks. Studies remain browser-session state: export results before refreshing or closing the page.
