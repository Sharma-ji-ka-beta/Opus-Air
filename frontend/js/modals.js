window.closeModal = function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
};

window.openModal = function openModal(title, bodyHtml) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <section class="modal">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="modal-close" id="modal-close">X</button>
        </div>
        ${bodyHtml}
      </section>
    </div>
  `;
  document.getElementById("modal-close").onclick = window.closeModal;
  document.getElementById("modal-overlay").onclick = (e) => {
    if (e.target.id === "modal-overlay") window.closeModal();
  };
  document.onkeydown = (e) => { if (e.key === "Escape") window.closeModal(); };
};

window.openDelayInjectionModal = async function openDelayInjectionModal() {
  const flights = await window.api("/api/flights");
  const options = flights.map(f => `<option value="${f.id}">${f.flight_number} · ${f.origin} · ${f.gate} · ${f.severity}</option>`).join("");
  window.openModal("Delay Injection", `
    <div class="form-grid">
      <label>Flight<select id="delay-flight">${options}</select></label>
      <label>Task<select id="delay-task"></select></label>
      <label>Delay Minutes<input type="number" id="delay-minutes" min="1" value="10"/></label>
      <label>Delay Type<select id="delay-type"><option>Late Arrival</option><option>Crew Missing</option><option>Equipment Fault</option><option>Weather</option><option>Gate Conflict</option><option>Other</option></select></label>
      <label style="grid-column:1/-1">Note<textarea id="delay-note"></textarea></label>
    </div>
    <button id="inject-delay">Inject & Analyze</button>
    <div id="delay-impact"></div>
  `);
  const fillTasks = () => {
    const f = flights.find(x => x.id === Number(document.getElementById("delay-flight").value));
    document.getElementById("delay-task").innerHTML = f.tasks.filter(t => t.status !== "complete").map(t => `<option value="${t.id}">${t.name} - ${t.status}</option>`).join("");
  };
  fillTasks();
  document.getElementById("delay-flight").onchange = fillTasks;
  document.getElementById("inject-delay").onclick = async () => {
    const body = {
      flight_id: Number(document.getElementById("delay-flight").value),
      task_id: Number(document.getElementById("delay-task").value),
      delay_minutes: Number(document.getElementById("delay-minutes").value),
      reason: document.getElementById("delay-type").value,
      note: document.getElementById("delay-note").value
    };
    const res = await window.api("/api/delay", { method: "POST", body: JSON.stringify(body) });
    document.getElementById("delay-impact").innerHTML = `<p><b>Impacted:</b> ${res.impact_summary.impacted_tasks.join(", ")}</p><p><b>Recommendation:</b> ${res.recommendation.summary}</p>`;
  };
};
