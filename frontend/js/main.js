window.currentPage = "dashboard";

function renderHow() {
  document.getElementById("app").innerHTML = `
    <h1 class="page-title">How Turnaround Works</h1>
    <section class="card"><h3>What a turnaround is</h3><p>The window between landing and next departure, usually 45-90 minutes.</p></section>
    <section class="card"><h3>Standard sequence</h3><div class="timeline"><span class="node">Deboarding</span><span class="node">Cleaning</span><span class="node">Catering</span><span class="node">Fueling</span><span class="node">Boarding</span></div></section>
    <section class="card"><h3>Critical path simulator</h3><p>Click tasks to mark delayed and see downstream impact.</p><div id="sim" class="timeline"></div></section>
  `;
  const steps = ["Deboarding", "Cleaning", "Catering", "Fueling", "Boarding"];
  const sim = document.getElementById("sim");
  sim.innerHTML = steps.map(s => `<button class="node sim-node">${s}</button>`).join("");
  const nodes = [...document.querySelectorAll(".sim-node")];
  nodes.forEach((n, i) => n.onclick = () => { for (let j = i; j < nodes.length; j++) nodes[j].classList.add("red"); });
}

function renderSettings() {
  document.getElementById("app").innerHTML = `
    <h1 class="page-title">Settings</h1>
    <section class="card">
      <div class="form-grid">
        <label>Name<input id="s-name" value="Coordinator"/></label>
        <label>Role<input id="s-role" value="Turnaround Lead"/></label>
        <label>Critical Delay Threshold<input type="number" id="s-threshold" value="20"/></label>
        <label>AI Aggressiveness<select id="s-ai"><option>Conservative</option><option selected>Balanced</option><option>Proactive</option></select></label>
      </div>
      <button id="save-settings">Save Settings</button>
    </section>
  `;
  document.getElementById("save-settings").onclick = async () => {
    const payload = {
      profile: { name: document.getElementById("s-name").value, role: document.getElementById("s-role").value },
      threshold: Number(document.getElementById("s-threshold").value),
      ai: document.getElementById("s-ai").value
    };
    await window.api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
  };
}

window.renderPage = function renderPage(page) {
  window.currentPage = page;
  if (page === "dashboard") window.renderDashboard(window.state.dashboard || { active_turnarounds: [], active_alerts: [], resource_availability: [], events: [], on_time_performance: [{ x: "Now", y: 100 }], latest_recommendation: { summary: "" }, today_schedule: [], critical_alerts_count: 0, flights_needing_action_count: 0, total_active_turnarounds: 0 });
  if (page === "flights") window.renderFlights(window.state.flights || []);
  if (page === "reports") window.renderReports();
  if (page === "how") renderHow();
  if (page === "settings") renderSettings();
};

document.getElementById("tabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (!b) return;
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  window.renderPage(b.dataset.page);
});

window.startPolling(window.loadDashboard, 5000);
window.startPolling(window.loadFlights, 5000);
window.renderPage("dashboard");
