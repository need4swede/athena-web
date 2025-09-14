# athena/utils/aeries/reports/operator.py

# Local Imports
from athena.utils import global_operator

class Date(global_operator.Date):
    @classmethod
    def from_filename(cls, file_path):
        date_str = file_path.split("_")[1]
        year = date_str[:4]
        month = date_str[4:6]
        day = date_str[6:]
        return cls(year, month, day)

class Parse(global_operator.Parse):
    pass