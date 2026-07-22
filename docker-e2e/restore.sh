#!/usr/bin/env bash
# One-shot: restore TigerMaster + DelLlano into the `sqlserver` container, then
# repoint ClientMaster at the container. Idempotent-ish (RESTORE ... REPLACE),
# but skips if both DBs already exist so re-running the stack is fast (the 12GB
# DelLlano restore is the slow part — we don't want it every `up`).
set -euo pipefail

SQLCMD=(/opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -P "${SA_PASSWORD}" -C -b)

echo "[restore] waiting for sqlserver..."
until "${SQLCMD[@]}" -Q "SELECT 1" >/dev/null 2>&1; do sleep 3; done
echo "[restore] sqlserver reachable"

already=$("${SQLCMD[@]}" -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.databases WHERE name IN ('TigerMaster','DelLlano')" | tr -d '[:space:]')
if [ "${already}" = "2" ]; then
  echo "[restore] TigerMaster + DelLlano already present — skipping restore"
else
  echo "[restore] restoring TigerMaster (small)..."
  "${SQLCMD[@]}" -Q "RESTORE DATABASE TigerMaster FROM DISK='/backup/TigerMaster-test-data/TigerMaster.bak' \
    WITH MOVE 'TigerMaster' TO '/var/opt/mssql/data/TigerMaster.mdf', \
         MOVE 'TigerMaster_log' TO '/var/opt/mssql/data/TigerMaster_log.ldf', REPLACE"

  echo "[restore] restoring DelLlano (~12GB, takes a few minutes)..."
  "${SQLCMD[@]}" -Q "RESTORE DATABASE DelLlano FROM DISK='/backup/DelLlano/DelLlano.bak' \
    WITH MOVE 'PetData_Data' TO '/var/opt/mssql/data/DelLlano_Data.mdf', \
         MOVE 'PetData_Log'  TO '/var/opt/mssql/data/DelLlano_Log.ldf', REPLACE"
fi

echo "[restore] repointing ClientMaster.ServerName to the containerized instance..."
"${SQLCMD[@]}" -Q "UPDATE TigerMaster.dbo.ClientMaster SET ServerName='sqlserver'"

echo "[restore] verifying..."
"${SQLCMD[@]}" -W -Q "SELECT ClientID, ClientName, ServerName, DatabaseName, Active FROM TigerMaster.dbo.ClientMaster"
echo "[restore] done."
