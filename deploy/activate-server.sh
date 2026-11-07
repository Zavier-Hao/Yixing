#!/usr/bin/env bash
# One-time administrator activation. Review this file before running as root.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Please run from the root console.'; exit 1; }
app=/var/www/yixing-live
release=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
case "$release" in "$app"/releases/*) ;; *) echo 'Unexpected release path'; exit 1 ;; esac
node=/home/yixing-deploy/.local/node-v24.11.1-linux-x64/bin/node
[ -x "$node" ] && [ -s "$release/server/index.mjs" ] && [ -s "$release/dist/index.html" ] && [ -s "$app/shared/backend.env" ]
backup=$(mktemp -d /var/backups/yixing-activation.XXXXXX)
cp -p /etc/nginx/conf.d/yixing.conf "$backup/yixing.conf"
old_current=$(readlink "$app/current" || true)
if [ -f /etc/systemd/system/yixing-backend.service ]; then cp -p /etc/systemd/system/yixing-backend.service "$backup/yixing-backend.service"; fi
if [ -f /etc/sudoers.d/yixing-service ]; then cp -p /etc/sudoers.d/yixing-service "$backup/yixing-service"; fi
rollback() {
    trap - ERR
    echo 'Activation failed; restoring previous website configuration.'
    cp -p "$backup/yixing.conf" /etc/nginx/conf.d/yixing.conf
    if [ -n "$old_current" ]; then ln -sfn "$old_current" "$app/current"; fi
    if [ -f "$backup/yixing-backend.service" ]; then
        cp -p "$backup/yixing-backend.service" /etc/systemd/system/yixing-backend.service
        systemctl daemon-reload
        systemctl restart yixing-backend || true
    else
        systemctl disable --now yixing-backend 2>/dev/null || true
    fi
    if [ -f "$backup/yixing-service" ]; then cp -p "$backup/yixing-service" /etc/sudoers.d/yixing-service; fi
    nginx -t && systemctl reload nginx
    echo "Backup: $backup"
    exit 1
}
trap rollback ERR
ln -sfn "$release" "$app/current"
cat > /etc/systemd/system/yixing-backend.service <<UNIT
[Unit]
Description=Yixing AI companion backend
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=yixing-deploy
Group=yixing-deploy
WorkingDirectory=$app/current
EnvironmentFile=$app/shared/backend.env
Environment=HOST=127.0.0.1
Environment=PORT=5050
Environment=TRUST_PROXY=1
ExecStart=$node $app/current/server/index.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/nginx/conf.d/yixing.conf <<'NGINX'
server {
    listen 5000;
    server_name 111.228.4.2;
    root /var/www/yixing-live/current/dist;
    index index.html;
    location /api/ {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 70s;
        client_max_body_size 32k;
    }
    location / {
        try_files $uri $uri/ =404;
    }
}
NGINX
nginx -t
systemctl daemon-reload
systemctl enable --now yixing-backend
systemctl restart yixing-backend
ready=0
for attempt in $(seq 1 15); do
    if curl --max-time 2 -fsS http://127.0.0.1:5050/api/health >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
done
[ "$ready" -eq 1 ]
printf '%s\n' 'yixing-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart yixing-backend, /usr/bin/systemctl status yixing-backend' > /etc/sudoers.d/yixing-service
chmod 440 /etc/sudoers.d/yixing-service
visudo -cf /etc/sudoers.d/yixing-service
systemctl reload nginx
# Reload returns before all new workers have accepted traffic; tolerate the old worker briefly.
proxy_ready=0
for attempt in $(seq 1 15); do
    if curl --max-time 5 -fsS -H 'Host: 111.228.4.2:5000' http://127.0.0.1:5000/api/health 2>/dev/null | python3 -c 'import json,sys; raw=sys.stdin.read(); d=json.loads(raw) if raw else {}; sys.exit(0 if d.get("ok") and d.get("configured") else 1)'; then
        proxy_ready=1
        break
    fi
    sleep 1
done
[ "$proxy_ready" -eq 1 ]
echo 'Backend and Nginx API proxy are ready.'
trap - ERR
echo 'Yixing activated: http://111.228.4.2:5000/#demo'
echo "Previous configuration backup: $backup"
