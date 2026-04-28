from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from backend.models.base import Base


class Flight(Base):
    __tablename__ = "flights"

    id = Column(Integer, primary_key=True)
    flight_number = Column(String, unique=True, nullable=False, index=True)
    origin = Column(String, nullable=False)
    destination = Column(String, nullable=False, default="HUB")
    gate = Column(String, nullable=False)
    lifecycle = Column(String, nullable=False, default="INBOUND")
    severity = Column(String, nullable=False, default="on_time")
    base_scheduled_departure = Column(DateTime, nullable=False)
    arrived_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    departing_at = Column(DateTime, nullable=True)
    departed_at = Column(DateTime, nullable=True)
    removed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    tasks = relationship("Task", back_populates="flight", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="flight", cascade="all, delete-orphan")
    logs = relationship("Log", back_populates="flight", cascade="all, delete-orphan")
