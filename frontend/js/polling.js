window.API_BASE = "http://127.0.0.1:5050";
window.state = { dashboard: null, flights: [], events: [], recommendation: null };
window.pollers = [];

window.api = async function api(path, opts = {}) {
  const res = await fetch(`${window.API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`API failed: ${path}`);
  return res.json();
};

window.startPolling = function startPolling(fn, ms = 5000) {
  fn();
  const id = setInterval(fn, ms);
  window.pollers.push(id);
};
