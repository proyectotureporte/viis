#!/usr/bin/env bash
# Respaldo diario de OpenV (cron 02:30). RPO 24 h. Retención 14 días.
# Los documentos ya están cifrados en disco; la clave NO se respalda aquí
# (vive en /root/.viis-copia-keys y fuera del servidor).
set -euo pipefail
DEST=/var/backups/viis-copia
mkdir -p "$DEST" && chmod 700 "$DEST"
STAMP=$(date +%F)
sudo -u postgres pg_dump --format=custom viis_copia_db > "$DEST/db-$STAMP.dump"
tar -C /var/lib/viis-copia -czf "$DEST/documentos-$STAMP.tar.gz" documentos
chmod 600 "$DEST"/*
find "$DEST" -type f -mtime +14 -delete
echo "$(date -Is) backup ok" >> "$DEST/backup.log"
