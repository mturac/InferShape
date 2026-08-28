import type { SessionReport } from "./types.js";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

export function renderHtmlReport(report: SessionReport): string {
  const status = report.metrics.verifiedCompletion ? "Verified" : report.metrics.falseCompletion ? "False completion" : "Incomplete";
  const metrics = [
    metric("Events", report.metrics.eventCount),
    metric("Duration (ms)", report.metrics.durationMs),
    metric("Repeated reads", report.metrics.repeatedReadCount),
    metric("Patch churn", report.metrics.patchChurnCount),
    metric("Tool loops", report.metrics.toolLoopCount),
    metric("Unresolved failures", report.metrics.unresolvedFailureCount),
    metric("Passing tests", report.metrics.passingTests),
    metric("Avoidable exploration", `${Math.round(report.metrics.avoidableExplorationRatio * 100)}%`)
  ].join("");
  const findings = report.findings.map((finding) => `<article class="finding ${finding.severity}"><div><code>${escapeHtml(finding.code)}</code><h3>${escapeHtml(finding.title)}</h3></div><p>${escapeHtml(finding.summary)}</p><p class="recommendation">${escapeHtml(finding.recommendation)}</p></article>`).join("");
  const files = report.summary.changedFiles.map((path) => `<li><code>${escapeHtml(path)}</code></li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>InferShape · ${escapeHtml(report.summary.sessionId)}</title><style>:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#e5edf8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#172554 0,#07111f 38%,#040812 100%);min-height:100vh}main{max-width:1180px;margin:auto;padding:42px 24px 80px}.hero{background:linear-gradient(135deg,rgba(37,99,235,.22),rgba(124,58,237,.14));border:1px solid #243a64;border-radius:24px;padding:34px;box-shadow:0 24px 80px rgba(0,0,0,.3)}h1{font-size:52px;margin:0 0 8px}.sub{color:#9fb2cc}.status{display:inline-flex;margin-top:18px;padding:8px 14px;border-radius:999px;background:#14223b;border:1px solid #3d5f98;font-weight:700}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:24px 0}.metric{background:#0d1728;border:1px solid #21304a;border-radius:16px;padding:17px}.metric span{display:block;color:#8fa3bd;font-size:13px}.metric strong{display:block;font-size:26px;margin-top:6px}.finding{border:1px solid #24344f;background:#0d1728;border-radius:18px;padding:20px;margin:14px 0}.finding.error{border-color:#7f1d1d}.finding.warning{border-color:#78350f}.finding code{color:#8eb5ff}.finding h3{margin:8px 0}.recommendation{color:#b8c8dd}.section{margin-top:34px}.files{columns:2;list-style:none;padding:0}.files li{margin:8px 0}footer{margin-top:40px;color:#7890aa;font-size:13px}@media(max-width:650px){h1{font-size:38px}.files{columns:1}}</style></head><body><main><section class="hero"><h1>InferShape</h1><p class="sub">Coding-agent session diagnosis and privacy-safe repair handoff.</p><span class="status">${escapeHtml(status)}</span><p class="sub">Session ${escapeHtml(report.summary.sessionId)} · ${escapeHtml(report.profileHash.slice(0, 16))}</p></section><section class="grid">${metrics}</section><section class="section"><h2>Findings</h2>${findings}</section><section class="section"><h2>Changed files</h2><ul class="files">${files || "<li>None observed.</li>"}</ul></section><footer>Generated locally by InferShape ${escapeHtml(report.summary.analyzerVersion)}. No prompt or model output content is included.</footer></main></body></html>`;
}
