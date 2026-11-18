from flask import Blueprint
from flask import jsonify
from flask import request

from flask import current_app

cache_bp=Blueprint("cache",__name__,url_prefix="/cache")

@cache_bp.get("/health")
def healthchk():
    return jsonify({"status":"healthy","service":"cacheforge"}),200


@cache_bp.post("/")
def posting():
    data=request.get_json()
    key=data.get("key")
    value=data.get("value")
    entry=current_app.extensions["cache_engine"]
    entry.set(key,value)
    return jsonify({"status":"success","message":"key and value are stored"}),200



@cache_bp.get("/<key>")
def getting(key):
     #data=request.get_json()
     #key=data.get('key')
     #value=entry.get("value")
     entry=current_app.extensions["cache_engine"]
     value=entry.get(key)
     #entry.get(key,value)
     return jsonify({"key": key, "value": value}), 200
