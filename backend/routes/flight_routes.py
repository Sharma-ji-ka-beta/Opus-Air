from datetime import datetime
from flask import Blueprint, jsonify, request
from backend.models import SessionLocal, Flight, Task, Alert, Resource, Log
from backend.services.simulation_engine import serialize_flight
from backend.services.critical_path import get_critical_path

flight_bp = Blueprint("flight_bp", __name__)


@flight_bp.get("/api/flights")
def flights():
    db = SessionLocal()
    try:
        rows = db.query(Flight).filter(Flight.removed.is_(False)).all()
        return jsonify([serialize_flight(f) for f in rows])
    finally:
        db.close()


@flight_bp.post("/api/intervention/manual")
def manual_intervention():
    db = SessionLocal()
    payload = request.get_json(force=True)
    try:
        flight = db.query(Flight).get(payload["flight_id"])
        task = db.query(Task).get(payload["task_id"])
        if not flight or not task:
            return jsonify({"error": "flight/task not found"}), 404
        if payload.get("new_crew"):
            task.assigned_crew = payload["new_crew"]
            crew = db.query(Resource).filter(Resource.name == payload["new_crew"]).first()
            if crew:
                crew.status = "assigned"
                crew.assigned_flight_id = flight.id
                crew.assigned_task_id = task.id
        if payload.get("new_gate"):
            flight.gate = payload["new_gate"]
            task.assigned_gate = payload["new_gate"]
        if payload.get("new_equipment"):
            task.assigned_equipment = payload["new_equipment"]
        task.delay_minutes = max(0, task.delay_minutes - 5)
        if task.status == "blocked":
            task.status = "pending"
        cp = get_critical_path(flight.tasks)
        if cp["remaining_minutes"] < 15:
            for a in db.query(Alert).filter(Alert.flight_id == flight.id, Alert.resolved.is_(False)).all():
                a.resolved = True
                a.resolved_at = datetime.utcnow()
            flight.severity = "on_time"
        db.add(
            Log(
                event_type="Manual Intervention",
                flight_id=flight.id,
                metadata_json=f'{{"task":"{task.name}","at":"{datetime.utcnow().isoformat()}"}}',
            )
        )
        db.commit()
        db.refresh(flight)
        return jsonify(serialize_flight(flight))
    finally:
        db.close()
