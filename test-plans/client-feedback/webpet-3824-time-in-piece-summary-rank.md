# WEBPET-3824 · Input > Time In: Report "Piece Summary with Rank" runs (no 422) and ranks employees (sheet: smoke)
Spec: tests/web/client-feedback/time-in/webpet-3824-time-in-piece-summary-rank.spec.ts
Data: src/data/client-feedback/webpet-3824-time-in-piece-summary-rank.json (TimeInPieceRankCaseSchema)
  fixtureCrew "C", dayOffset -14, range {fromOffset:-15, toOffset:-14, start:"00:00", end:"23:59"}
  seed {employees:["one","two"], job:"piece", timeIn 07:00, timeOut 11:00,
        employeePieceOut:[{employee:"one",at:10:00,pieces:5},{employee:"two",at:10:30,pieces:1}]}
  report "Piece Summary with Rank"; expected {status:200, average:"Average", grandTotal:"Grand Total:", rejected:
  "This report cannot be narrowed by the selection criteria"}
Source: TimeInListPage.tsx:450-462 header action id 'report' -> testid page-header-action-report (PageHeaderActions.tsx:755);
  TimeInReportDialog partName "Time In"; layout TimeCardPieceSummaryWithRank.json: "Average" :817 (printed once, before the
  first below-average employee), "Grand Total:" :1042, CrewGroupText = crew alias + ": " + crew name :1136.
Steps:
0 prepareCfRun + seedCrewDay (TJC Add Piece-out per employee, via seedCrewDay).
1 timeInList.openFromMenu; applyRange(cfDay(-15), cfDay(-14), "00:00", "23:59").
2 timeInList.report.open() [NEW: reportButton + report on TimeInListPage]; selectReport("Piece Summary with Rank").
3 out = report.run('pdf', outputPath). expect(out.status, 'not 422').toBe(200); page shows no toast/text of expected.rejected.
4 text = readPdfText(out.savedPath): contains run.crew.name, "CF RANCH"/run.field.name, "CF PIECE JOB", both employee names,
  "Average", "Grand Total:". Ranked: index(CF C ONE) < index("Average") < index(CF C TWO) inside the CF PIECE JOB section.
Cleanup: run.cleanup (piece-outs + time cards by id, crew-day sweep).
Risks: the range covers the whole tenant on day -14, so read the order only inside the CF section (slice from the
  run.crew.name heading). The default "Only Piece Jobs Included" = Yes needs CF PIECE JOB to be paymentType Piece (it is).
