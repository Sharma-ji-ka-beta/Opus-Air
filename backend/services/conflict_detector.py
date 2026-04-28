from datetime import timedelta
from sqlalchemy.orm import Session
from backend.models.flight import Flight


def detect_gate_conflicts(db: Session) -> list[dict]:
    flights = (
        db.query(Flight)
        .filter(Flight.removed.is_(False), Flight.lifecycle != "DEPARTED")
        .order_by(Flight.gate, Flight.base_scheduled_departure)
        .all()
    )
    conflicts: list[dict] = []
    by_gate: dict[str, list[Flight]] = {}
    for f in flights:
        by_gate.setdefault(f.gate, []).append(f)
    for gate, gate_flights in by_gate.items():
        for i in range(len(gate_flights) - 1):
            a = gate_flights[i]
            b = gate_flights[i + 1]
            if b.base_scheduled_departure < a.base_scheduled_departure + timedelta(minutes=60):
                conflicts.append({"gate": gate, "flight_a_id": a.id, "flight_b_id": b.id})
    return conflicts
