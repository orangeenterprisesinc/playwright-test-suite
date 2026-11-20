# WEBPET-3826 · Input > Time In: "Consecutive Missing Work Days" parameters, PDF, and Alias Set captions (sheet: smoke)
Spec: tests/web/client-feedback/time-in/webpet-3826-time-in-missing-work-days.spec.ts
Data: src/data/client-feedback/webpet-3826-time-in-missing-work-days.json (TimeInMissingDaysCaseSchema)
  fixtureCrew "D", dayOffset -16, seed {employees:["one","two"], job:"hourly", timeIn 07:00, timeOut 11:00}; lastWorkOffset -14
  aliasSet {type:"Windows", captions:{ "Menu: Crew":"CF GANG", "Menu: Employee":"CF WORKER", "Export Identifier":"CF BADGE" }}
  params {lastWorkDate:{id:"LastWorkDate"}, allowed:{id:"AllowedMissingDays", value:"2"}, aliasLabel:"Alias Set", none:"(none)"}
  expected {title:"Consecutive Missing Work Days", allowedLine:"Allowed Number of Missing Work Days: 2",
            attendance regex "-Absent-|-No Work-|-{8,}", defaultHeadings:["Crew","Employee","Export ID"]}
Source: catalog :4246 (Last Work Date TextBox:Date -> <input type=date>, Allowed Missing Days default 2); ALIAS_SET_PARAM_ID
  "_AliasSet", label "Alias Set", "(none)" (ReportDialog.tsx:297, common.json:1208); layout :456 allowed line, :492-494 aliases.
Steps:
0 aliasName = mintAliasSetName(deps, ticket); prepareCfRun + seedCrewDay.
1 aliasSet.createWindowsSet(aliasName, captions) [NEW page object, Setup > Alias Set, /setup/alias-sets].
2 timeInList.openFromMenu (no range applied = date range blank); timeInList.report.open(); selectReport(title).
3 report.paramInput("LastWorkDate").fill(cfDay(-14)); paramInput("AllowedMissingDays").fill("2");
  expect(report.paramSelect("Alias Set")).toHaveText("(none)").
4 out1 = run('pdf'); status 200; text1 contains title, allowedLine, a M/d date column, matches the attendance regex;
  text1 contains none of the caption values.
5 report.open() (keeps report and answers, PET-12950); setParam("Alias Set", aliasName); out2 = run('pdf'); status 200;
  text2 contains "CF GANG", "CF WORKER", "CF BADGE".
Cleanup: run.cleanup; alias set by name (mintAliasSetName teardown).
Risks / open questions: the Alias Fields grid display names for Crew / Employee / Export Identifier (Windows type) are not
  measured yet - the orchestrator should probe /setup/alias-sets/new once and fill the JSON keys. The report lists the
  whole tenant (14-day window), so do not assert CF rows.
