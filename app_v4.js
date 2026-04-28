/* ── app_v4.js — Opus Air JS-Based Simulation Engine (Self-Contained) ── */

const API = 'http://127.0.0.1:5050';

// ─────────────── DATA & STATE ───────────────
const DESTS = ['Dubai', 'Singapore', 'London', 'Tokyo', 'Paris', 'New York', 'Frankfurt', 'Sydney', 'Mumbai'];
let flightCounter = 100;
function spawnFlight() {
  flightCounter++;
  return {
    id: `OA${flightCounter}`,
    destination: DESTS[Math.floor(Math.random() * DESTS.length)],
    baseDuration: 45,
    workerRequirement: 20,
    priority: Math.floor(Math.random() * 3) + 1,
    status: 'waiting',
    gate: null,
    timeElapsed: 0,
    delayMinutes: 0,
    workersAssigned: 0,
    plannedDuration: 45,
    savedMinutes: 0,
    queueCountdown: 0,
    crewDelayed: false
  };
}

const GATES_LIST = ['A1', 'A2', 'A3', 'A4', 'A5'];
const MAX_WORKERS = 60;
const TICK_MS = 2000;
const SIM_MINS_PER_TICK = 1; // 1 sim minute per 2 real seconds = 2 real minutes for a 60min flight

// Delay Events
const DELAY_EVENTS = [
  { name: 'Baggage Delay', mins: 8, prob: 0.05 },
  { name: 'Fuel Truck Queue', mins: 12, prob: 0.04 },
  { name: 'Late Crew', mins: 15, prob: 0.03 },
  { name: 'Weather Hold', mins: 20, prob: 0.03 },
  { name: 'Catering Late', mins: 7, prob: 0.05 },
  { name: 'Gate Equipment', mins: 10, prob: 0.04 }
];

let runCounter = 1;
let flights = [];
let gates = [];
let queue = [];
let completed = [];
let delayFeed = [];
let totalMinSaved = 0;
let delaysPrevented = 0;
let onTimeHistory = [];
let tickInterval = null;
let activeAlerts = 0;

let dashboardChart = null;
let chartTimeLabels = [];
let chartSavedData = [];
let chartDelayData = [];

// ─────────────── CLOCK ───────────────
function tickClock() {
  const el = document.getElementById('live-clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-GB');
}
setInterval(tickClock, 1000);
tickClock();

// ─────────────── SIMULATION ENGINE ───────────────

function initSim() {
  flights = [];
  gates = GATES_LIST.map(id => ({ id, flightId: null }));
  queue = [];
  completed = [];
  delayFeed = [];
  totalMinSaved = 0;
  delaysPrevented = 0;
  activeAlerts = 0;
  onTimeHistory = [];
  chartTimeLabels = [];
  chartSavedData = [];
  chartDelayData = [];

  if (typeof Chart !== 'undefined') initChart();
  
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(tick, TICK_MS);
  
  logEvent('SYSTEM', `Simulation Run #${runCounter} Started`, 'good', 0);
  updateDOM();
}

function tick() {
  activeAlerts = 0;

  // Maintain 3 active/queued/waiting flights
  let activeCount = flights.filter(f => f.status !== 'completed').length;
  while(activeCount < 3) {
    flights.push(spawnFlight());
    activeCount++;
  }

  // Queue & Departures logic
  if (queue.length > 0) {
    let departingFlightId = queue[0];
    let f = flights.find(x => x.id === departingFlightId);
    
    if (f && f.queueCountdown <= 0) {
      queue.shift();
      f.status = 'completed';
      f.actualDuration = f.timeElapsed + f.delayMinutes;
      completed.push(f);
      
      let isOntime = f.actualDuration <= f.plannedDuration + 5;
      onTimeHistory.push(isOntime);
      if (onTimeHistory.length > 10) onTimeHistory.shift();
      
      let gate = gates.find(g => g.flightId === f.id);
      if (gate) gate.flightId = null;
      f.workersAssigned = 0;
      f.gate = null;
      
      logEvent(f.id, 'Departed', 'good', 0);
      triggerDepartAnim(departingFlightId);
      fillQueue();
    }
    
    queue.forEach(id => {
      let qf = flights.find(x => x.id === id);
      if (qf) qf.queueCountdown -= SIM_MINS_PER_TICK;
    });
  }

  // Process active flights & random events
  flights.filter(f => f.status === 'active').forEach(f => {
    // Manual delays are injected via the modal
    
    f.timeElapsed += SIM_MINS_PER_TICK;
    if (f.delayMinutes > 0) activeAlerts++;

    if (f.timeElapsed >= f.plannedDuration + f.delayMinutes) {
      f.status = 'ready';
      logEvent(f.id, 'Turnaround Complete', 'good', 0);
      fillQueue();
    }
  });

  // Gate assignment
  let waiting = flights.filter(f => f.status === 'waiting').sort((a,b) => a.priority - b.priority);
  waiting.forEach(f => {
    let emptyGates = gates.filter(g => g.flightId === null);
    if (emptyGates.length > 0) {
      let emptyGate = emptyGates[Math.floor(Math.random() * emptyGates.length)];
      f.status = 'active';
      f.gate = emptyGate.id;
      emptyGate.flightId = f.id;
      f.workersAssigned = 20;
      f.crewDelayed = false;
      logEvent(f.id, `Assigned to Gate ${f.gate}`, 'good', 0);
    }
  });

  // Graph update
  let currentTime = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
  chartTimeLabels.push(currentTime);
  chartSavedData.push(totalMinSaved);
  let currentDelay = flights.reduce((sum, f) => sum + f.delayMinutes, 0);
  chartDelayData.push(currentDelay);
  
  if(chartTimeLabels.length > 20) {
    chartTimeLabels.shift();
    chartSavedData.shift();
    chartDelayData.shift();
  }
  if(dashboardChart) dashboardChart.update();

  updateDOM();
}

function fillQueue() {
  let readyFlights = flights.filter(f => f.status === 'ready' && !queue.includes(f.id));
  readyFlights.forEach(readyFlight => {
    if (queue.length < 3) {
      readyFlight.status = 'queue';
      readyFlight.queueCountdown = 2; // 2 mins in queue
      queue.push(readyFlight.id);
      logEvent(readyFlight.id, 'Entered Departure Queue', 'good', 0);
    }
  });
}

function logEvent(flightId, message, impact, minsAdded) {
  const ts = new Date().toLocaleTimeString('en-GB');
  delayFeed.unshift({ ts, flightId, message, impact, minsAdded });
  if (delayFeed.length > 20) delayFeed.pop();
}

// ─────────────── HYBRID BACKEND FETCH ───────────────

async function getEnhancedRecommendation(flightId, task, minutes) {
  try {
    const res = await fetch(`${API}/api/inject_delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flight_id: flightId, task: task, minutes: minutes })
    });
    if (!res.ok) throw new Error("Backend error");
    const data = await res.json();
    return data.recommendation || null;
  } catch (e) {
    return null; // Silent fallback
  }
}

// ─────────────── DOM UPDATES ───────────────

function initChart() {
  const ctx = document.getElementById('dashboard-chart');
  if(!ctx) return;
  if(dashboardChart) dashboardChart.destroy();
  dashboardChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartTimeLabels,
      datasets: [
        {
          label: 'Minutes Saved',
          data: chartSavedData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Total Delay',
          data: chartDelayData,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#a1a1aa' } } },
      scales: {
        x: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function updateDOM() {
  updateDashboard();
  updateGates();
  updateReports();
  updateHowItWorks();
}

function updateDashboard() {
  let activeCount = flights.filter(f => f.status === 'active' || f.status === 'ready').length;
  document.getElementById('stat-active').textContent = activeCount;
  let activeGates = gates.filter(g => g.flightId !== null).map(g => g.id).join(' · ');
  document.getElementById('stat-active-sub').textContent = activeGates ? `Gates ${activeGates}` : 'Gates --';
  
  document.getElementById('stat-alerts').textContent = activeAlerts;
  document.getElementById('stat-alerts-sub').textContent = activeAlerts > 0 ? `${activeAlerts} flights delayed` : 'All systems nominal';
  if (activeAlerts > 0) {
    document.getElementById('stat-alerts').parentElement.classList.add('border-red');
    document.getElementById('stat-alerts').parentElement.classList.remove('border-green');
  } else {
    document.getElementById('stat-alerts').parentElement.classList.remove('border-red');
  }
  
  document.getElementById('stat-saved').textContent = totalMinSaved;
  document.getElementById('stat-prevented').textContent = `${delaysPrevented} optimizations applied`;
  
  let ontimePct = onTimeHistory.length > 0 
    ? Math.round((onTimeHistory.filter(x => x).length / onTimeHistory.length) * 100) 
    : 100;
  document.getElementById('stat-ontime').textContent = `${ontimePct}%`;

  let listEl = document.getElementById('flights-list');
  let activeFlights = flights.filter(f => f.status === 'active' || f.status === 'ready');
  document.getElementById('flights-count').textContent = `${activeFlights.length} flights`;
  
  if (activeFlights.length === 0) {
    listEl.innerHTML = `<div class="loading-pulse">No active turnarounds.</div>`;
  } else {
    listEl.innerHTML = activeFlights.map(f => {
      let pct = Math.min(100, (f.timeElapsed / (f.plannedDuration + f.delayMinutes)) * 100);
      let statusClass = f.delayMinutes > 0 ? 'status-delayed' : (f.delayMinutes > 10 ? 'status-atrisk' : 'status-ontrack');
      
      return `
        <div class="flight-row ${statusClass}" onclick="openFlightModal('${f.id}')">
          <div style="width:80px;">
            <div class="flight-id">${f.id}</div>
            <div class="flight-dest">${f.destination}</div>
          </div>
          <div class="flight-gate-info" style="width:60px;">
            <div class="flight-gate">${f.gate || '--'}</div>
            <div class="flight-status-text">${f.status}</div>
          </div>
          <div class="flight-progress-container">
            <div style="font-size:0.75rem; color:var(--text-dim); display:flex; justify-content:space-between;">
              <span>${f.timeElapsed}m</span>
              <span>${f.plannedDuration + f.delayMinutes}m</span>
            </div>
            <div class="flight-progress-bar">
              <div class="flight-progress-fill" style="width:${pct}%"></div>
            </div>
          </div>
          <div style="width:60px; text-align:right;">
             <span style="font-size:0.8rem; color:${f.delayMinutes > 0 ? 'var(--danger)' : 'var(--text-dim)'}">+${f.delayMinutes}m</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

function updateGates() {
  let gridEl = document.getElementById('gates-grid');
  if(!gridEl) return;
  gridEl.innerHTML = gates.map(g => {
    if (!g.flightId) {
      return `
        <div class="card gate-card empty">
          <div class="gate-id">${g.id}</div>
          <div class="gate-flight-id">Empty</div>
          <div class="gate-dest">Awaiting aircraft</div>
          <div class="gate-status-badge empty">Standby</div>
        </div>
      `;
    }
    let f = flights.find(x => x.id === g.flightId);
    let pct = Math.min(100, (f.timeElapsed / (f.plannedDuration + f.delayMinutes)) * 100);
    let badgeClass = f.status === 'ready' ? 'ready' : (f.delayMinutes > 0 ? 'delayed' : 'active');
    
    return `
      <div class="card gate-card" style="cursor:pointer;" onclick="openFlightModal('${f.id}')">
        <div class="gate-id">${g.id}</div>
        <div class="gate-flight-id">${f.id}</div>
        <div class="gate-dest">${f.destination}</div>
        <div class="flight-progress-bar" style="margin-bottom:1rem;">
          <div class="flight-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="gate-metrics">
          <span>Turnaround: ${f.timeElapsed}/${f.plannedDuration + f.delayMinutes}m</span>
          <span class="gate-workers">👷 ${f.workersAssigned}</span>
        </div>
        <div class="gate-metrics" style="margin-top:0.25rem;">
          <span style="color:var(--text-dim); font-size:0.75rem;">⛽ 2 Fuel Trucks</span>
        </div>
        <div class="gate-status-badge ${badgeClass}">${f.status}</div>
      </div>
    `;
  }).join('');
}

function updateReports() {
  let listEl = document.getElementById('reports-flight-list');
  if(!listEl) return;
  // Combine completed and active flights, sort completed first
  let allF = [...completed, ...flights.filter(f => f.status !== 'waiting' && !completed.find(c => c.id === f.id))];
  
  if(allF.length === 0) {
    listEl.innerHTML = `<div style="color:var(--text-dim); font-style:italic;">No active or completed flights yet.</div>`;
    return;
  }
  
  listEl.innerHTML = allF.map(f => {
    let isCompleted = f.status === 'completed';
    return `
      <div class="flight-row ${isCompleted ? '' : 'status-ontrack'}" style="cursor:pointer; border-bottom:1px solid var(--glass-border); padding-bottom:0.5rem; margin-bottom:0.5rem;" onclick="selectReportFlight('${f.id}')">
        <div style="width:80px;">
          <div class="flight-id">${f.id}</div>
          <div class="flight-dest">${f.destination}</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:0.8rem; color:var(--text-dim);">Status: ${f.status}</div>
          <div style="font-size:0.8rem;">Delay: <span style="color:${f.delayMinutes > 0 ? 'var(--danger)' : 'var(--text-dim)'}">+${f.delayMinutes}m</span></div>
        </div>
      </div>
    `;
  }).join('');
}

let selectedReportFlightId = null;

window.selectReportFlight = function(flightId) {
  selectedReportFlightId = flightId;
  let f = flights.find(x => x.id === flightId) || completed.find(x => x.id === flightId);
  if(!f) return;
  
  let content = document.getElementById('report-content');
  let btn = document.getElementById('btn-generate-report');
  if(!content || !btn) return;
  
  if (f.status !== 'completed') {
    content.innerHTML = `Flight ${f.id} is currently in progress. Reports can only be generated for completed flights.`;
    btn.style.display = 'none';
  } else {
    content.innerHTML = `Flight ${f.id} to ${f.destination} completed.<br/><br/>Planned: ${f.plannedDuration}m<br/>Actual: ${f.actualDuration}m<br/>Delays: ${f.delayMinutes}m<br/><br/>Click "Generate AI Report" to get the full analysis.`;
    btn.style.display = 'block';
  }
};

// ─────────────── HOW IT WORKS (SIMULATOR) ───────────────
let simDelays = {};
const SIM_TASKS = [
  { name: 'Arrival',        duration: 5, status: 'complete', critical: true },
  { name: 'Deboard',        duration: 10, status: 'complete', critical: true },
  { name: 'Bag Unload',     duration: 10, status: 'complete', critical: true },
  { name: 'Clean',          duration: 10, status: 'in_progress', critical: true },
  { name: 'Fuel/Cater',     duration: 15, status: 'in_progress', critical: false },
  { name: 'Bag Load',       duration: 10, status: 'pending', critical: true },
  { name: 'Boarding',       duration: 20, status: 'pending', critical: true },
  { name: 'Pushback',       duration: 5, status: 'pending', critical: true },
];

function updateHowItWorks() {
  const container = document.getElementById('sim-timeline');
  if (!container) return;
  container.innerHTML = SIM_TASKS.map(t => {
    const extra = simDelays[t.name] ? ` <span style="color:var(--danger);font-size:.7rem">+${simDelays[t.name]}m</span>` : '';
    const clickable = t.status !== 'complete' ? `onclick="simInjectDelay('${t.name}')"` : '';
    return `<div class="sim-task ${t.status}" ${clickable}>
      <span>${t.name}</span>
      <span>${t.duration}m${extra}</span>
    </div>`;
  }).join('');
  
  let cascade = 0;
  SIM_TASKS.forEach(t => { if (simDelays[t.name] && t.critical) cascade += simDelays[t.name]; });
  const el = document.getElementById('sim-delay-output');
  if (el) {
    el.textContent = `${cascade} minute${cascade !== 1 ? 's' : ''}`;
    el.style.color = cascade > 0 ? 'var(--danger)' : 'var(--success)';
  }
}

function simInjectDelay(taskName) {
  const task = SIM_TASKS.find(t => t.name === taskName);
  if (!task || task.status === 'complete') return;
  simDelays[taskName] = (simDelays[taskName] || 0) + 10;
  updateHowItWorks();
}

// ─────────────── UI HELPERS ───────────────

function triggerDepartAnim(flightId) {
  let el = document.getElementById(`slot-${flightId}`);
  if (el) {
    el.classList.add('departing');
    setTimeout(() => {
      el.classList.remove('departing');
    }, 1000);
  }
}

function showAiRecommendation(flightId, minsSaved, textStr) {
  // Show in small dashboard panel
  let activeDiv = document.getElementById('rec-active');
  let idleDiv = document.getElementById('rec-idle');
  
  document.getElementById('rec-save-label').textContent = `+${minsSaved} min saved`;
  document.getElementById('rec-flight-label').textContent = flightId;
  document.getElementById('rec-text').textContent = textStr;
  
  idleDiv.classList.add('hidden');
  activeDiv.classList.remove('hidden');
  
  let panel = document.getElementById('ai-panel');
  panel.style.borderColor = 'var(--success)';
  setTimeout(() => {
    panel.style.borderColor = 'var(--glass-border)';
    setTimeout(() => {
      activeDiv.classList.add('hidden');
      idleDiv.classList.remove('hidden');
    }, 4000);
  }, 500);

  // Show as prominent modal pop-up
  let aiModalBody = document.getElementById('ai-intervention-body');
  if(aiModalBody) {
    aiModalBody.innerHTML = `
      <p><strong>Flight:</strong> ${flightId}</p>
      <p><strong>Action Taken:</strong> ${textStr}</p>
      <p style="color:var(--success); margin-top:1rem;">⚡ Saved ${minsSaved} minutes of delay propagation.</p>
    `;
    document.getElementById('ai-intervention-modal').classList.remove('hidden');
  }
}

document.getElementById('btn-close-ai-modal')?.addEventListener('click', () => {
  document.getElementById('ai-intervention-modal').classList.add('hidden');
});
document.getElementById('btn-ack-ai-modal')?.addEventListener('click', () => {
  document.getElementById('ai-intervention-modal').classList.add('hidden');
});

// ─────────────── TAB NAVIGATION ───────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active');
  });
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  const page = document.getElementById(`page-${pageId}`);
  if (page) { page.style.display = 'block'; setTimeout(() => page.classList.add('active'), 10); }
  const tab = document.querySelector(`.tab[data-page="${pageId}"]`);
  if (tab) tab.classList.add('active');
  
  if (pageId === 'how') {
    simDelays = {};
    updateHowItWorks();
  }
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// ─────────────── MODALS & INJECT ───────────────
document.getElementById('btn-reset').addEventListener('click', () => {
  // Smoother reset without confirm if desired, but confirm is safe.
  if (confirm('Reset simulation?')) {
    initSim();
  }
});

function populateTasksForFlight(flightId) {
  const f = flights.find(x => x.id === flightId);
  const selTask = document.getElementById('sel-task');
  if (!selTask || !f) return;
  
  const tasks = [
    { name: 'Arrival', threshold: 0 },
    { name: 'Deboarding', threshold: 5 },
    { name: 'Baggage Unload', threshold: 10 },
    { name: 'Cleaning', threshold: 15 },
    { name: 'Fueling & Catering', threshold: 20 },
    { name: 'Baggage Load', threshold: 25 },
    { name: 'Boarding', threshold: 30 },
    { name: 'Pushback', threshold: 35 }
  ];
  
  const available = tasks.filter(t => f.timeElapsed <= t.threshold);
  if (available.length === 0) available.push(tasks[tasks.length - 1]);
  
  selTask.innerHTML = available.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
}

document.getElementById('sel-flight')?.addEventListener('change', (e) => {
  populateTasksForFlight(e.target.value);
});

document.getElementById('btn-open-modal').addEventListener('click', () => {
  // Populate flight options
  const sel = document.getElementById('sel-flight');
  if (sel) {
    let activeF = flights.filter(f => f.status === 'active');
    if (activeF.length === 0) activeF = flights; // fallback if empty
    if (activeF.length > 0) {
      sel.innerHTML = activeF.map(f => `<option value="${f.id}">${f.id} · ${f.destination} · Gate ${f.gate || 'N/A'}</option>`).join('');
      populateTasksForFlight(activeF[0].id); // trigger initial task population
    }
  }
  document.getElementById('delay-modal').classList.remove('hidden');
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
  document.getElementById('delay-modal').classList.add('hidden');
});
document.getElementById('btn-cancel-modal').addEventListener('click', () => {
  document.getElementById('delay-modal').classList.add('hidden');
});

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    let inp = document.getElementById('inp-minutes');
    if(inp) inp.value = btn.dataset.val;
  });
});

document.getElementById('btn-confirm-inject').addEventListener('click', async () => {
  const flightId = document.getElementById('sel-flight').value;
  const task = document.getElementById('sel-task').value;
  const minutes = parseInt(document.getElementById('inp-minutes').value, 10);
  const btn = document.getElementById('btn-confirm-inject');
  
  btn.textContent = 'Injecting...';
  btn.disabled = true;
  
  // 1. Update JS State Immediately
  let f = flights.find(x => x.id === flightId);
  if (f) {
    f.delayMinutes += minutes;
    logEvent(f.id, `Manual delay on ${task}`, 'bad', minutes);
  }
  
  // Update DOM immediately to reflect delay ("call updateCriticalPath immediately")
  updateDOM();
  document.getElementById('delay-modal').classList.add('hidden');

  // 2. Fetch situational data from backend
  let recData = await getEnhancedRecommendation(flightId, task, minutes);
  let saved = Math.floor(minutes * 0.7); // Fallback base
  if (saved < 1) saved = 1;
  let emptyGateCount = gates.filter(g => !g.flightId).length;
  let borrowedWorkers = 0;
  let recStr = `Manually resolved ${task} delay. Auto-reallocated workers to save ${saved} mins.`;

  // 3. Apply Gemini-assessed recovery
  if (recData && emptyGateCount > 0 && f) {
    borrowedWorkers = recData.borrowedWorkers !== undefined ? recData.borrowedWorkers : 0;
    saved = recData.minutesSaved !== undefined ? recData.minutesSaved : saved;
    recStr = recData.text || recStr;
    f.workersAssigned += borrowedWorkers;
  } else if (emptyGateCount > 0 && f) {
    borrowedWorkers = Math.min(minutes, 7); // Fallback cap
    f.workersAssigned += borrowedWorkers;
    recStr = `Borrowed ${borrowedWorkers} workers from an empty gate to mitigate the delay, saving a total of ${saved} mins.`;
  }
  
  if (f) {
    f.delayMinutes -= saved;
    f.savedMinutes += saved;
    totalMinSaved += saved;
    delaysPrevented++;
  }
  
  showAiRecommendation(flightId, saved, recStr);
  updateDOM();
  
  btn.textContent = 'Inject & Analyze →';
  btn.disabled = false;
});

function openFlightModal(flightId) {
  let f = flights.find(x => x.id === flightId);
  if(!f) return;
  document.getElementById('flight-modal-title').textContent = `Flight ${f.id} Detail`;
  
  let t = f.timeElapsed;
  // 8 steps: 45 minutes total (roughly ~5.5 mins per step). We'll use these milestones:
  // Arrival(0), Deboard(5), Baggage Unload(10), Clean(15), Fuel/Catering(20), Baggage Load(25), Boarding(30), Pushback(35)
  let s1 = t >= 0 ? 'active' : '';
  let s2 = t >= 5 ? 'active' : '';
  let s3 = t >= 10 ? 'active' : '';
  let s4 = t >= 15 ? 'active' : '';
  let s5 = t >= 20 ? 'active' : '';
  let s6 = t >= 25 ? 'active' : '';
  let s7 = t >= 30 ? 'active' : '';
  let s8 = t >= 35 ? 'active' : '';
  
  document.getElementById('flight-modal-body').innerHTML = `
    <div style="font-family: var(--font-mono); line-height: 1.6; margin-bottom: 2rem;">
      <p><strong>Destination:</strong> ${f.destination}</p>
      <p><strong>Status:</strong> <span style="text-transform:uppercase;">${f.status}</span></p>
      <p><strong>Priority:</strong> P${f.priority}</p>
      <p><strong>Elapsed Time:</strong> ${f.timeElapsed} mins</p>
      <p><strong>Planned Duration:</strong> ${f.plannedDuration} mins</p>
      <p><strong>Delay:</strong> <span style="color:${f.delayMinutes > 0 ? 'var(--danger)' : 'var(--success)'}">${f.delayMinutes > 0 ? '+' : ''}${f.delayMinutes} mins</span></p>
      <p><strong>Workers Assigned:</strong> ${f.workersAssigned}</p>
      <p><strong>Gate Equipment:</strong> ⛽ 2 Fuel Trucks Allocated</p>
      <p><strong>Gate:</strong> ${f.gate || 'Unassigned'}</p>
    </div>
    
    <h3 style="margin-bottom: 1rem;">8-Step Turnaround Flow</h3>
    <div class="flowchart-container" style="display:flex; justify-content:space-between; align-items:center; gap:0.25rem; background:var(--glass-bg); padding:1rem; border-radius:8px; border:1px solid var(--glass-border); font-size:0.8rem;">
      <div class="flow-step" style="flex:1; text-align:center; padding:0.4rem; border:2px solid ${s1 ? 'var(--success)' : 'var(--text-dim)'}; color:${s1 ? 'var(--success)' : 'var(--text-dim)'}; border-radius:4px; font-weight:bold; background:${s1 ? 'rgba(16,185,129,0.1)' : 'transparent'};">Arrival</div>
      <div style="color:var(--text-dim);">➔</div>
      <div class="flow-step" style="flex:1; text-align:center; padding:0.4rem; border:2px solid ${s2 ? 'var(--success)' : 'var(--text-dim)'}; color:${s2 ? 'var(--success)' : 'var(--text-dim)'}; border-radius:4px; font-weight:bold; background:${s2 ? 'rgba(16,185,129,0.1)' : 'transparent'};">Deboard</div>
      <div style="color:var(--text-dim);">➔</div>
      <div class="flow-step" style="flex:1; text-align:center; padding:0.4rem; border:2px solid ${s3 ? 'var(--success)' : 'var(--text-dim)'}; color:${s3 ? 'var(--success)' : 'var(--text-dim)'}; border-radius:4px; font-weight:bold; background:${s3 ? 'rgba(16,185,129,0.1)' : 'transparent'};">Bag Unload</div>
      <div style="color:var(--text-dim);">➔</div>
      <div class="flow-step" style="flex:1; text-align:center; padding:0.4rem; border:2px solid ${s4 ? 'var(--success)' : 'var(--text-dim)'}; color:${s4 ? 'var(--success)' : 'var(--text-dim)'}; border-radius:4px; font-weight:bold; background:${s4 ? 'rgba(16,185,129,0.1)' : 'transparent'};">Clean</div>
      <div style="color:var(--text-dim);">➔</div>
      <div class="flow-step" style="flex:1; text-align:center; padding:0.4rem; border:2px solid ${s5 ? 'var(--success)' : 'var(--text-dim)'}; color:${s5 ? 'var(--success)' : 'var(--text-dim)'}; border-radius:4px; font-weight:bold; background:${s5 ? 'rgba(16,185,129,0.1)' : 'transparent'};">Fuel/Cater</div>
      <div style="color:var(--text-dim);">➔</div>
      <div class="flow-step" style="flex:1; text-align:center; padding:0.4rem; border:2px solid ${s6 ? 'var(--success)' : 'var(--text-dim)'}; color:${s6 ? 'var(--success)' : 'var(--text-dim)'}; border-radius:4px; font-weight:bold; background:${s6 ? 'rgba(16,185,129,0.1)' : 'transparent'};">Bag Load</div>
      <div style="color:var(--text-dim);">➔</div>
      <div class="flow-step" style="flex:1; text-align:center; padding:0.4rem; border:2px solid ${s7 ? 'var(--success)' : 'var(--text-dim)'}; color:${s7 ? 'var(--success)' : 'var(--text-dim)'}; border-radius:4px; font-weight:bold; background:${s7 ? 'rgba(16,185,129,0.1)' : 'transparent'};">Boarding</div>
      <div style="color:var(--text-dim);">➔</div>
      <div class="flow-step" style="flex:1; text-align:center; padding:0.4rem; border:2px solid ${s8 ? 'var(--success)' : 'var(--text-dim)'}; color:${s8 ? 'var(--success)' : 'var(--text-dim)'}; border-radius:4px; font-weight:bold; background:${s8 ? 'rgba(16,185,129,0.1)' : 'transparent'};">Pushback</div>
    </div>
  `;
  document.getElementById('flight-modal').classList.remove('hidden');
}

document.getElementById('btn-close-flight-modal').addEventListener('click', () => {
  document.getElementById('flight-modal').classList.add('hidden');
});

// Add event listener for generate report
document.addEventListener('DOMContentLoaded', () => {
  let btnGen = document.getElementById('btn-generate-report');
  if(btnGen) {
    btnGen.addEventListener('click', async () => {
      if(!selectedReportFlightId) return;
      let f = completed.find(x => x.id === selectedReportFlightId);
      if(!f) return;
      
      let content = document.getElementById('report-content');
      content.innerHTML = `<div class="loading-pulse">Generating Gemini Report...</div>`;
      btnGen.style.display = 'none';
      
      try {
        const res = await fetch(`${API}/api/generate_report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(f)
        });
        if (!res.ok) throw new Error("Backend error");
        const data = await res.json();
        
        let md = data.report.replace(/\n/g, '<br/>');
        content.innerHTML = `<div style="color:var(--text-bright);">${md}</div>`;
      } catch(e) {
        content.innerHTML = `<span style="color:var(--danger)">Error connecting to backend API. Please make sure the Flask server is running.</span>`;
        btnGen.style.display = 'block';
      }
    });
  }
});

// Light / Dark Mode Toggle
document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
  const btn = document.getElementById('btn-theme-toggle');
  if (document.body.classList.contains('light-mode')) {
    btn.textContent = '☾ Dark Mode';
  } else {
    btn.textContent = '☀ Light Mode';
  }
});

// Init everything
initSim();
showPage('dashboard');
