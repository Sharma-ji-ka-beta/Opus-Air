from sqlalchemy.orm import Session
from backend.models.flight import Flight
from backend.models.resource import Resource
from backend.models.alert import Alert
from backend.services.critical_path import bottleneck_task, remaining_minutes, get_critical_path
from backend.services.gemini_service import ask_gemini


def _rule_based(db: Session, flight: Flight) -> dict:
    b = bottleneck_task(flight.tasks)
    cp = get_critical_path(flight.tasks)
    free_crews = db.query(Resource).filter(Resource.resource_type == "crew", Resource.status == "free").all()
    free_equipment = db.query(Resource).filter(Resource.resource_type == "equipment", Resource.status == "free").all()
    action = "Reassign nearest available crew and equipment to bottleneck task."
    if b:
        action = (
            f"Flight {flight.flight_number} {b.name} is {remaining_minutes(b)} min remaining on critical path. "
            f"Assign {free_crews[0].name if free_crews else 'first available crew'} and "
            f"{free_equipment[0].name if free_equipment else 'first available equipment'}."
        )
    return {
        "summary": action,
        "root_cause": f"Bottleneck task: {b.name if b else 'unknown'}",
        "cascade_impact": f"Critical path remaining {cp['remaining_minutes']} min",
        "optimization_suggestions": "Prioritize bottleneck task, then release blocked downstream tasks.",
        "confidence_level": "Medium",
        "mode": "rule",
    }


def latest_recommendation(db: Session) -> dict:
    alert = db.query(Alert).filter(Alert.resolved.is_(False)).order_by(Alert.created_at.desc()).first()
    if not alert or not alert.flight_id:
        return {
            "summary": "System stable. No intervention needed.",
            "root_cause": "No unresolved critical alerts.",
            "cascade_impact": "None",
            "optimization_suggestions": "Continue monitoring turnarounds.",
            "confidence_level": "High",
            "mode": "rule",
        }
    flight = db.query(Flight).get(alert.flight_id)
    rule = _rule_based(db, flight)
    prompt = (
        f"Flight {flight.flight_number}, alert {alert.alert_type}. "
        f"Return format: Summary, Root Cause, Cascade Impact, Optimization Suggestions, Confidence Level."
    )
    ai = ask_gemini(prompt)
    if not ai:
        return rule
    return {
        "summary": ai,
        "root_cause": rule["root_cause"],
        "cascade_impact": rule["cascade_impact"],
        "optimization_suggestions": rule["optimization_suggestions"],
        "confidence_level": "Medium",
        "mode": "gemini",
    }
