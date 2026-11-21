import threading
import time
class InMemoryStorage:
    def __init__(self,capacity):
        self._dic={}
        self._lock=threading.Lock()
        if not (isinstance(capacity,int) and not isinstance(capacity,bool) and capacity>0):
            raise ValueError ('INVALID')
        else:
            self.max_caps=capacity

    def set(self, key, value,ttl=None):
        with self._lock:
            expire_at=time.time()+ttl if ttl is not None else None
            if not isinstance(key,str) or not key.strip():
                raise ValueError("invalid input")
            if value is None:
                raise ValueError("invalid input")
            else:
                if key in self._dic:
                    self._dic.pop(key)
                    self._dic[key]={
                        "value":value,
                        "expire_at":expire_at

                    }
                elif len(self._dic) < self.max_caps:#if not len(self._dic) >= self.max_caps or key in self._dic:
                    #self._dic[key]=value
                     self._dic[key]={
                        "value":value,
                        "expire_at":expire_at

                    }
                else:
                    pop_item=next(iter(self._dic))
                    self._dic.pop(pop_item)
                    #self._dic[key]=value
                    self._dic[key]={
                        "value":value,
                        "expire_at":expire_at

                    }
                return True

    def get(self, key):
        with self._lock:
            if key in self._dic:
                p=self._dic.pop(key)
                if p["expire_at"] is None:
                    self._dic[key]=p
                    return self._dic[key]["value"]

                elif p["expire_at"]>time.time():
                    self._dic[key]=p
                    return self._dic[key]["value"]
            else:   
                return None

    def delete(self, key):
        with self._lock:
            return self._dic.pop(key,None) is not None


#storage = InMemoryStorage(89)

# storage.set("A", 100)
# storage.set("B", 200)
# storage.set("C", 300)

# print(len(storage._dic))

# storage.set("B", 500)

# print(len(storage._dic))
#print(vars(storage))