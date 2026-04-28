from datetime import datetime
from flask import Blueprint, jsonify, request
from backend.models import SessionLocal, Alert, Task, Resource, Log, Flight
from backend.services.recommendation_engine import latest_recommendation
from backend.services.simulation_engine import serialize_flight

recommendation_bp = Blueprint("recommendation_bp", __name__)


@recommendation_bp.get("/api/recommendation")
def recommendation():
    db = SessionLocal()
    try:
        return jsonify(latest_recommendation(db))
    finally:
        db.close()


@recommendation_bp.post("/api/recommendation/accept")
def recommendation_accept():
    db = SessionLocal()
    payload = request.get_json(silent=True) or {}
    try:
        alert = db.query(Alert).filter(Alert.resolved.is_(False)).order_by(Alert.created_at.desc()).first()
        if not alert or not alert.flight_id:
            return jsonify({"status": "no-op"})
        flight = db.query(Flight).get(alert.flight_id)
        task = next((t for t in flight.tasks if t.status in {"blocked", "pending", "in_progress"}), None)
        if task:
            free_crew = db.query(Resource).filter(Resource.resource_type == "crew", Resource.status == "free").first()
            if free_crew:
                task.assigned_crew = free_crew.name
                free_crew.status = "assigned"
                free_crew.assigned_flight_id = flight.id
                free_crew.assigned_task_id = task.id
            task.delay_minutes = max(0, task.delay_minutes - 8)
            if task.status == "blocked":
                task.status = "pending"
        alert.resolved = True
        alert.resolved_at = datetime.utcnow()
        flight.severity = "on_time"
        db.add(Log(event_type="Recommendation Accepted", flight_id=flight.id, metadata_json=f'{{"note":"{payload.get("note", "accepted")}"}}'))
        db.commit()
        db.refresh(flight)
        return jsonify({"status": "applied", "flight": serialize_flight(flight)})
    finally:
        db.close()
