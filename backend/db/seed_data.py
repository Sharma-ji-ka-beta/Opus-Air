import random
from backend.models import Base, engine, SessionLocal, Flight
from backend.services.simulation_engine import ensure_active_flights, init_resources
from backend.services.delay_engine import inject_delay
from backend.models.task import Task


def seed_if_empty():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        init_resources(db)
        ensure_active_flights(db)
        db.commit()
        flights = db.query(Flight).all()
        for flight in random.sample(flights, k=min(2, len(flights))):
            t = db.query(Task).filter(Task.flight_id == flight.id, Task.name.in_(["Fueling", "Cleaning"])).first()
            if t:
                inject_delay(db, flight, t, random.randint(5, 14), "Crew Missing")
        db.commit()
    finally:
        db.close()
