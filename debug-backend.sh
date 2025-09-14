#!/bin/bash

echo "=== Backend Debug Script ==="
echo "Date: $(date)"
echo ""

echo "1. Checking Docker versions:"
docker --version
docker compose version
echo ""

echo "2. Checking system info:"
uname -a
echo "Memory: $(free -h | grep Mem)"
echo "Disk: $(df -h | grep '/$')"
echo ""

echo "3. Stopping any existing containers:"
docker compose down
echo ""

echo "4. Building debug backend image:"
docker compose -f docker-compose.debug.yml build backend --no-cache
echo ""

echo "5. Running all services with debug output (not detached):"
echo "Press Ctrl+C to stop when you see the issue..."
docker compose -f docker-compose.debug.yml up

echo ""
echo "If the container is still stuck, try these additional commands:"
echo "  docker logs athena-backend-1 --tail 100"
echo "  docker inspect athena-backend-1 | grep -A 20 State"
echo "  docker events --filter container=athena-backend-1 --since 5m"
