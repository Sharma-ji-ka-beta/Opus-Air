"""
Opus Air - Hackathon Backend
In-memory simulation, no database required.
"""

import os
import threading
import time
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS

# Load .env file if present (so GEMINI_API_KEY just works)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, fall back to real env vars

# ──────────────────────────────────────────────────────────
# GEMINI (optional, silent fallback)
# ──────────────────────────────────────────────────────────
try:
    from google import genai as _genai
    _GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
    if _GEMINI_KEY:
        _genai_client = _genai.Client(api_key=_GEMINI_KEY)
    else:
        _genai_client = None
except Exception:
    _genai_client = None


def _enhance_with_gemini(rule_rec: str) -> str:
    """Try to enhance recommendation text with Gemini. Falls back silently."""
    if not _genai_client:
        return rule_rec
    try:
        prompt = (
            "You are an expert airport operations AI assistant. "
            "Enhance the following operational recommendation with:\n"
            "1. Root cause (1 sentence)\n"
            "2. Cascade impact if unresolved (1 sentence)\n"
            "3. Confidence level (High/Medium/Low)\n"
            "Keep it under 80 words. Be direct and professional.\n\n"
            f"Recommendation: {rule_rec}"
        )
        resp = _genai_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        return resp.text.strip()
    except Exception:
        return rule_rec


# ──────────────────────────────────────────────────────────
# STATE — pure in-memory dicts
# ──────────────────────────────────────────────────────────

def _hhmm(base: str, delta_minutes: int) -> str:
    """Add delta_minutes to an HH:MM string, return HH:MM."""
    t = datetime.strptime(base, "%H:%M") + timedelta(minutes=delta_minutes)
    return t.strftime("%H:%M")


FLIGHTS = {
    "OA101": {
        "id": "OA101",
        "destination": "Dubai",
        "gate": "A3",
        "status": "Turnaround",
        "scheduled_dep": "14:30",
        "estimated_dep": "14:30",
        "delay_minutes": 0,
        "tasks": [
            {"name": "Deboarding",  "duration": 10, "progress": 10, "status": "complete",     "is_critical": True},
            {"name": "Cleaning",    "duration": 15, "progress": 15, "status": "complete",     "is_critical": True},
            {"name": "Fueling",     "duration": 25, "progress": 12, "status": "in_progress",  "is_critical": True},
            {"name": "Catering",    "duration": 20, "progress": 15, "status": "in_progress",  "is_critical": False},
            {"name": "Boarding",    "duration": 30, "progress": 0,  "status": "pending",      "is_critical": True},
        ],
        "delays": [],
    },
    "OA204": {
        "id": "OA204",
        "destination": "Singapore",
        "gate": "B1",
        "status": "Turnaround",
        "scheduled_dep": "15:00",
        "estimated_dep": "15:00",
        "delay_minutes": 0,
        "tasks": [
            {"name": "Deboarding",  "duration": 10, "progress": 10, "status": "complete",     "is_critical": True},
            {"name": "Cleaning",    "duration": 15, "progress": 10, "status": "in_progress",  "is_critical": True},
            {"name": "Fueling",     "duration": 25, "progress": 0,  "status": "pending",      "is_critical": True},
            {"name": "Catering",    "duration": 20, "progress": 0,  "status": "pending",      "is_critical": False},
            {"name": "Boarding",    "duration": 30, "progress": 0,  "status": "pending",      "is_critical": True},
        ],
        "delays": [],
    },
    "OA315": {
        "id": "OA315",
        "destination": "London",
        "gate": "C7",
        "status": "Turnaround",
        "scheduled_dep": "15:45",
        "estimated_dep": "15:45",
        "delay_minutes": 0,
        "tasks": [
            {"name": "Deboarding",  "duration": 10, "progress": 5,  "status": "in_progress",  "is_critical": True},
            {"name": "Cleaning",    "duration": 15, "progress": 0,  "status": "pending",      "is_critical": True},
            {"name": "Fueling",     "duration": 25, "progress": 0,  "status": "pending",      "is_critical": True},
            {"name": "Catering",    "duration": 20, "progress": 0,  "status": "pending",      "is_critical": False},
            {"name": "Boarding",    "duration": 30, "progress": 0,  "status": "pending",      "is_critical": True},
        ],
        "delays": [],
    },
}

RESOURCES = {
    "Fuel Truck 1": {"assigned_to": "OA101", "status": "busy",      "available_at": "14:25"},
    "Fuel Truck 2": {"assigned_to": "OA204", "status": "available", "available_at": "14:18"},
    "Catering Van":  {"assigned_to": "OA101", "status": "busy",      "available_at": "14:40"},
    "Ground Crew A": {"assigned_to": "OA315", "status": "busy",      "available_at": "15:30"},
}

STATS = {
    "time_saved_today": 0,
    "delays_prevented": 0,
    "on_time_history": [95, 92, 88, 91, 94],
    "time_labels": ["11:00", "12:00", "13:00", "13:30", "14:00"],
}

EVENT_LOG = []  # list of {ts, message, level}

_lock = threading.Lock()


def _log(msg: str, level: str = "info"):
    EVENT_LOG.append({
        "ts": datetime.now().strftime("%H:%M:%S"),
        "message": msg,
        "level": level,
    })
    if len(EVENT_LOG) > 100:
        EVENT_LOG.pop(0)


# ──────────────────────────────────────────────────────────
# RECOMMENDATION ENGINE
# ──────────────────────────────────────────────────────────

def _generate_recommendation(flight_id: str, task_name: str, minutes: int) -> dict:
    flight = FLIGHTS[flight_id]
    total_delay = flight["delay_minutes"]

    # Find a free resource
    free_resource = None
    for rname, rdata in RESOURCES.items():
        if rdata["assigned_to"] != flight_id and rdata["status"] == "available":
            free_resource = rname
            break

    if free_resource and "Fuel" in task_name and total_delay <= 30:
        saved = max(5, minutes - 6)
        rule_text = (
            f"REASSIGN {free_resource} from Gate {RESOURCES[free_resource].get('gate','–')} "
            f"to {flight_id} at Gate {flight['gate']}. "
            f"Estimated departure improvement: +{saved} minutes."
        )
        rec = {
            "id": f"rec_{flight_id}_{int(time.time())}",
            "flight_id": flight_id,
            "task": task_name,
            "type": "resource_reassignment",
            "resource": free_resource,
            "minutes_saved": saved,
            "text": rule_text,
            "confidence": "High",
        }
    elif total_delay > 30:
        rule_text = (
            f"ALERT: {flight_id} has accumulated {total_delay} min delay. "
            f"Recommend gate reassignment or ATC slot renegotiation."
        )
        rec = {
            "id": f"rec_{flight_id}_{int(time.time())}",
            "flight_id": flight_id,
            "task": task_name,
            "type": "escalation",
            "resource": None,
            "minutes_saved": 0,
            "text": rule_text,
            "confidence": "Medium",
        }
    else:
        saved = max(3, minutes // 3)
        rule_text = (
            f"EXPEDITE {task_name} for {flight_id}: deploy additional ground crew. "
            f"Estimated time saving: +{saved} minutes."
        )
        rec = {
            "id": f"rec_{flight_id}_{int(time.time())}",
            "flight_id": flight_id,
            "task": task_name,
            "type": "expedite",
            "resource": "Ground Crew A",
            "minutes_saved": saved,
            "text": rule_text,
            "confidence": "Medium",
        }

    # Enhance with Gemini
    rec["text"] = _enhance_with_gemini(rec["text"])
    return rec


# ──────────────────────────────────────────────────────────
# SIMULATION TICK
# ──────────────────────────────────────────────────────────

def _tick():
    """Advance simulation: 2 real seconds = ~5 airport minutes."""
    while True:
        time.sleep(2)
        with _lock:
            for flight in FLIGHTS.values():
                tasks = flight["tasks"]
                for i, task in enumerate(tasks):
                    if task["status"] == "in_progress":
                        task["progress"] += 1
                        if task["progress"] >= task["duration"]:
                            task["progress"] = task["duration"]
                            task["status"] = "complete"
                            _log(f"{flight['id']} — {task['name']} complete", "success")
                            # Start next pending task
                            for j in range(i + 1, len(tasks)):
                                if tasks[j]["status"] == "pending":
                                    tasks[j]["status"] = "in_progress"
                                    _log(f"{flight['id']} — {tasks[j]['name']} started", "info")
                                    break
                        break  # only one in-progress at a time per flight


def start_simulation():
    t = threading.Thread(target=_tick, daemon=True)
    t.start()


# ──────────────────────────────────────────────────────────
# FLASK APP
# ──────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "gemini_enabled": _genai_client is not None,
    })


@app.get("/api/status")
def get_status():
    with _lock:
        critical_alerts = sum(
            1 for f in FLIGHTS.values() if f["delay_minutes"] > 0
        )
        active = len([f for f in FLIGHTS.values() if f["status"] == "Turnaround"])

        # live on-time %
        on_time = max(60, 100 - sum(f["delay_minutes"] for f in FLIGHTS.values()) // 2)
        now_label = datetime.now().strftime("%H:%M")
        if now_label not in STATS["time_labels"]:
            STATS["time_labels"].append(now_label)
            STATS["on_time_history"].append(on_time)
            if len(STATS["time_labels"]) > 12:
                STATS["time_labels"].pop(0)
                STATS["on_time_history"].pop(0)

        return jsonify({
            "flights": FLIGHTS,
            "resources": RESOURCES,
            "stats": {
                "active_turnarounds": active,
                "critical_alerts": critical_alerts,
                "time_saved_today": STATS["time_saved_today"],
                "delays_prevented": STATS["delays_prevented"],
                "on_time_history": STATS["on_time_history"],
                "time_labels": STATS["time_labels"],
            },
            "current_time": datetime.now().strftime("%H:%M:%S"),
        })


@app.post("/api/inject_delay")
def inject_delay():
    data = request.json
    flight_id = data.get("flight_id")
    task_name = data.get("task")
    minutes = int(data.get("minutes", 0))

    if flight_id not in FLIGHTS:
        return jsonify({"error": "Flight not found"}), 404

    with _lock:
        flight = FLIGHTS[flight_id]

        # Record delay
        flight["delays"].append({"task": task_name, "minutes": minutes})
        flight["delay_minutes"] += minutes

        # Push estimated departure
        flight["estimated_dep"] = _hhmm(flight["scheduled_dep"], flight["delay_minutes"])

        # Cascade: mark subsequent tasks as delayed
        found = False
        for task in flight["tasks"]:
            if task["name"] == task_name:
                found = True
            if found and task["status"] == "pending":
                task["earliest_start_offset"] = task.get("earliest_start_offset", 0) + minutes

        _log(f"Delay injected: {flight_id} +{minutes}m on {task_name}", "warning")

        recommendation = _generate_recommendation(flight_id, task_name, minutes)
        _log(f"Recommendation generated: {recommendation['type']}", "info")

    return jsonify({
        "flight": FLIGHTS[flight_id],
        "recommendation": recommendation,
    })


@app.post("/api/accept_recommendation")
def accept_recommendation():
    rec = request.json

    with _lock:
        flight_id = rec.get("flight_id")
        minutes_saved = int(rec.get("minutes_saved", 0))
        resource = rec.get("resource")

        if flight_id and flight_id in FLIGHTS:
            flight = FLIGHTS[flight_id]
            flight["delay_minutes"] = max(0, flight["delay_minutes"] - minutes_saved)
            flight["estimated_dep"] = _hhmm(flight["scheduled_dep"], flight["delay_minutes"])

        if resource and resource in RESOURCES:
            RESOURCES[resource]["assigned_to"] = flight_id
            RESOURCES[resource]["status"] = "busy"

        STATS["time_saved_today"] += minutes_saved
        STATS["delays_prevented"] += 1

        _log(
            f"Recommendation accepted for {flight_id}: +{minutes_saved}m saved",
            "success",
        )

    return jsonify({
        "success": True,
        "flight": FLIGHTS.get(flight_id),
        "time_saved_today": STATS["time_saved_today"],
    })


@app.get("/api/logs")
def get_logs():
    return jsonify({"logs": EVENT_LOG[-50:]})


@app.post("/api/reset")
def reset_simulation():
    """Reset all flights to initial state (useful for demo resets)."""
    with _lock:
        for fid, flight in FLIGHTS.items():
            flight["delay_minutes"] = 0
            flight["estimated_dep"] = flight["scheduled_dep"]
            flight["delays"] = []
            for task in flight["tasks"]:
                task["progress"] = 0
                task["status"] = "pending"
                task.pop("earliest_start_offset", None)
            # Re-initialize first in-progress tasks
        FLIGHTS["OA101"]["tasks"][0]["status"] = "complete"
        FLIGHTS["OA101"]["tasks"][0]["progress"] = 10
        FLIGHTS["OA101"]["tasks"][1]["status"] = "complete"
        FLIGHTS["OA101"]["tasks"][1]["progress"] = 15
        FLIGHTS["OA101"]["tasks"][2]["status"] = "in_progress"
        FLIGHTS["OA101"]["tasks"][2]["progress"] = 12
        FLIGHTS["OA101"]["tasks"][3]["status"] = "in_progress"
        FLIGHTS["OA101"]["tasks"][3]["progress"] = 15

        FLIGHTS["OA204"]["tasks"][0]["status"] = "complete"
        FLIGHTS["OA204"]["tasks"][0]["progress"] = 10
        FLIGHTS["OA204"]["tasks"][1]["status"] = "in_progress"
        FLIGHTS["OA204"]["tasks"][1]["progress"] = 10

        FLIGHTS["OA315"]["tasks"][0]["status"] = "in_progress"
        FLIGHTS["OA315"]["tasks"][0]["progress"] = 5

        STATS["time_saved_today"] = 0
        STATS["delays_prevented"] = 0

        _log("Simulation reset", "info")

    return jsonify({"success": True})


if __name__ == "__main__":
    start_simulation()
    _log("Opus Air simulation started", "info")
    app.run(host="127.0.0.1", port=5050, debug=False, use_reloader=False)
