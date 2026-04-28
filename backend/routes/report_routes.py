from flask import Blueprint, jsonify
from backend.models import SessionLocal, Flight
from backend.services.report_engine import build_flight_report
from backend.services.recommendation_engine import latest_recommendation

report_bp = Blueprint("report_bp", __name__)


@report_bp.get("/api/report/<int:flight_id>")
def report(flight_id: int):
    db = SessionLocal()
    try:
        flight = db.query(Flight).get(flight_id)
        if not flight:
            return jsonify({"error": "not found"}), 404
        payload = build_flight_report(flight)
        payload["ai_analysis"] = latest_recommendation(db)
        return jsonify(payload)
    finally:
        db.close()
