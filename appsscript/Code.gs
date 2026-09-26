/**
 * Fleet Response Dashboard — Google Apps Script WEB APP
 * Serves a small Index.html and returns the code/styles/data at runtime.
 *
 * Files in this Apps Script project:
 *   Code.gs      (this file)
 *   Index.html   (small shell + bootstrap; no backticks)
 *   AppJs.html   (paste the ENTIRE contents of demo/app.js here — raw JS)
 *   Styles.html  (paste the ENTIRE contents of demo/styles.css here — raw CSS)
 */

const SPREADSHEET_ID = "1B3FggMT8nM0XJoUP7DcM-ehpsGOc0_VSZtQrtxHQ78k";
const SHEET_NAME = "FR - Historical Data (Responses) 2.0";

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Fleet Response Dashboard")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// The dashboard code and styles are returned as plain strings and injected on
// the client via element.textContent — this keeps their backticks/emoji out of
// Apps Script's document.write (which caused "Invalid or unexpected token").
function getAppJs() {
  return HtmlService.createHtmlOutputFromFile("AppJs").getContent();
}
function getCss() {
  return HtmlService.createHtmlOutputFromFile("Styles").getContent();
}

// Live data, read fresh on every page load.
function getDashboardData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      const names = ss.getSheets().map(function (s) { return s.getName(); });
      throw new Error("Tab '" + SHEET_NAME + "' not found. Available: " + names.join(" | "));
    }
    // getDisplayValues() returns strings exactly as shown (e.g. 5/1/2026, 34.53).
    // Do NOT use getValues() — it returns Date/number objects and breaks parsing.
    return sheet.getDataRange().getDisplayValues();
  } catch (error) {
    return { error: error.toString() };
  }
}
