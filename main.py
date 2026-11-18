from flask import Flask
from api.routes import cache_bp
from src.config import Config
from src.core import CacheEngine
app=Flask(__name__)

app.config.from_object(Config)
app.register_blueprint(cache_bp)
cache_engine = CacheEngine(app.config["CACHE_CAPACITY"])
app.extensions["cache_engine"] = cache_engine

if __name__ == "__main__":
    app.run(debug=True, port=8000)