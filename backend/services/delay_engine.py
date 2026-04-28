from datetime import datetime
from sqlalchemy.orm import Session
from backend.models.task import Task
from backend.models.alert import Alert
from backend.models.log import Log
from backend.models.flight import Flight
from backend.services.critical_path import get_critical_path
from backend.config import config


def _descendants(tasks: list[Task], root_name: str) -> list[Task]:
    mapping = {t.name: t for t in tasks}
    out = []
    for t in tasks:
        deps = [d.strip() for d in t.dependencies_csv.split(",") if d.strip()]
        if root_name in deps:
            out.append(t)
            for child in _descendants(tasks, t.name):
                if child not in out:
                    out.append(child)
    return [mapping[t.name] for t in out if t.name in mapping]


def inject_delay(db: Session, flight: Flight, task: Task, delay_minutes: int, reason: str) -> dict:
    impacted = [task] + _descendants(flight.tasks, task.name)
    for t in impacted:
        t.delay_minutes += delay_minutes
        if t.status == "pending":
            t.status = "blocked"
    cp = get_critical_path(flight.tasks)
    flight.severity = "critical" if cp["remaining_minutes"] >= config.delay_critical_threshold_minutes else "delayed"
    message = f"{flight.flight_number} {task.name} delayed by {delay_minutes} min ({reason})"
    db.add(Alert(flight_id=flight.id, alert_type=reason, severity=flight.severity, message=message))
    db.add(
        Log(
            event_type="Delay Injected",
            flight_id=flight.id,
            metadata_json=f'{{"task":"{task.name}","delay_minutes":{delay_minutes},"reason":"{reason}","at":"{datetime.utcnow().isoformat()}"}}',
        )
    )
    return {"impacted_tasks": [t.name for t in impacted], "critical_path": cp}
