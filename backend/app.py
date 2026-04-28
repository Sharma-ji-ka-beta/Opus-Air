from flask import Flask, jsonify
from flask_cors import CORS
from backend.config import config
from backend.db.seed_data import seed_if_empty
from backend.services.simulation_engine import start_background_simulation
from backend.routes.dashboard_routes import dashboard_bp
from backend.routes.flight_routes import flight_bp
from backend.routes.delay_routes import delay_bp
from backend.routes.recommendation_routes import recommendation_bp
from backend.routes.report_routes import report_bp
from backend.routes.logs_routes import logs_bp


def create_app():
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(flight_bp)
    app.register_blueprint(delay_bp)
    app.register_blueprint(recommendation_bp)
    app.register_blueprint(report_bp)
    app.register_blueprint(logs_bp)

    @app.post("/api/inject_delay")
    def inject_delay_api():
        from flask import request, jsonify
        data = request.get_json(force=True)
        flight_id = data.get("flight_id", "Unknown")
        task = data.get("task", "task")
        minutes = data.get("minutes", 0)
        
        from backend.services.gemini_service import ask_gemini
        import json
        import re

        prompt = (
            f"Flight {flight_id} is facing a {minutes}-minute delay in {task}. "
            "You are an AI Turnaround Coordinator. Assess how many ground workers to borrow from an idle gate (0 to 7 maximum). "
            "If the task requires equipment more than workers (e.g., Fueling mostly needs a truck), output 0 or 1 worker. "
            f"Also assess how many minutes realistically could be saved (up to a significant portion of the {minutes} min delay). "
            "Provide your response EXACTLY as valid JSON in this format: "
            '{"borrowedWorkers": <number>, "minutesSaved": <calculated_number>, "recommendation": "Deploying X workers to..."}'
        )
        ai_text = ask_gemini(prompt)
        
        result = {
            "borrowedWorkers": min(minutes, 7),
            "minutesSaved": max(min(minutes, int(minutes * 0.7)), 1),
            "text": "Auto-reallocated idle workers to expedite turnaround."
        }
        
        if ai_text:
            try:
                clean_text = re.sub(r'```json\s*', '', ai_text)
                clean_text = re.sub(r'```', '', clean_text).strip()
                parsed = json.loads(clean_text)
                if "borrowedWorkers" in parsed: result["borrowedWorkers"] = min(7, max(0, int(parsed["borrowedWorkers"])))
                if "minutesSaved" in parsed: result["minutesSaved"] = int(parsed["minutesSaved"])
                if "recommendation" in parsed: result["text"] = f"Gemini Intervention: {parsed['recommendation']}"
            except Exception:
                result["text"] = f"Gemini Intervention: {ai_text}"
                
        return jsonify({"recommendation": result})

    @app.post("/api/generate_report")
    def generate_report_api():
        from flask import request, jsonify
        data = request.get_json(force=True)
        flight_id = data.get("id", "Unknown")
        destination = data.get("destination", "Unknown")
        planned = data.get("plannedDuration", 0)
        actual = data.get("actualDuration", 0)
        delay = data.get("delayMinutes", 0)
        saved = data.get("savedMinutes", 0)
        
        from backend.services.gemini_service import ask_gemini
        prompt = (
            f"Write a comprehensive and professional airport turnaround post-operation report for Flight {flight_id} to {destination}. "
            f"Planned duration was {planned}m, but it took {actual}m due to {delay}m of delays. "
            f"Crucially, our AI system successfully reallocated idle ground workers across gates to save {saved}m, preventing a massive cascading delay. "
            f"Please describe in detail how this intelligent worker reallocation stabilized the turnaround. "
            f"Summarize the final performance, provide a structured breakdown, and suggest 1 specific operational area of improvement. "
            f"Use markdown for better readability."
        )
        ai_text = ask_gemini(prompt)
        if not ai_text:
            ai_text = f"**Flight {flight_id} Turnaround Report**\n\nThe turnaround to {destination} completed in {actual}m (Planned: {planned}m). The operation faced {delay}m of delays, but intelligent cross-gate worker reallocation successfully recovered {saved}m.\n\n*Recommendation:* Continue monitoring gate resources to prevent future bottlenecks."
            
        return jsonify({"report": ai_text})

    @app.get("/api/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "simulation_tick_seconds": config.simulation_tick_seconds,
                "frontend_poll_seconds": config.frontend_poll_seconds,
                "gemini_enabled": bool(config.gemini_api_key),
            }
        )

    return app


app = create_app()
seed_if_empty()
start_background_simulation()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=True)
