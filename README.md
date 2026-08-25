# KidneyQuant

![KidneyQuant](public/og.png)

KidneyQuant is a private, self-hostable kidney tissue stain-analysis workbench. It supports project-specific thresholds while keeping the analysis workflow consistent across stains.

## Current capabilities

- TIFF and JP2 decoding and analysis in the browser
- ND2 decoding through the included private Python companion service
- Stain modes for alpha-SMA IF, vimentin IF, lotus lectin/LTL IF, Sirius Red, PAS, and H&E
- Configurable fluorescence signal channel and positive-stain thresholds
- Connected slide-background detection with exclusion or separate reporting
- Analyst-reviewed regions for glomeruli, podocytes, proximal tubules, all tubules, interstitial tissue, or whole tissue
- Overlay, original-image, and binary-mask review views
- CSV export with Sample ID, positive-area percentage, area, positive area, mean, mode, min, max, perimeter, IntDen, RawIntDen, and threshold values

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Self-host with ND2 support

```bash
cp .env.example .env
docker compose up -d --build
```

See [SELF_HOSTING.md](SELF_HOSTING.md) for custom-domain deployment and an email allowlist through Cloudflare Access.

## Private review copy

The current ChatGPT Site is an owner-only review deployment:

https://kidneyquant-lab-test.nerfan143.chatgpt.site

It is not the required production host. The application and ND2 companion can be hosted on infrastructure and a domain controlled by the lab.

## Scientific scope

This is a research-use workflow. Structure-specific regions are currently selected and reviewed by the analyst; they are not produced by an unvalidated automatic histology model. ND2 processing uses the first available image plane and normalizes it to 8-bit for browser review.

Before publication or clinical use, validate thresholds, channel assignments, background tolerance, ROI selection, and agreement with the lab's Fiji workflow on a blinded test set. Add pixel calibration when physical units such as µm² or µm are required.
