FROM nginx:alpine

# Install certbot and dependencies for Let's Encrypt integration
RUN apk add --no-cache \
    certbot \
    certbot-nginx \
    bash \
    curl \
    openssl

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy nginx config template
COPY nginx.conf /etc/nginx/nginx.conf.template

# Create directories for certs
RUN mkdir -p /etc/letsencrypt/live \
    && mkdir -p /var/www/certbot

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
