

class DataUtilities:
    @staticmethod
    def expand_dot_notation(fields):
        expanded = set()
        for field in fields:
            parts = field.split('.')
            for i in range(1, len(parts) + 1):
                expanded.add('.'.join(parts[:i]))
        return list(expanded)