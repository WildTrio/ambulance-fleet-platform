# Patch Django BaseContext.__copy__ for Python 3.14 compatibility
try:
    from django.template.context import BaseContext
    
    def patch_copy(self):
        cls = self.__class__
        duplicate = cls.__new__(cls)
        duplicate.__dict__.update(self.__dict__)
        duplicate.dicts = self.dicts[:]
        return duplicate

    BaseContext.__copy__ = patch_copy
except ImportError:
    pass
