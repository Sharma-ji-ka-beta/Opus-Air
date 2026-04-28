from flask import Blueprint, jsonify, request
from backend.models import SessionLocal, Flight, Task
from backend.services.delay_engine import inject_delay
from backend.services.simulation_engine import serialize_flight
from backend.services.recommendation_engine import latest_recommendation

delay_bp = Blueprint("delay_bp", __name__)


@delay_bp.post("/api/delay")
def delay():
    db = SessionLocal()
    data = request.get_json(force=True)
    try:
        flight = db.query(Flight).get(data["flight_id"])
        task = db.query(Task).get(data["task_id"])
        if not flight or not task:
            return jsonify({"error": "flight/task not found"}), 404
        impact = inject_delay(db, flight, task, int(data.get("delay_minutes", 0)), data.get("reason", "Other"))
        db.commit()
        db.refresh(flight)
        return jsonify(
            {
                "updated_flight": serialize_flight(flight),
                "impact_summary": impact,
                "recommendation": latest_recommendation(db),
            }
        )
    finally:
        db.close()
