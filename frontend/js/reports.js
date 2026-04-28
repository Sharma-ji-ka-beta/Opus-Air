window.reportCharts = [];

window.destroyReportCharts = function destroyReportCharts() {
  window.reportCharts.forEach(c => c.destroy());
  window.reportCharts = [];
};

window.renderReports = async function renderReports() {
  const app = document.getElementById("app");
  const flights = await window.api("/api/flights");
  const first = flights[0];
  const report = first ? await window.api(`/api/report/${first.id}`) : { system_data: { task_timeline: [] }, ai_analysis: {} };
  app.innerHTML = `
    <h1 class="page-title">Reports</h1>
    <section class="grid">
      <article class="card"><h3>Gantt Snapshot</h3><canvas id="gantt" width="560" height="260"></canvas></article>
      <article class="card"><h3>Delay Frequency</h3><canvas id="freq" width="560" height="260"></canvas></article>
      <article class="card"><h3>Historical On-Time Trend</h3><canvas id="hist" width="560" height="260"></canvas></article>
    </section>
    <section class="card"><h3>Critical Path Analysis</h3><div class="timeline">${report.system_data.critical_path.path.map(p => `<span class="node ${p===report.system_data.bottleneck_task ? "red" : ""}">${p}</span>`).join("")}</div></section>
    <section class="card"><h3>AI Analysis</h3><p>${report.ai_analysis.summary || "No active recommendation."}</p></section>
  `;
  window.destroyReportCharts();
  const timeline = report.system_data.task_timeline;
  const mk = (id, type, labels, data) => new Chart(document.getElementById(id), {
    type,
    data: { labels, datasets: [{ data, backgroundColor: "#b5a96e", borderColor: "#b5a96e" }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: "rgba(138,146,120,0.2)" } }, x: { grid: { color: "rgba(138,146,120,0.2)" } } } }
  });
  window.reportCharts.push(mk("gantt", "bar", timeline.map(t => t.task), timeline.map(t => t.actual_min)));
  window.reportCharts.push(mk("freq", "bar", timeline.map(t => t.task), timeline.map(t => t.delay_min)));
  window.reportCharts.push(new Chart(document.getElementById("hist"), {
    type: "line",
    data: { labels: ["-7","-6","-5","-4","-3","-2","-1","Now"], datasets: [{ data: [92,90,88,87,89,91,90,93], borderColor: "#b5a96e" }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, grid: { color: "rgba(138,146,120,0.2)" } }, x: { grid: { color: "rgba(138,146,120,0.2)" } } } }
  }));
};
