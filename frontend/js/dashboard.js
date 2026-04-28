window.dashboardChart = null;

window.renderDashboard = function renderDashboard(data) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <h1 class="page-title">Hello, Coordinator</h1>
    <div class="line"><span class="badge critical">Critical ${data.critical_alerts_count}</span><span class="badge delayed">Action ${data.flights_needing_action_count}</span><button id="open-delay">+ Inject Delay</button></div>
    <section class="grid">
      <article class="card"><h3>Active Turnarounds</h3><div class="stat mono">${data.total_active_turnarounds}</div>${data.active_turnarounds.map(f => `<div class="flight-row"><span>${f.flight_number} ${f.gate}</span><span class="badge ${f.severity}">${f.severity}</span></div>`).join("")}</article>
      <article class="card"><h3>Critical Alerts</h3><div class="stat mono">${data.critical_alerts_count}</div>${data.active_alerts.map(a => `<div class="alert-row"><span>${a.alert_type}</span><span class="badge ${a.severity}">${a.severity}</span></div>`).join("")}</article>
      <article class="card" style="background:#4a5240;color:#f0ede3"><h3>AI Recommendations</h3><p>${data.latest_recommendation.summary}</p><button id="accept-rec">Accept</button></article>
      <article class="card"><h3>Gate/Bay Utilization</h3><div>${["A1","A2","A3","A4","A5"].map(g => `<div>${g} ${data.active_turnarounds.filter(f => f.gate===g).length}</div>`).join("")}</div></article>
      <article class="card"><h3>Today's Schedule</h3>${data.today_schedule.map(s => `<div class="line"><span>${new Date(s.scheduled_departure).toLocaleTimeString()}</span><span>${s.flight_number}</span></div>`).join("")}</article>
      <article class="card"><h3>On-Time Performance</h3><canvas id="otpChart" width="560" height="220"></canvas></article>
    </section>
    <section class="card"><h3>Resource Availability</h3><div class="resource-bar">${data.resource_availability.map(r => `<span class="pill ${r.status}">${r.name}</span>`).join("")}</div></section>
    <section class="card"><h3>Activity Feed</h3>${data.events.map(e => `<div class="event-row"><span>${new Date(e.timestamp).toLocaleTimeString()} ${e.event_type}</span><span>${e.flight_id ?? "-"}</span></div>`).join("")}</section>
  `;
  document.getElementById("open-delay").onclick = window.openDelayInjectionModal;
  document.getElementById("accept-rec").onclick = async () => {
    await window.api("/api/recommendation/accept", { method: "POST", body: JSON.stringify({ note: "accepted from dashboard" }) });
    await window.loadDashboard();
  };
  const ctx = document.getElementById("otpChart");
  if (window.dashboardChart) window.dashboardChart.destroy();
  window.dashboardChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.on_time_performance.map(d => d.x),
      datasets: [
        { data: data.on_time_performance.map(d => d.y), borderColor: "#b5a96e", borderWidth: 2, tension: 0.2 },
        { data: data.on_time_performance.map(() => 85), borderColor: "#8a9278", borderDash: [5, 5], borderWidth: 1 }
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, grid: { color: "rgba(138,146,120,0.2)" } }, x: { grid: { color: "rgba(138,146,120,0.2)" } } } }
  });
};

window.loadDashboard = async function loadDashboard() {
  const data = await window.api("/api/dashboard");
  window.state.dashboard = data;
  if (window.currentPage === "dashboard") window.renderDashboard(data);
};
