#!/usr/bin/env bash
# Fixups the pulled DB image cannot carry, because it is baked standalone.
# Idempotent — safe to re-run against a live stack.
set -euo pipefail

SQLCMD=(/opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -P "${SA_PASSWORD}" -C -b)

echo "[repoint] waiting for sqlserver..."
until "${SQLCMD[@]}" -Q "SELECT 1" >/dev/null 2>&1; do sleep 3; done

# The image ships ServerName='localhost'. The API resolves the client DB host
# from this column at login (auth/login.go), so inside the compose network
# 'localhost' would make the api container try to connect to itself.
echo "[repoint] ClientMaster.ServerName -> sqlserver"
"${SQLCMD[@]}" -Q "UPDATE TigerMaster.dbo.ClientMaster SET ServerName='sqlserver'"

# Login rejects an expired client outright with 403 "Your licence has expired",
# and the image inherits whatever ExpirationDate the source .bak carried.
echo "[repoint] extending licence if lapsed"
"${SQLCMD[@]}" -Q "UPDATE TigerMaster.dbo.ClientMaster
  SET ExpirationDate = DATEADD(year, 5, GETUTCDATE())
  WHERE ExpirationDate < GETUTCDATE()"

echo "[repoint] verifying..."
"${SQLCMD[@]}" -W -Q "SELECT ClientID, ClientName, ServerName, DatabaseName, Active, ExpirationDate
  FROM TigerMaster.dbo.ClientMaster"
echo "[repoint] done."
