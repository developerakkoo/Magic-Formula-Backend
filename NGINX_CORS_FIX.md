# Nginx CORS Configuration Fix

## Problem
The current nginx configuration has CORS headers that conflict with the backend CORS handling, causing preflight OPTIONS requests to fail.

## Required Changes

Update your nginx configuration file (usually located at `/etc/nginx/sites-available/api.moneycrafttrader.com` or similar) with the following changes:

### Current Configuration (PROBLEMATIC):
```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # CORS Fix
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type' always;
}

# Preflight requests
if ($request_method = OPTIONS) {
    return 204;
}
```

### Fixed Configuration:
```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Remove CORS headers - let backend handle CORS
    # Remove the add_header directives for CORS
    
    # Remove the OPTIONS return 204 - let backend handle preflight
}
```

### Key Changes:
1. **Remove** all `add_header 'Access-Control-Allow-*'` directives - the backend will handle CORS
2. **Remove** the `if ($request_method = OPTIONS) { return 204; }` block - this bypasses the backend CORS logic
3. **Keep** all proxy headers (Host, X-Real-IP, etc.) - these are essential for proper proxying

### Complete Fixed Configuration:
```nginx
server {
    listen 443 ssl;
    server_name api.moneycrafttrader.com;

    ssl_certificate /etc/letsencrypt/live/api.moneycrafttrader.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.moneycrafttrader.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.moneycrafttrader.com;
    return 301 https://$host$request_uri;
}
```

## Why This Works

1. **Backend handles CORS**: The Express.js backend with `cors` middleware properly handles:
   - Web browsers (with Origin headers) - allows localhost:8101, localhost:8100, and production domains
   - Mobile apps (no Origin header) - automatically allowed via `if (!origin) return callback(null, true)`
   - OPTIONS preflight requests - properly handled by the cors middleware

2. **Nginx just proxies**: Nginx should only handle SSL termination and proxying, not CORS logic

3. **No conflicts**: Removing duplicate CORS headers prevents conflicts between nginx and backend

## After Making Changes

1. Test nginx configuration:
   ```bash
   sudo nginx -t
   ```

2. Reload nginx:
   ```bash
   sudo systemctl reload nginx
   ```

3. Restart Docker container (to pick up backend changes):
   ```bash
   cd /root/Magic-Formula-Backend
   docker compose restart
   ```

4. Test from:
   - Web browser (localhost:8101) - should work
   - Mobile app (Play Store) - should work (no origin header)

