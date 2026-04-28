import json
from datetime import datetime
from flask import Blueprint, jsonify, request
from backend.models import SessionLocal, Log, Setting

logs_bp = Blueprint("logs_bp", __name__)


@logs_bp.get("/api/logs")
def logs():
    date_raw = request.args.get("date")
    db = SessionLocal()
    try:
        q = db.query(Log)
        if date_raw:
            d = datetime.strptime(date_raw, "%Y-%m-%d")
            q = q.filter(Log.timestamp >= d, Log.timestamp < d.replace(hour=23, minute=59, second=59))
        rows = q.order_by(Log.timestamp.desc()).limit(200).all()
        return jsonify(
            [
                {"timestamp": r.timestamp.isoformat(), "event_type": r.event_type, "flight_id": r.flight_id, "metadata": r.metadata_json}
                for r in rows
            ]
        )
    finally:
        db.close()


@logs_bp.get("/api/events")
def events():
    db = SessionLocal()
    try:
        rows = db.query(Log).order_by(Log.timestamp.desc()).limit(50).all()
        return jsonify(
            [
                {"timestamp": r.timestamp.isoformat(), "event_type": r.event_type, "flight_id": r.flight_id, "metadata": r.metadata_json}
                for r in rows
            ]
        )
    finally:
        db.close()


@logs_bp.post("/api/settings")
def settings():
    db = SessionLocal()
    payload = request.get_json(force=True)
    try:
        row = db.query(Setting).filter(Setting.key == "global").first()
        if not row:
            row = Setting(key="global", value_json=json.dumps(payload))
            db.add(row)
        else:
            row.value_json = json.dumps(payload)
        db.add(Log(event_type="Settings Updated", metadata_json=json.dumps(payload)))
        db.commit()
        return jsonify({"status": "saved", "settings": payload})
    finally:
        db.close()
