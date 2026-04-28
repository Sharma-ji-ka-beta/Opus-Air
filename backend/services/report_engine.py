from backend.services.critical_path import get_critical_path, bottleneck_task


def build_flight_report(flight) -> dict:
    cp = get_critical_path(flight.tasks)
    bottleneck = bottleneck_task(flight.tasks)
    timeline = []
    for task in sorted(flight.tasks, key=lambda t: t.sequence_order):
        timeline.append(
            {
                "task": task.name,
                "planned_min": task.planned_duration_min,
                "actual_min": (task.elapsed_seconds // 60) + task.delay_minutes,
                "status": task.status,
                "delay_min": task.delay_minutes,
            }
        )
    total_turnaround = sum(item["actual_min"] for item in timeline)
    return {
        "system_data": {
            "task_timeline": timeline,
            "bottleneck_task": bottleneck.name if bottleneck else None,
            "delay_points": [t["task"] for t in timeline if t["delay_min"] > 0],
            "total_turnaround_time": total_turnaround,
            "critical_path": cp,
        }
    }
