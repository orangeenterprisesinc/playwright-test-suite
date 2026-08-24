# Containerized E2E stack — runbook

**Status:** replaces the old localhost rig (host SQL Server Express over Windows
Integrated Auth + a 12.9 GB `DelLlano.bak` restore). Dev staging is unaffected —
`npm run test:dev` against `app.ptdev.xyz` is still the primary target and this
stack does not touch it.

The database is **pulled, not restored**:
`ghcr.io/orangeenterprisesinc/pet-tiger-testdb` ships `TigerMaster` + `PetData`
already inside the image layer (PET-12460, Raghu). That is what makes a local run
reproducible on a machine that is not this one.

---

## 1. One-time setup

```bash
gh auth refresh -h github.com -s read:packages    # the default token lacks it
gh auth token | docker login ghcr.io -u <your-github-user> --password-stdin
cp docker/e2e/.env.example docker/e2e/.env        # then set WEBPET_DIR
docker pull ghcr.io/orangeenterprisesinc/pet-tiger-testdb:677f4a10773f-1
```

You need **both** a `read:packages` token and read access to the *package*. Being a
`web-pet` collaborator is not sufficient on its own: a GHCR package inherits
repository access only once it has been **linked** to that repository. An unlinked
package is readable by whoever pushed it and nobody else, and it fails with
`403 Forbidden` or `manifest unknown` — which misleadingly reads like a typo in the
image name.

The authoritative tag lives in `web-pet` at `db/test-stack/manifest.json` under
`testImage`. **Pin it.** On `:latest` the dataset can change underneath the suite
with nothing changing in this repo, and that failure is very hard to diagnose.

**Git Bash:** prefix any command passing a container path with `MSYS_NO_PATHCONV=1`,
or `/opt/mssql-tools18/...` is rewritten to `C:/Program Files/Git/opt/...` and you
get a confusing "No such file or directory".

Prerequisites: Docker Desktop running, a `web-pet` checkout for `WEBPET_DIR`, a Go
toolchain on `PATH` (for the migrate step), and port 14333 / 8090 / 9000 free.

---

## 2. Bring-up — the order is load-bearing

```bash
npm run e2e:stack:db                 # 1. pull + start the DB image
                                     # 2. migrate + REPAIR — see below
npm run e2e:stack:repoint            # 3. ClientMaster -> sqlserver
npm run e2e:stack:app                # 4. minio, gotenberg, api, web
npm run e2e:stack:webpet             # 5. or e2e:stack:test for the journey suites
```

### Step 2 — migrations, from the host, *before* the repoint

**Do not skip this, and do not skip the `repair`.** The image holds the *legacy*
schema only — the ~155 tables the WinForms app uses. The 79 migrations the web app
needs are deliberately not baked in, so a merged migration cannot make the image
stale. Run them from `$WEBPET_DIR/apps/api`:

```bash
MSSQL_SERVER=localhost MSSQL_PORT=14333 MSSQL_DB=PetData \
MSSQL_USER=pt_test MSSQL_PASSWORD='PetTigerTest1!' \
MSSQL_ENCRYPT=false MSSQL_TRUST_SERVER_CERTIFICATE=true \
go run ./cmd/migrate status --target all     # inspect first
go run ./cmd/migrate up --target all
go run ./cmd/migrate repair                  # NOT optional — see below
```

**Why `repair` is not optional.** The restored backup carries its own migration
ledger, and that ledger lies: it records TigerMaster `00001` and `00002` as applied
while neither unique index they create actually exists — someone dropped them on the
source server. `up` permanently skips whatever the ledger calls applied, so without
`repair` you are silently missing two uniqueness constraints. That fails *backwards*:
a test expecting a duplicate to be rejected watches it succeed, and you go hunting an
application bug that is not there. `repair` re-runs the SQL of every applied
migration without touching the ledger.

**What skipping the migrations looks like.** Not one clean error. The employee list
loads fine — it came from the backup — while login fails, configurable-column list
pages break, dashboards render empty and background jobs fail. The partial success is
the trap: it reads like a data problem.

**Why before the repoint.** `migrate --target all` does `TigerMaster`, then loops
`ClientMaster` and connects to each client with `ConnectWithOverride(cfg,
c.ServerName, …)`. While `ServerName` is still `localhost` that resolves to the
published port from the host and works. After the repoint it is `sqlserver`, which
only resolves inside the compose network — host-side migrate would then fail.

---

## 3. Credentials — all baked into the image, none chosen here

| Who | User | Password | For |
|---|---|---|---|
| SQL bootstrap | `sa` | `Pet-Tiger-Test-1x` | readiness poll, the repoint. Nothing else. |
| App DB login | `pt_test` | `PetTigerTest1!` | what the API and `cmd/migrate` connect as |
| App account | `su` | `PetTigerE2E1!` | what the suites log in as |

These are committed literals in `compose.yml` **on purpose**. The image's repair
scripts create the login and write the app password *into the databases* before the
image is baked, so a per-machine secret could never match a pulled image. The
container is disposable, bound to localhost, and holds only test data.

`ClientMaster` in the image: ClientID 1, ClientName `DelLlano`, DatabaseName
`PetData`. The name/DB mismatch is deliberate, not a bug.

---

## 4. Verify

| After | Command | Expected |
|---|---|---|
| 1 | `docker compose -f docker/e2e/compose.yml ps` | `sqlserver` healthy |
| 1 | `docker exec pet-tiger-e2e-sqlserver-1 ls /var/opt/mssql/data` | `TigerMaster.mdf`, `PetData.mdf` |
| 2 | `go run ./cmd/migrate version --target all` | a version per database |
| 2 | `sqlcmd -d PetData -Q "SELECT OBJECT_ID('dbo.ListFieldMetadata')"` | non-NULL — that table exists only if the client migrations ran |
| 2 | `sqlcmd … -d PetData -Q "SELECT CASE WHEN OBJECT_ID('dbo.ListFieldMetadata') IS NULL THEN 'MIGRATIONS MISSING' ELSE 'migrations applied' END"` | `migrations applied` — `ListFieldMetadata` exists only if the client migrations ran |
| 3 | repoint output | `1 \| DelLlano \| sqlserver \| PetData \| 1 \| <future date>` |
| 4 | `curl -i http://localhost:8090/api/health` | 200 |
| 4 | login probe (below) | 200 + session cookie |
| 5 | `npm run e2e:stack:webpet -- --grep=@wp-smoke` | completes, writes to `artifacts/` |

```bash
curl -i -X POST http://localhost:8090/api/auth/login \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:8090' \
  -d '{"username":"su","password":"PetTigerE2E1!"}'
```

Read the login failure by status: **403** = licence expired (re-run the repoint);
**401** = the `su` row or its password is not in the image; **500** = client-pool,
i.e. `ClientMaster.ServerName` is still `localhost`.

---

## 5. Known limits — read before filing a red as a bug

**The data is thin.** The image's `PetData` is an earlier vintage than the specs
were authored against: **5 employees, 2 departments, 4 crews, 45 time cards, 4
users**, plus baked-in test residue (`_TestScanEmp`, `__TEST_DUPEXP___…`). Specs
expecting `ADP 5`, `Crew 01` or `Locker, Mather` will fail on data, not on code.
PET-12555 measured web-pet's own `employee.spec.ts` at 8 passed / 6 failed for
exactly this reason. **The first full run here is a measurement, not a green run.**
The fix is fixtures; do not weaken assertions or re-point locators to make it pass.

**Licensing is inverted.** All 53 catalog modules are licensed in this dataset, so
a spec asserting a feature is *absent* fails — `export-to-accounting.spec.ts` is the
known example.

**No non-SU account.** `PetData.dbo.Users` holds only `aa`, `Su`, `ab`, `ac`, so
`WEBPET_NONSU_*` is deliberately unset and those specs skip.

**Licence terms.** SQL Server Developer edition is licensed for development and
test **only**; `ACCEPT_EULA=Y` is a legal acceptance. Never point this stack at
production or customer-facing workloads.

---

## 6. Troubleshooting

**`sqlserver` is healthy but the databases are missing.** A stale named volume
masked the image layer. The compose file deliberately mounts no volume on
`/var/opt/mssql`, so this only bites a leftover from the old restore-based stack:

```bash
npm run e2e:stack:down
docker volume rm pet-tiger-e2e_mssql_data
```

**`Login failed for user 'sa'`.** `PT_TESTDB_SA_PASSWORD` does not match the value
baked into the image's `master`. The env var only takes effect on first init of an
empty data dir, so it cannot re-set the password here.

**The repoint container cannot find `sqlcmd`.** It runs
`mcr.microsoft.com/mssql/server:2025-latest` purely because that is the one image
known to ship `/opt/mssql-tools18/bin/sqlcmd` — there is no sqlcmd-only image on
MCR (`mssql-tools`, `mssql-tools18`, `mssql/tools` all 404). Fallback is
`ghcr.io/microsoft/go-sqlcmd`.

**Disk.** The DB image, the Playwright image and the build caches all land on
Docker's disk image, which lives on C: by default. Relocate it to D: via Docker
Desktop → Settings → Resources → Advanced if C: gets tight.

---

## 7. Upstream reference

Raghu's own guide — `db/test-stack/USING_THE_IMAGE.md` in `web-pet`, reference copy at
`test-plans/raghu's doc/using_test_db_docker_image.pdf` — is authoritative for the
image itself. `db/test-stack/README.md` there lists exactly what data it holds.

## 8. When Raghu's tooling lands

`compose.test.yml`, `scripts/testdb.mjs` and `db/test-stack/**` (PET-12460) are not
pushed to `web-pet` yet, which is why this stack consumes the raw image and does the
repoint and migrate itself. Once they land, switch to calling `pnpm testdb:setup`
rather than re-implementing it here.
