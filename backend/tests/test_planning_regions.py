import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError
from fastapi.testclient import TestClient

from backend.planning_regions import RegionBatch,RegionRepository
from backend import api


class RegionRepositoryTest(unittest.TestCase):
    def test_import_is_atomic_and_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            repo=RegionRepository(Path(folder)/'regions.sqlite3')
            row={'province':'江苏省','city':'南京市','dimension':'grid','metric':'可接入容量','value':20,'unit':'MW','status':'quoted','source':'接入函-001','as_of':'2026-11-01'}
            batch=RegionBatch.model_validate({'rows':[row]})
            self.assertEqual(repo.import_batch(batch)['created'],1)
            self.assertEqual(repo.import_batch(batch)['updated'],1)
            records=repo.list()['signals']
            self.assertEqual(len(records),1)
            self.assertEqual(records[0]['value'],20)
            with self.assertRaises(ValidationError):
                RegionBatch.model_validate({'rows':[row,{**row,'dimension':'unknown'}]})
            with self.assertRaises(ValidationError):
                RegionBatch.model_validate({'rows':[{**row,'province':'不存在省'}]})
            with self.assertRaises(ValidationError):
                RegionBatch.model_validate({'rows':[{**row,'as_of':'2026-13-40'}]})
            self.assertEqual(len(repo.list()['signals']),1)
            with patch.object(api,'planning_regions',repo),TestClient(api.app) as client:
                self.assertEqual(client.get('/api/platform/planning/regions').status_code,200)
                self.assertEqual(client.post('/api/platform/planning/regions/import',json={'rows':[row]}).json()['updated'],1)
                self.assertEqual(client.post('/api/platform/planning/regions/import',json={'rows':[{**row,'province':'不存在省'}]}).status_code,422)


if __name__=='__main__':unittest.main()
