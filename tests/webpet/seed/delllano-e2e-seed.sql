/*
  DelLlano e2e seed — WEBPET-831
  ---------------------------------------------------------------------------
  Idempotent fixtures + client config required by the apps/web/e2e Playwright
  specs when they run against the DelLlano database.

  This is NOT a schema migration. Do NOT add it to apps/api/migrations or run it
  through cmd/migrate — that runner applies per-client migrations to EVERY active
  client DB in ClientMaster, and these are test fixtures / per-client licensing
  that must not leak into real client databases.

  Run manually (see README.md), e.g.:
    sqlcmd -S localhost -d master -i apps/web/e2e/seed/delllano-e2e-seed.sql

  Safe to run repeatedly — every statement is guarded.

  NOTE: employee/department fixtures are sourced from PetData (the canonical e2e
  reference dataset) so they match the values the specs assert. PetData must be
  present on the same SQL Server instance. A future hardening could inline the
  column values instead of copying, removing the PetData dependency.
*/

/* ===========================================================================
   employee.spec.ts + department.spec.ts
   Department "ADP 5" (code "10012") + Employee 5 "Locker, Mather"
   (dept "ADP 5", crew "Crew 01"). Specs resolve "ADP 5" by NAME (DelLlano
   identity ids differ from the legacy PetData ids the specs were authored
   against), so we do not pin DepartmentCounter; we only guarantee the row
   exists with the asserted Code.
   =========================================================================== */
USE DelLlano;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Department WHERE Name = 'ADP 5' AND Deleted = 0)
    INSERT INTO dbo.Department (Name, Code) VALUES ('ADP 5', '10012');
GO

-- department.spec.ts "loads existing department data" asserts code "10012".
-- Backfill it on a pre-existing row seeded before Code was tracked (idempotent).
UPDATE dbo.Department
SET    Code = '10012'
WHERE  Name = 'ADP 5' AND Deleted = 0 AND (Code IS NULL OR Code = '');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Employee WHERE EmployeeCounter = 5)
BEGIN
    DECLARE @deptId INT = (SELECT TOP 1 DepartmentCounter FROM dbo.Department WHERE Name = 'ADP 5'  AND Deleted = 0);
    DECLARE @crewId INT = (SELECT TOP 1 CrewCounter       FROM dbo.Crew       WHERE Name = 'Crew 01' AND Deleted = 0);

    -- Copy the canonical row from PetData. The Employee schema is identical
    -- between PetData and DelLlano, so we build matching column lists. FK
    -- columns are nulled (their PetData ids don't exist in DelLlano), except
    -- Department/Crew which are remapped to valid DelLlano ids. The rowversion
    -- (timestamp) column is excluded — it cannot be inserted.
    DECLARE @insertCols NVARCHAR(MAX), @selectCols NVARCHAR(MAX);
    SELECT
        @insertCols = STRING_AGG(QUOTENAME(COLUMN_NAME), ',') WITHIN GROUP (ORDER BY ORDINAL_POSITION),
        @selectCols = STRING_AGG(
            CASE COLUMN_NAME
                WHEN 'DepartmentCounter'    THEN CAST(@deptId AS VARCHAR(20))
                WHEN 'CrewCounter'          THEN CAST(@crewId AS VARCHAR(20))
                WHEN 'AuthorCounter'        THEN 'NULL'
                WHEN 'DefaultFieldCounter'  THEN 'NULL'
                WHEN 'DefaultJobCounter'    THEN 'NULL'
                WHEN 'DefaultRanchCounter'  THEN 'NULL'
                WHEN 'EthnicityCounter'     THEN 'NULL'
                WHEN 'FederalTaxCounter'    THEN 'NULL'
                WHEN 'JobCategoryCounter'   THEN 'NULL'
                WHEN 'MailingStateCounter'  THEN 'NULL'
                WHEN 'ScheduleCounter'      THEN 'NULL'
                WHEN 'StateCounter'         THEN 'NULL'
                WHEN 'StateTaxCounter'      THEN 'NULL'
                WHEN 'StateWithheldCounter' THEN 'NULL'
                ELSE QUOTENAME(COLUMN_NAME)
            END, ',') WITHIN GROUP (ORDER BY ORDINAL_POSITION)
    FROM DelLlano.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Employee' AND DATA_TYPE <> 'timestamp';

    DECLARE @sql NVARCHAR(MAX) = N'
        SET IDENTITY_INSERT dbo.Employee ON;
        INSERT INTO dbo.Employee (' + @insertCols + N')
        SELECT ' + @selectCols + N' FROM PetData.dbo.Employee WHERE EmployeeCounter = 5;
        SET IDENTITY_INSERT dbo.Employee OFF;';
    EXEC sp_executesql @sql;
END
GO

/* ===========================================================================
   customer.spec.ts
   Customer "DFV" (type Grower). DelLlano ships zero customers; the spec resolves
   it by NAME (CustomerCounter is not pinned). Only Name is NOT NULL; type is
   set to Grower (CustomerTypeCounter 2) to match the spec's fixture intent.
   =========================================================================== */
IF NOT EXISTS (SELECT 1 FROM DelLlano.dbo.Customer WHERE Name = 'DFV' AND Deleted = 0)
    INSERT INTO DelLlano.dbo.Customer (Name, CustomerTypeCounter, IsCustomer, Active)
    VALUES ('DFV', 2, 1, 1);
GO

/* ===========================================================================
   equipment.spec.ts
   Equipment "Forklift" (code 10005, type Trailer). DelLlano ships zero
   equipment; the spec resolves it by NAME. Type uses an existing
   EquipmentType (Trailer); the spec's dropdown test asserts that existing type.
   =========================================================================== */
IF NOT EXISTS (SELECT 1 FROM DelLlano.dbo.Equipment WHERE Name = 'Forklift' AND Deleted = 0)
    INSERT INTO DelLlano.dbo.Equipment (Name, Code, EquipmentTypeCounter, Active, AllowSimultaneousEquipmentUse)
    SELECT 'Forklift', '10005',
           (SELECT TOP 1 EquipmentTypeCounter FROM DelLlano.dbo.EquipmentType WHERE Name = 'Trailer' AND Deleted = 0),
           1, 0;
GO

/* ===========================================================================
   Module gates (TigerMaster client licensing)
   Setup endpoints are wrapped in RequireModule(...). DelLlano (ClientId 1) must
   be licensed for the modules the specs exercise or the API returns 403.
   Nulls for Active/Expiry = always active. Modules load at login; the active
   set is the vw_ActiveClientModules view. Module name → key → ModuleId is
   reconciled in apps/api/internal/auth/modules.go (dbNameToKey) against
   TigerMaster.dbo.Modules.

   ModuleId  DB Name           App key            Specs that need it
   --------  ----------------  -----------------  --------------------------------
   9         Department        Department         department.spec.ts, employee.spec.ts
   4         Bonus Payment     BonusPayment       bonus-shell.spec.ts
   13        Equipment         Equipment          equipment.spec.ts
   17        Grower Billing    GrowerBilling      billing-center.spec.ts, term.spec.ts
   21        Inventory         Inventory          inventory-*.spec.ts
   44        Time Sheet Entry  TimeSheetEntry     timesheet_validation.spec.ts

   NOTE: do NOT license "Cost Accounting" (ModuleId 8) — export-to-accounting.spec.ts
   asserts the Cost Accounting tab is disabled when that module is NOT licensed.
   Add further (ClientId, ModuleId) rows here as other specs are migrated.
   =========================================================================== */
DECLARE @e2eModules TABLE (ModuleId INT PRIMARY KEY);
INSERT INTO @e2eModules (ModuleId) VALUES (9), (4), (13), (17), (21), (44);

INSERT INTO TigerMaster.dbo.ClientModules (ClientId, ModuleId, ActiveDate, ExpiryDate)
SELECT 1, m.ModuleId, NULL, NULL
FROM @e2eModules m
WHERE NOT EXISTS (
    SELECT 1 FROM TigerMaster.dbo.ClientModules cm
    WHERE cm.ClientId = 1 AND cm.ModuleId = m.ModuleId
);
GO
