import {
  analyzeRecords,
  compareReports,
  createRepairPacket,
  normalizeRecords,
  renderHtmlReport,
  type SessionReport
} from "@mturac/infershape";

const events = normalizeRecords([{ timestamp: 1, type: "session_start" }]);
const report: SessionReport = analyzeRecords([{ timestamp: 1, type: "session_start" }]);
createRepairPacket(report, events);
compareReports(report, report);
renderHtmlReport(report);
