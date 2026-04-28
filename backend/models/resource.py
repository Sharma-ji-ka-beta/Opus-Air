from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from backend.models.base import Base


class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True)
    resource_type = Column(String, nullable=False)  # crew|equipment
    name = Column(String, nullable=False, unique=True)
    status = Column(String, nullable=False, default="free")  # free|assigned|unavailable
    assigned_flight_id = Column(Integer, nullable=True)
    assigned_task_id = Column(Integer, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
