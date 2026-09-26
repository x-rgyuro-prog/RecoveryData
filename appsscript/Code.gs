/**
 * Fleet Response Dashboard — Google Apps Script WEB APP
 * Serves the self-contained Index.html and returns the live sheet data.
 */

const SPREADSHEET_ID = "1B3FggMT8nM0XJoUP7DcM-ehpsGOc0_VSZtQrtxHQ78k";
const SHEET_NAME = "FR - Historical Data (Responses) 2.0";

// Serve Index.html as the web app.
function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Fleet Response Dashboard")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Called by the frontend on every load -> reads the LIVE sheet each time.
function getDashboardData() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error("Sheet tab not found. Check SHEET_NAME.");
    // getDisplayValues() returns strings exactly as shown (dates like 5/1/2026,
    // numbers like 34.53). Do NOT use getValues() — it returns Date/number
    // objects and breaks the dashboard's date/number parsing.
    return sheet.getDataRange().getDisplayValues();
  } catch (error) {
    return { error: error.toString() };
  }
}
