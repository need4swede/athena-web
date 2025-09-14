# athena/utils/global_operator.py

# Standard Imports
import os

class Date:
    def __init__(self, year, month, day):
        self.year = year
        self.month = month
        self.day = day

    def __str__(self):
        return f"{self.year}-{self.month}-{self.day}"

    def __repr__(self):
        return f"{self.year}-{self.month}-{self.day}"

    def __eq__(self, other):
        return self.year == other.year and self.month == other.month and self.day == other.day

    def __ne__(self, other):
        return not self.__eq__(other)

    def __lt__(self, other):
        if self.year < other.year:
            return True
        elif self.year == other.year:
            if self.month < other.month:
                return True
            elif self.month == other.month:
                if self.day < other.day:
                    return True
        return False

    def __le__(self, other):
        return self.__lt__(other) or self.__eq__(other)

    def __gt__(self, other):
        return not self.__le__(other)

    def __ge__(self, other):
        return not self.__lt__(other)

class Parse:
    def __init__(self, parse_path):
        if os.path.isdir(parse_path):
            self.directory(parse_path)
        else:
            self.file(parse_path)

    def directory(self, dir_path):
        print(f"Directory: {dir_path}")

    def file(self, file_path):
        print(f"File: {file_path}")