import random
import threading
import time
import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from backend.config import config
from backend.models import SessionLocal, Flight, Task, Alert, Log, Resource
from backend.services.critical_path import get_critical_path

ORIGINS = ["DXB", "DOH", "LHR", "FRA", "SIN", "JFK", "CDG", "AMS", "IST"]
GATES = ["A1", "A2", "A3", "A4", "A5"]

TASK_BLUEPRINT = [
    ("Deboarding", 0, "", 10),
    ("Cleaning", 1, "Deboarding", 12),
    ("Catering", 2, "Cleaning", 14),
    ("Fueling", 3, "Cleaning", 16),
    ("Boarding", 4, "Catering,Fueling", 18),
]

_thread_started = False


def serialize_flight(flight: Flight) -> dict:
    cp = get_critical_path(flight.tasks)
    total_delay = cp["remaining_minutes"]
    estimated = flight.base_scheduled_departure + timedelta(minutes=total_delay)
    
    def safe_parse(json_str):
        try:
            return json.loads(json_str)
        except Exception:
            return {}

    return {
        "id": flight.id,
        "flight_number": flight.flight_number,
        "origin": flight.origin,
        "destination": flight.destination,
        "gate": flight.gate,
        "lifecycle": flight.lifecycle,
        "severity": flight.severity,
        "scheduled_departure": flight.base_scheduled_departure.isoformat(),
        "estimated_departure": estimated.isoformat(),
        "delay_log": [
            safe_parse(l.metadata_json)
            for l in flight.logs
            if l.event_type == "Delay Injected"  # internal trusted metadata format
        ],
        "tasks": [
            {
                "id": t.id,
                "name": t.name,
                "status": t.status,
                "planned_duration_min": t.planned_duration_min,
                "actual_duration_min": (t.elapsed_seconds // 60) + t.delay_minutes,
                "delay_minutes": t.delay_minutes,
                "assigned_crew": t.assigned_crew,
                "assigned_equipment": t.assigned_equipment,
                "assigned_gate": t.assigned_gate,
            }
            for t in sorted(flight.tasks, key=lambda x: x.sequence_order)
        ],
        "critical_path": cp,
    }


def _create_flight(db: Session, gate: str | None = None):
    num = random.randint(100, 999)
    flight = Flight(
        flight_number=f"OA{num}",
        origin=random.choice(ORIGINS),
        destination="HUB",
        gate=gate or random.choice(GATES),
        lifecycle="INBOUND",
        base_scheduled_departure=datetime.utcnow() + timedelta(minutes=random.randint(45, 120)),
    )
    db.add(flight)
    db.flush()
    for name, order, deps, dur in TASK_BLUEPRINT:
        db.add(
            Task(
                flight_id=flight.id,
                name=name,
                sequence_order=order,
                dependencies_csv=deps,
                planned_duration_min=dur + random.randint(-2, 2),
                status="pending",
                assigned_crew=f"Crew Team {random.choice(['A', 'B', 'C'])}",
                assigned_equipment=f"Unit-{random.randint(1, 6)}",
                assigned_gate=flight.gate,
            )
        )
    db.add(Log(event_type="Flight Spawned", flight_id=flight.id, metadata_json='{"event":"spawned"}'))


def ensure_active_flights(db: Session):
    active = db.query(Flight).filter(Flight.removed.is_(False)).count()
    while active < config.min_active_flights:
        _create_flight(db)
        active += 1


def _tick_flight(db: Session, flight: Flight):
    for task in sorted(flight.tasks, key=lambda x: x.sequence_order):
        deps = [d.strip() for d in task.dependencies_csv.split(",") if d.strip()]
        deps_done = all(next((t for t in flight.tasks if t.name == d), None).status == "complete" for d in deps) if deps else True
        if task.status in {"pending", "blocked"} and deps_done:
            task.status = "in_progress"
            task.started_at = task.started_at or datetime.utcnow()
        if task.status == "in_progress":
            task.elapsed_seconds += config.simulation_tick_seconds
            target_seconds = (task.planned_duration_min + task.delay_minutes) * 60
            if task.elapsed_seconds >= target_seconds:
                task.status = "complete"
                task.completed_at = datetime.utcnow()

    if all(t.status == "complete" for t in flight.tasks):
        if flight.lifecycle in {"INBOUND", "TURNAROUND"}:
            flight.lifecycle = "READY"
        elif flight.lifecycle == "READY":
            flight.lifecycle = "DEPARTING"
            flight.departing_at = datetime.utcnow()
            _create_flight(db)
            db.add(Log(event_type="Flight Entered Departing", flight_id=flight.id, metadata_json='{"lifecycle":"DEPARTING"}'))
        elif flight.lifecycle == "DEPARTING" and flight.departing_at and datetime.utcnow() - flight.departing_at >= timedelta(seconds=15):
            flight.lifecycle = "DEPARTED"
            flight.departed_at = datetime.utcnow()
            db.add(Log(event_type="Flight Departed", flight_id=flight.id, metadata_json='{"lifecycle":"DEPARTED"}'))
        elif flight.lifecycle == "DEPARTED" and flight.departed_at and datetime.utcnow() - flight.departed_at >= timedelta(seconds=10):
            flight.lifecycle = "REMOVED"
            flight.removed = True
    else:
        flight.lifecycle = "TURNAROUND"


def simulation_tick():
    db = SessionLocal()
    try:
        flights = db.query(Flight).filter(Flight.removed.is_(False)).all()
        for flight in flights:
            _tick_flight(db, flight)
        ensure_active_flights(db)
        db.commit()
    finally:
        db.close()


def _loop():
    while True:
        simulation_tick()
        time.sleep(config.simulation_tick_seconds)


def start_background_simulation():
    global _thread_started
    if _thread_started:
        return
    _thread_started = True
    t = threading.Thread(target=_loop, daemon=True)
    t.start()


def init_resources(db: Session):
    if db.query(Resource).count() > 0:
        return
    crews = ["Crew Team A", "Crew Team B", "Crew Team C", "Crew Team D"]
    equipment = ["Fuel Truck 1", "Fuel Truck 2", "Catering Rig 1", "Pushback Tug 1", "Loader 1", "Loader 2"]
    for c in crews:
        db.add(Resource(resource_type="crew", name=c, status="free"))
    for e in equipment:
        db.add(Resource(resource_type="equipment", name=e, status="free"))
