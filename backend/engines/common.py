import json
from pathlib import Path

def write_json(path: Path, data):
    def scalar(value):
        if hasattr(value,'item'):return value.item()
        raise TypeError(f'Unsupported result type: {type(value).__name__}')
    path.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2,default=scalar), encoding='utf-8')

def metric(name, value, unit='', label=None):
    return {'key':name,'label':label or name,'value':value,'unit':unit}
