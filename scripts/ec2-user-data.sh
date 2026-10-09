#!/bin/bash
# ─────────────────────────────────────────────────────────────
# User data para la instancia EC2 (Ubuntu Server 24.04).
# Pégalo en "Advanced details → User data" al lanzar la instancia
# y Docker queda instalado solo en el primer arranque.
# ─────────────────────────────────────────────────────────────
set -eux
apt-get update -y
apt-get install -y docker.io curl
systemctl enable --now docker
# Permite usar docker sin sudo al usuario por defecto
usermod -aG docker ubuntu
docker --version > /var/log/docker-ready.log
