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
    ttl=data.get("ttl")
    entry=current_app.extensions["cache_engine"]
    entry.set(key,value,ttl)
    return jsonify({"status":"success","message":"key and value are stored"}),201



@cache_bp.get("/<key>")
def getting(key):
     #data=request.get_json()
     #key=data.get('key')
     #value=entry.get("value")
     entry=current_app.extensions["cache_engine"]
     value=entry.get(key)
     #entry.get(key,value)
     if value is None:
        return jsonify({"error": f"Key '{key}' not found"}), 404

     return jsonify({"key": key, "value": value}), 200

@cache_bp.delete("/<key>")
def delete(key):
    entry=current_app.extensions["cache_engine"]
    value=entry.delete(key)
    if value is False:
        return jsonify({"error": f"Key '{key}' not found"}), 404
    return jsonify({"message":f" '{key}' deleted sucessfully"}), 200
    
    