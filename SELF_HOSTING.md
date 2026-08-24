# Self-host KidneyQuant on your own domain

KidneyQuant is designed to run from infrastructure and a domain you control. The private ChatGPT Site is only a review copy; it is not a required production host.

## What runs where

- TIFF and JP2 analysis runs in the user's browser. Those source files are not stored by the website.
- ND2 is decoded by the private companion container, returned as a normalized PNG plane, and deleted from temporary storage after the request.
- CSV exports are downloaded by the user. This version intentionally has no project database or image archive.

## Start the private server

1. Install Docker Desktop or Docker Engine with the Compose plugin.
2. Copy `.env.example` to `.env` and set `NEXT_PUBLIC_SITE_ORIGIN` to the HTTPS address you own.
3. From this folder, run `docker compose up -d --build`.
4. Keep port 3000 bound to localhost, as supplied in `docker-compose.yml`; do not expose it directly to the public internet.

For local testing, open `http://localhost:3000`.

## Put it on your domain with an email allowlist

The simplest production route is Cloudflare Tunnel plus Cloudflare Access:

1. Add your domain to your Cloudflare account.
2. Create a Tunnel whose public hostname points to `http://web:3000`.
3. Paste its token into `CF_TUNNEL_TOKEN` in `.env`.
4. In Cloudflare Zero Trust, create an Access self-hosted application for the same hostname.
5. Add an **Allow** policy containing only the lab email addresses or email domain that should enter.
6. Start the domain profile with `docker compose --profile domain up -d`.

KidneyQuant accepts the authenticated email header from Cloudflare Access. Keep the origin private so visitors cannot bypass Access by connecting directly to the server.

Official setup references:

- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/
- Cloudflare Access applications: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- Access policies: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/

## Scientific scope

This build provides threshold-based positive-area quantification, connected slide-background exclusion, structure-specific manual regions, and CSV metrics. Structure labels are analyst-reviewed rectangles; they are not an unvalidated automatic histology model. ND2 processing uses the first available image plane and normalizes it to 8-bit for browser review.

Before using the results in a paper or clinical workflow, validate the thresholds, channel assignment, background tolerance, ROI method, and agreement with the lab's Fiji reference workflow on a blinded test set. Add pixel calibration if physical units such as µm² or µm are required.
