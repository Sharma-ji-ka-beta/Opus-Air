from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.models.base import Base


class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    event_type = Column(String, nullable=False, index=True)
    flight_id = Column(Integer, ForeignKey("flights.id"), nullable=True, index=True)
    metadata_json = Column(Text, nullable=False, default="{}")

    flight = relationship("Flight", back_populates="logs")
