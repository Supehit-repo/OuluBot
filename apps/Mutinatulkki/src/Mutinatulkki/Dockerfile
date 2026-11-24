FROM node:20-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5500

WORKDIR /app

COPY server.js app.js avatar.js avatar-kiosk.js index.html avatar-kiosk.html styles.css avatar-kiosk.css ./
COPY assets ./assets
COPY docs ./docs
COPY config ./config

EXPOSE 5500

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5500/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
