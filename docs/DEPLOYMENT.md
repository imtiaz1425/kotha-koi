# KothaKoi — Deployment & Operations Specification

> [!NOTE]
> **Current Project Status: Production Deployment Postponed**  
> Public production deployment of KothaKoi is currently postponed. High-quality WebRTC audio/video relay across asymmetric cellular mobile networks (e.g. Grameenphone, Robi, Banglalink, Teletalk) requires continuous TURN bandwidth. Free-tier quotas (typically 50 GB/month) are insufficient for sustained campus-wide video usage. The application is maintained in a fully functioning state for local development, staging, and future production rollout when a dedicated TURN budget or server infrastructure is provisioned.

---

## 1. Production Architecture Overview

When deployed to production, KothaKoi should be hosted behind a high-performance reverse proxy (e.g., Nginx, Caddy, or Cloudflare) terminating TLS/HTTPS.

```
                  +----------------------------------+
                  |         Cloudflare / TLS         |
                  +-----------------+----------------+
                                    |
                    +---------------+---------------+
                    | HTTPS                         | WSS (WebSocket)
                    v                               v
+-------------------------------------------------------------------+
|                        Nginx Reverse Proxy                        |
|  - Serves static compiled frontend (dist/)                        |
|  - Proxies /api/* to Node backend:5000                            |
|  - Proxies /socket.io/* with Upgrade: websocket                   |
|  - Enforces rate limits & request buffering                       |
+-------------------+-------------------------------+---------------+
                    |                               |
                    v                               v
+-----------------------------------+   +---------------------------+
| Express Application (PM2 / Docker)|   | Self-Hosted Coturn Server |
| - Node.js cluster                 |   | (or Enterprise Metered)   |
| - Connects to managed PostgreSQL  |   +---------------------------+
+-------------------+---------------+
                    |
                    v
+-----------------------------------+
|   Managed PostgreSQL Database     |
+-----------------------------------+
```

---

## 2. Reverse Proxy Configuration (Nginx Example)

```nginx
server {
    listen 443 ssl http2;
    server_name kothakoi.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/kothakoi.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kothakoi.yourdomain.com/privkey.pem;

    # Static Frontend
    root /var/www/kothakoi/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend REST API
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Real-Time WebSockets
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

---

## 3. WebRTC & TURN Relay Budget Requirements

### Why TURN is Required in Production
In peer-to-peer WebRTC, direct connections (STUN) fail when either user is behind a Symmetric NAT / Carrier-Grade NAT (CGNAT), which is typical for:
- 4G / 5G mobile operators.
- Restrictive campus and dormitory Wi-Fi networks.

Under these conditions, media streams must be relayed through a TURN server.

### Bandwidth Estimations
- **Video + Audio Bitrate:** Average ~1.0 Mbps to 1.5 Mbps per active session (both directions).
- **Hourly Consumption:** ~450 MB – 675 MB per active hour of video conversation.
- **100 Concurrent Pairs (200 students):** ~90 GB to 135 GB per day.

### Deployment Options
1. **Commercial TURN Providers:**
   - **Metered.ca:** Commercial plan ($29–$99+/month depending on monthly GB allocation).
   - **Cloudflare Calls / Twilio Network Traversal:** Pay-as-you-go per gigabyte.
2. **Self-Hosted coturn:**
   - Deploy `coturn` on a dedicated Linux VPS with an unmetered high-bandwidth network interface (e.g., Hetzner, DigitalOcean, or Linode).
   - Configure TLS certificates (`turns:`) on port 443 to bypass restrictive firewalls.

