const INITIAL_FLIGHTS = [
  { id: 'OA101', destination: 'Dubai', baseDuration: 60, workerRequirement: 12, priority: 1 },
  { id: 'OA204', destination: 'Singapore', baseDuration: 45, workerRequirement: 8, priority: 2 },
  { id: 'OA315', destination: 'London', baseDuration: 90, workerRequirement: 15, priority: 1 },
  { id: 'OA422', destination: 'Tokyo', baseDuration: 55, workerRequirement: 10, priority: 2 },
  { id: 'OA505', destination: 'Paris', baseDuration: 60, workerRequirement: 12, priority: 3 },
  { id: 'OA610', destination: 'New York', baseDuration: 75, workerRequirement: 14, priority: 1 },
  { id: 'OA777', destination: 'Frankfurt', baseDuration: 50, workerRequirement: 10, priority: 2 },
  { id: 'OA888', destination: 'Sydney', baseDuration: 100, workerRequirement: 18, priority: 1 },
  { id: 'OA999', destination: 'Mumbai', baseDuration: 40, workerRequirement: 8, priority: 3 }
];

const GATES_LIST = ['A1', 'A2', 'A3', 'A4', 'A5'];
const MAX_WORKERS = 60;
const TICK_MS = 2000;
const SIM_MINS_PER_TICK = 5;

let runCounter = 1;
let flights = [];
let gates = [];
let queue = []; // array of flight IDs in queue
let completed = [];
let delayFeed = [];
let totalMinSaved = 0;
let delaysPrevented = 0;
let onTimeHistory = [];
let tickInterval = null;

// random event config
const DELAY_EVENTS = [
  { name: 'Baggage Delay', mins: 8, prob: 0.12 },
  { name: 'Fuel Truck Queue', mins: 12, prob: 0.10 },
  { name: 'Late Crew', mins: 15, prob: 0.08 },
  { name: 'Weather Hold', mins: 20, prob: 0.08 },
  { name: 'Catering Late', mins: 7, prob: 0.12 },
  { name: 'Gate Equipment', mins: 10, prob: 0.10 }
];

function initSim() {
  flights = INITIAL_FLIGHTS.map(f => ({
    ...f,
    status: 'waiting', // waiting, active, ready, queue, completed
    gate: null,
    timeElapsed: 0,
    delayMinutes: 0,
    workersAssigned: 0,
    plannedDuration: f.baseDuration,
    savedMinutes: 0,
    queueCountdown: 0
  }));
  gates = GATES_LIST.map(id => ({ id, flightId: null }));
  queue = [];
  completed = [];
  delayFeed = [];
  totalMinSaved = 0;
  delaysPrevented = 0;
  
  document.getElementById('run-counter').textContent = `Run #${runCounter}`;
  document.getElementById('flights-list').innerHTML = '';
  document.getElementById('completed-flights-tbody').innerHTML = '';
  
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(tick, TICK_MS);
  
  updateDOM();
}

function tick() {
  // 1. Check for completed run
  if (completed.length === INITIAL_FLIGHTS.length) {
    clearInterval(tickInterval);
    setTimeout(() => {
      runCounter++;
      initSim();
    }, 5000);
    return;
  }

  // 2. Queue & Departures logic
  // If slot 1 is occupied, it departs
  if (queue.length > 0) {
    let departingFlightId = queue[0];
    let f = flights.find(x => x.id === departingFlightId);
    if (f.queueCountdown <= 0) {
      // depart!
      queue.shift();
      f.status = 'completed';
      f.actualDuration = f.timeElapsed + f.delayMinutes;
      completed.push(f);
      
      // record on-time
      let isOntime = f.actualDuration <= f.plannedDuration + 5;
      onTimeHistory.push(isOntime);
      if (onTimeHistory.length > 10) onTimeHistory.shift();
      
      // free gate & workers
      let gate = gates.find(g => g.flightId === f.id);
      if (gate) gate.flightId = null;
      f.workersAssigned = 0;
      
      logEvent(f.id, 'Departed', 'good', 0);
      
      // pull next ready into queue if available
      fillQueue();
      triggerDepartAnim(departingFlightId);
    } else {
      f.queueCountdown -= SIM_MINS_PER_TICK;
    }
  }

  // 3. Process active flights & random events
  flights.filter(f => f.status === 'active').forEach(f => {
    // events
    DELAY_EVENTS.forEach(ev => {
      if (Math.random() < ev.prob) { // prob per tick! maybe too high, let's scale it. The prompt says 8-12% chance.
         // Let's interpret it as 10% chance per TICK per flight for any event, then pick one.
      }
    });
  });
  
  // Actually let's just do a single roll for delay per flight to avoid excessive delays.
  flights.filter(f => f.status === 'active').forEach(f => {
    if (Math.random() < 0.10) {
       let ev = DELAY_EVENTS[Math.floor(Math.random() * DELAY_EVENTS.length)];
       f.delayMinutes += ev.mins;
       logEvent(f.id, ev.name, 'bad', ev.mins);
    }
    
    f.timeElapsed += SIM_MINS_PER_TICK;
    
    // Check if ready
    if (f.timeElapsed >= f.plannedDuration + f.delayMinutes) {
      f.status = 'ready';
      logEvent(f.id, 'Turnaround Complete', 'good', 0);
      fillQueue();
    }
  });

  // 4. Optimization Engine
  let usedWorkers = flights.reduce((sum, f) => sum + f.workersAssigned, 0);
  let freeWorkers = MAX_WORKERS - usedWorkers;
  
  let activeDelayed = flights.filter(f => f.status === 'active' && f.delayMinutes > 0);
  if (activeDelayed.length > 0 && freeWorkers > 0) {
    activeDelayed.forEach(f => {
      if (freeWorkers >= 2 && f.delayMinutes > 0) {
        // assign 2 workers to save 5 mins
        f.workersAssigned += 2;
        freeWorkers -= 2;
        f.delayMinutes = Math.max(0, f.delayMinutes - 5);
        f.savedMinutes += 5;
        totalMinSaved += 5;
        delaysPrevented++;
        showAiRecommendation(f.id, 5);
      }
    });
  }

  // 5. Gate assignment for waiting flights
  let waiting = flights.filter(f => f.status === 'waiting').sort((a,b) => a.priority - b.priority);
  waiting.forEach(f => {
    let emptyGate = gates.find(g => g.flightId === null);
    if (emptyGate) {
      usedWorkers = flights.reduce((sum, f) => sum + f.workersAssigned, 0);
      freeWorkers = MAX_WORKERS - usedWorkers;
      
      if (freeWorkers >= f.workerRequirement) {
        f.status = 'active';
        f.gate = emptyGate.id;
        emptyGate.flightId = f.id;
        f.workersAssigned = f.workerRequirement;
        logEvent(f.id, `Assigned to Gate ${f.gate}`, 'good', 0);
      } else {
        // insufficient workers
        if (!f.crewDelayed) {
          f.crewDelayed = true;
          logEvent(f.id, 'Delayed - Insufficient Crew', 'bad', 0);
        }
      }
    }
  });

  updateDOM();
}

function fillQueue() {
  while (queue.length < 3) {
    let readyFlight = flights.find(f => f.status === 'ready' && !queue.includes(f.id));
    if (!readyFlight) break;
    readyFlight.status = 'queue';
    readyFlight.queueCountdown = 10; // 10 mins in queue before departure
    queue.push(readyFlight.id);
  }
}

// ... DOM updates ...
