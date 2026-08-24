#!/usr/bin/env bash
# Point ClientMaster at the compose network. The image ships the client record
# pointing at the container as reached from the HOST (localhost:14333), but our
# api container reaches SQL Server by service name — and the API resolves the
# client DB host from this column at login, so 'localhost' would make api dial
# itself. Idempotent; safe to re-run against a live stack.
set -euo pipefail

SQLCMD=(/opt/mssql-tools18/bin/sqlcmd -S sqlserver -U pt_test -P "${PT_PASSWORD}" -C -b)

echo "[repoint] waiting for sqlserver..."
until "${SQLCMD[@]}" -Q "SELECT 1" >/dev/null 2>&1; do sleep 3; done

echo "[repoint] ClientMaster.ServerName -> sqlserver"
"${SQLCMD[@]}" -Q "UPDATE TigerMaster.dbo.ClientMaster SET ServerName='sqlserver'"

# Normally a no-op: the published image sets the expiry ten years out on purpose.
# Kept as a guard because login rejects an expired client outright with a 403,
# which is an opaque failure to debug from the test side.
"${SQLCMD[@]}" -Q "UPDATE TigerMaster.dbo.ClientMaster
  SET ExpirationDate = DATEADD(year, 5, GETUTCDATE())
  WHERE ExpirationDate < GETUTCDATE()"

echo "[repoint] verifying..."
"${SQLCMD[@]}" -W -Q "SELECT ClientID, ClientName, ServerName, DatabaseName, Active, ExpirationDate
  FROM TigerMaster.dbo.ClientMaster"
echo "[repoint] done."
