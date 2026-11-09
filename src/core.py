from storage import InMemoryStorage
class CacheEngine:

    def __init__(self,capacity):
        self._storage=InMemoryStorage(capacity)
    def set(self,key,value):
        return self._storage.set(key,value)
    def get(self,key):
        return self._storage.get(key)
    def delete(self,key):
        return self._storage.delete(key)
# pu=CacheEngine()
# print(pu.set("fire","ganga"))
# print(pu.get("fire"))
# print(pu.get("water"))
# print(pu.delete("fire"))
# print(pu.delete("fire"))