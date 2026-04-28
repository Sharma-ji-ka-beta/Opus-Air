from backend.models.task import Task


TASK_DEPENDENCIES = {
    "Deboarding": [],
    "Cleaning": ["Deboarding"],
    "Catering": ["Cleaning"],
    "Fueling": ["Cleaning"],
    "Boarding": ["Catering", "Fueling"],
}


def remaining_minutes(task: Task) -> int:
    spent = task.elapsed_seconds // 60
    total = task.planned_duration_min + task.delay_minutes
    return max(0, total - spent)


def get_critical_path(tasks: list[Task]) -> dict:
    task_by_name = {t.name: t for t in tasks}
    chain = ["Deboarding", "Cleaning", "Fueling", "Boarding"]
    chain_alt = ["Deboarding", "Cleaning", "Catering", "Boarding"]
    dur_a = sum(remaining_minutes(task_by_name[n]) for n in chain if n in task_by_name)
    dur_b = sum(remaining_minutes(task_by_name[n]) for n in chain_alt if n in task_by_name)
    if dur_a >= dur_b:
        return {"path": chain, "remaining_minutes": dur_a}
    return {"path": chain_alt, "remaining_minutes": dur_b}


def bottleneck_task(tasks: list[Task]) -> Task | None:
    if not tasks:
        return None
    active = [t for t in tasks if t.status in {"pending", "in_progress", "blocked"}]
    if not active:
        return None
    return sorted(active, key=remaining_minutes, reverse=True)[0]
