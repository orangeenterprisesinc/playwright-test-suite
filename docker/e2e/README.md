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
```

Find the tag to pin in `.env` — nothing in Jira records a concrete one:

```bash
gh api "/orgs/orangeenterprisesinc/packages/container/pet-tiger-testdb/versions" \
  --jq '.[] | "\(.updated_at)  \(.metadata.container.tags | join(","))"'
```

Prerequisites: Docker Desktop running, a `web-pet` checkout for `WEBPET_DIR`, a Go
toolchain on `PATH` (for the migrate step), and port 14333 / 8090 / 9000 free.

---

## 2. Bring-up — the order is load-bearing

```bash
npm run e2e:stack:db                 # 1. pull + start the DB image
                                     # 2. migrate — see below
npm run e2e:stack:repoint            # 3. ClientMaster -> sqlserver, extend licence
npm run e2e:stack:app                # 4. minio, gotenberg, api, web
npm run e2e:stack:webpet             # 5. or e2e:stack:test for the journey suites
```

### Step 2 — migrations, from the host, *before* the repoint

The image is built from a `.bak`; migrations are **not** baked in. Run them from
`$WEBPET_DIR/apps/api`:

```bash
MSSQL_SERVER=localhost MSSQL_PORT=14333 MSSQL_DB=PetData \
MSSQL_USER=pt_test MSSQL_PASSWORD='PetTigerTest1!' \
MSSQL_ENCRYPT=false MSSQL_TRUST_SERVER_CERTIFICATE=true \
go run ./cmd/migrate status --target all     # inspect first
go run ./cmd/migrate up --target all
```

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

## 7. When Raghu's tooling lands

`compose.test.yml`, `scripts/testdb.mjs` and `db/test-stack/**` (PET-12460) are not
pushed to `web-pet` yet, which is why this stack consumes the raw image and does the
repoint and migrate itself. Once they land, switch to calling `pnpm testdb:setup`
rather than re-implementing it here.
