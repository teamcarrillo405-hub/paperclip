#!/bin/bash
# ============================================================
# Avero Enterprise — SSL Certificate Setup
# Usage:
#   bash scripts/setup-ssl.sh                         # self-signed (local dev)
#   bash scripts/setup-ssl.sh --domain example.com    # Let's Encrypt (production)
#   bash scripts/setup-ssl.sh --domain example.com --email admin@example.com
# ============================================================
set -euo pipefail

CERTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/nginx/certs"
DOMAIN=""
EMAIL=""

# ----------------------------------------------------------
# Parse arguments
# ----------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Usage: $0 [--domain <domain>] [--email <email>]"
            exit 1
            ;;
    esac
done

mkdir -p "$CERTS_DIR"

# ----------------------------------------------------------
# Let's Encrypt path (requires certbot + public domain)
# ----------------------------------------------------------
if [[ -n "$DOMAIN" ]] && command -v certbot &> /dev/null; then
    echo "[setup-ssl] Using Let's Encrypt for domain: $DOMAIN"

    CERTBOT_ARGS=(
        "certonly"
        "--standalone"
        "--non-interactive"
        "--agree-tos"
        "--domain" "$DOMAIN"
    )

    if [[ -n "$EMAIL" ]]; then
        CERTBOT_ARGS+=("--email" "$EMAIL")
    else
        CERTBOT_ARGS+=("--register-unsafely-without-email")
    fi

    certbot "${CERTBOT_ARGS[@]}"

    CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
    cp "$CERT_PATH/fullchain.pem" "$CERTS_DIR/cert.pem"
    cp "$CERT_PATH/privkey.pem"   "$CERTS_DIR/key.pem"

    echo "[setup-ssl] Certificates copied to $CERTS_DIR"
    echo "[setup-ssl] Add a cron job for auto-renewal:"
    echo "            0 0 * * * certbot renew --quiet && docker compose -f docker-compose.avero.yml exec nginx nginx -s reload"

# ----------------------------------------------------------
# Self-signed fallback (local dev / no certbot)
# ----------------------------------------------------------
elif command -v openssl &> /dev/null; then
    if [[ -n "$DOMAIN" ]]; then
        echo "[setup-ssl] certbot not found — falling back to self-signed certificate for $DOMAIN"
        SUBJ="/CN=$DOMAIN"
        SAN="DNS:$DOMAIN"
    else
        echo "[setup-ssl] Generating self-signed certificate for localhost (dev only)"
        SUBJ="/CN=localhost"
        SAN="DNS:localhost,IP:127.0.0.1"
    fi

    openssl req \
        -x509 \
        -nodes \
        -days 365 \
        -newkey rsa:2048 \
        -keyout "$CERTS_DIR/key.pem" \
        -out    "$CERTS_DIR/cert.pem" \
        -subj   "$SUBJ" \
        -extensions v3_req \
        -addext "subjectAltName=$SAN" \
        2>/dev/null

    echo "[setup-ssl] Self-signed certificate generated:"
    echo "            $CERTS_DIR/cert.pem"
    echo "            $CERTS_DIR/key.pem"
    echo ""
    echo "  NOTE: Browsers will show a security warning for self-signed certs."
    echo "        For production use --domain with a public DNS record and certbot installed."

else
    echo "ERROR: Neither certbot nor openssl found. Install one and re-run this script."
    exit 1
fi

echo "[setup-ssl] Done."
