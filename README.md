# BreachLookup

OSINT / data-breach tool. Python CLI + click-server backend + GitHub Pages control panel.

## Website (GitHub Pages)

- **Lookup** – client-side password breach check (HIBP k-anonymity), email check, fingerprint demo
- **Gen Link / QR** – create shortened tracking link + QR pointing at your backend
- **Click Capture** – served by your Python server; fingerprints the device, grabs saved email/phone via autofill, POSTs to `/report`

## Run the backend (click-server)

```bash
pip install requests
python3 breach_lookup.py serve --email alert@yourdevice.com --port 8080
# expose it:
ngrok http 8080
```

Then open the Gen Link page, paste your ngrok URL, optionally add a breach-check target email, hit Generate — send the QR/link to the device. On click: fingerprint + breach lookup → terminal + email + `clicks.jsonl`.

## One-off lookups

```bash
python3 breach_lookup.py lookup victim@example.com --email alert@you.com --json
python3 breach_lookup.py lookup https://site.com
python3 breach_lookup.py genlink --base https://abc.ngrok.io --target victim@x.com
```

## API keys (env)

| Key | Source |
|---|---|
| `HIBP_API_KEY` | haveibeenpwned.com |
| `LEAKIX_API_KEY` | leakix.net |
| `DEHASHED_API_KEY` + `DEHASHED_EMAIL` | dehashed.com |
| `VT_API_KEY` | virustotal.com |
| `SMTP_USER` / `SMTP_PASS` | your mail sender |

Reports print to terminal (colored), email to the device address, and append to `clicks.jsonl`. Exit code 1 = breach hit.