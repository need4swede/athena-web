# athena/api/__init__.py

import os

class _API_Path:
    def root(self):
        return os.path.dirname(os.path.abspath(__file__))

    def google(self):
        return os.path.join(self.root(), 'google_api')

    def aeries(self):
        return os.path.join(self.root(), 'aeries_api')