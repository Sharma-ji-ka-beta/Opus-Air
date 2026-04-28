from datetime import datetime, timedelta
from flask import Blueprint, jsonify
from backend.models import SessionLocal, Flight, Alert, Resource, Log
from backend.services.recommendation_engine import latest_recommendation
from backend.services.simulation_engine import serialize_flight

dashboard_bp = Blueprint("dashboard_bp", __name__)


@dashboard_bp.get("/api/dashboard")
def dashboard():
    db = SessionLocal()
    try:
        flights = db.query(Flight).filter(Flight.removed.is_(False)).all()
        active = [serialize_flight(f) for f in flights]
        alerts = db.query(Alert).filter(Alert.resolved.is_(False)).order_by(Alert.created_at.desc()).all()
        resources = db.query(Resource).all()
        logs = db.query(Log).order_by(Log.timestamp.desc()).limit(20).all()
        today_total = db.query(Flight).count()
        completed = db.query(Flight).filter(Flight.lifecycle.in_(["DEPARTED", "REMOVED"])).count()
        on_time = sum(1 for f in active if f["severity"] == "on_time")
        on_time_pct = 100 if not active else round((on_time / len(active)) * 100, 2)
        return jsonify(
            {
                "total_active_turnarounds": len(active),
                "critical_alerts_count": sum(1 for a in alerts if a.severity == "critical"),
                "flights_needing_action_count": sum(1 for f in active if f["severity"] != "on_time"),
                "active_turnarounds": active,
                "active_alerts": [
                    {
                        "id": a.id,
                        "flight_id": a.flight_id,
                        "alert_type": a.alert_type,
                        "severity": a.severity,
                        "message": a.message,
                    }
                    for a in alerts
                ],
                "latest_recommendation": latest_recommendation(db),
                "resource_availability": [
                    {"id": r.id, "name": r.name, "resource_type": r.resource_type, "status": r.status} for r in resources
                ],
                "today_schedule": [
                    {
                        "flight_number": f["flight_number"],
                        "scheduled_departure": f["scheduled_departure"],
                        "estimated_departure": f["estimated_departure"],
                        "gate": f["gate"],
                    }
                    for f in active
                ],
                "on_time_performance": [
                    {"x": (datetime.utcnow() - timedelta(hours=i)).strftime("%H:%M"), "y": max(0, min(100, on_time_pct - i * 2))}
                    for i in range(7, -1, -1)
                ],
                "shift_summary": {
                    "total_flights_today": today_total,
                    "average_turnaround_time": round(sum(sum(t["actual_duration_min"] for t in f["tasks"]) for f in active) / len(active), 2)
                    if active
                    else 0,
                    "delays_resolved": completed,
                    "sla_compliance_percentage": on_time_pct,
                },
                "events": [
                    {"timestamp": l.timestamp.isoformat(), "event_type": l.event_type, "flight_id": l.flight_id, "metadata": l.metadata_json}
                    for l in logs
                ],
            }
        )
    finally:
        db.close()
