class InMemoryStorage:
    def __init__(self,capacity):
        self._dic={}
        if not int(capacity)>0:
            raise ValueError ('INVALID')
        else:
            self.max_caps=capacity

    def set(self, key, value):
        if not isinstance(key,str) or not key.strip():
            raise ValueError("invalid input")
        if value is None:
            raise ValueError("invalid input")
        else:
            if key in self._dic:
                self._dic.pop(key)
                self._dic[key]=value
            elif len(self._dic) < self.max_caps:#if not len(self._dic) >= self.max_caps or key in self._dic:
                self._dic[key]=value
            else:
                pop_item=next(iter(self._dic))
                self._dic.pop(pop_item)
                self._dic[key]=value
            return True

    def get(self, key):
        if key in self._dic:
            p=self._dic.pop(key)
            self._dic[key]=p
            return self._dic[key]
        else:
            return None

    def delete(self, key):
        return self._dic.pop(key,None) is not None


storage = InMemoryStorage(-3)

storage.set("A", 100)
storage.set("B", 200)
storage.set("C", 300)

print(len(storage._dic))

storage.set("B", 500)

print(len(storage._dic))
print(vars(storage))