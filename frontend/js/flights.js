window.renderFlights = function renderFlights(flights) {
  const app = document.getElementById("app");
  const total = flights.length;
  const onTime = flights.filter(f => f.severity === "on_time").length;
  const delayed = flights.filter(f => f.severity === "delayed").length;
  const critical = flights.filter(f => f.severity === "critical").length;
  app.innerHTML = `
    <h1 class="page-title">Flight List</h1>
    <section class="card"><div class="line"><span>Total ${total}</span><span>On Time ${onTime}</span><span>Delayed ${delayed}</span><span>Critical ${critical}</span></div></section>
    <table>
      <thead><tr><th>Flight</th><th>Origin</th><th>Gate</th><th>Scheduled</th><th>Estimated</th><th>Status</th><th>Duration</th><th>Actions</th></tr></thead>
      <tbody>
        ${flights.map(f => `<tr><td>${f.flight_number}</td><td>${f.origin}</td><td>${f.gate}</td><td>${new Date(f.scheduled_departure).toLocaleTimeString()}</td><td>${new Date(f.estimated_departure).toLocaleTimeString()}</td><td><span class="badge ${f.severity}">${f.severity}</span></td><td>${f.tasks.reduce((a,t)=>a+t.actual_duration_min,0)}m</td><td><button data-flight="${f.id}" class="view-flight">View</button></td></tr>`).join("")}
      </tbody>
    </table>
  `;
  document.querySelectorAll(".view-flight").forEach(btn => {
    btn.onclick = () => {
      const f = flights.find(x => x.id === Number(btn.dataset.flight));
      window.openModal(`Flight ${f.flight_number}`, `<p>${f.origin} -> ${f.destination} (${f.gate})</p>${f.tasks.map(t => `<div class="line"><b>${t.name}</b><span>${t.status}</span><span>${t.actual_duration_min} min</span></div>`).join("")}`);
    };
  });
};

window.loadFlights = async function loadFlights() {
  const flights = await window.api("/api/flights");
  window.state.flights = flights;
  if (window.currentPage === "flights") window.renderFlights(flights);
};
