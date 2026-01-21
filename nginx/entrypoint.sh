#!/bin/bash
set -e

NGINX_MODE=${NGINX_MODE:-development}
HOSTNAME=${HOSTNAME:-localhost}

echo "[nginx] Starting in $NGINX_MODE mode..."

# ============================================================================
# DEVELOPMENT MODE - Generate self-signed certificate
# ============================================================================
if [ "$NGINX_MODE" = "development" ]; then
    echo "[nginx] Generating self-signed certificate for $HOSTNAME..."
    
    CERT_DIR="/etc/letsencrypt/live/$HOSTNAME"
    mkdir -p "$CERT_DIR"
    
    # Generate private key and self-signed cert (valid for 365 days)
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$CERT_DIR/privkey.pem" \
        -out "$CERT_DIR/fullchain.pem" \
        -subj "/CN=$HOSTNAME"
    
    echo "[nginx] Self-signed certificate created at $CERT_DIR"
    
# ============================================================================
# PRODUCTION MODE - Use certbot for Let's Encrypt
# ============================================================================
elif [ "$NGINX_MODE" = "production" ]; then
    if [ -z "$HOSTNAME" ] || [ "$HOSTNAME" = "localhost" ]; then
        echo "[nginx] ERROR: HOSTNAME must be set for production mode"
        exit 1
    fi
    
    CERT_DIR="/etc/letsencrypt/live/$HOSTNAME"
    
    # Check if certificate already exists
    if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
        echo "[nginx] Certificate already exists for $HOSTNAME"
        # Try to renew quietly
        certbot renew --quiet --non-interactive || true
    else
        echo "[nginx] Requesting Let's Encrypt certificate for $HOSTNAME..."
        
        # Start nginx in background to serve certbot challenges
        nginx -g "daemon on;" || true
        sleep 2
        
        # Request certificate with certbot
        certbot certonly \
            --webroot \
            --webroot-path /var/www/certbot \
            -d "$HOSTNAME" \
            --email "admin@$HOSTNAME" \
            --agree-tos \
            --non-interactive \
            --expand || true
        
        # Stop background nginx
        nginx -s quit || true
        sleep 1
        
        # Verify certificate was created
        if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
            echo "[nginx] ERROR: Failed to obtain certificate for $HOSTNAME"
            exit 1
        fi
        
        echo "[nginx] Certificate obtained successfully for $HOSTNAME"
    fi
else
    echo "[nginx] ERROR: Invalid NGINX_MODE=$NGINX_MODE. Use 'development' or 'production'"
    exit 1
fi

# ============================================================================
# Configure nginx with cert paths
# ============================================================================
sed "s|HOSTNAME|$HOSTNAME|g; s|CERT_DIR|$CERT_DIR|g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "[nginx] nginx configured and starting..."

# Execute the passed command (usually nginx)
exec "$@"
