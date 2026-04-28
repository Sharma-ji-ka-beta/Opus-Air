from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.models.base import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    flight_id = Column(Integer, ForeignKey("flights.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    sequence_order = Column(Integer, nullable=False)
    dependencies_csv = Column(String, nullable=False, default="")
    status = Column(String, nullable=False, default="pending")
    planned_duration_min = Column(Integer, nullable=False)
    delay_minutes = Column(Integer, nullable=False, default=0)
    elapsed_seconds = Column(Integer, nullable=False, default=0)
    assigned_crew = Column(String, nullable=True)
    assigned_equipment = Column(String, nullable=True)
    assigned_gate = Column(String, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    flight = relationship("Flight", back_populates="tasks")
