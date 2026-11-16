import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend import api
from backend.foundation import CenterRepository
from backend.planning_demand import DemandBatch,PlanningDemandRepository


class PlanningDemandTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.repository=PlanningDemandRepository(CenterRepository(Path(self.directory.name)/'foundation.sqlite3'))
        self.rows=[{'province':'江苏省','workload':'inference','stage':'contract','capacity_mw':12,'latency_ms':10,'reference':'合同 A-001','as_of':'2026-11-03','customer_code':'PROJECT-A'},
                   {'province':'宁夏回族自治区','workload':'training','stage':'rfp','capacity_mw':8,'reference':'招采 B-002','as_of':'2026-11-03','customer_code':'PROJECT-B'}]

    def test_import_idempotency_and_atomic_conflict(self):
        batch=DemandBatch(operator='规划甲',records=self.rows)
        first=self.repository.import_batch(batch)
        self.assertEqual(first['added'],2)
        self.assertEqual(first['aggregate']['江苏省']['contract_mw'],12)
        self.assertEqual(self.repository.import_batch(batch)['skipped'],2)
        changed={**self.rows[0],'capacity_mw':13}
        with self.assertRaises(ValueError):self.repository.import_batch(DemandBatch(operator='规划甲',records=[changed]))
        self.assertEqual(self.repository.list()['aggregate']['江苏省']['contract_mw'],12)
        advanced={**self.rows[1],'stage':'contract','capacity_mw':9,'reference':'合同 B-003','as_of':'2026-11-04'}
        result=self.repository.import_batch(DemandBatch(operator='规划甲',records=[advanced]))
        self.assertEqual(result['updated'],1)
        self.assertEqual(result['aggregate']['宁夏回族自治区']['rfp_mw'],0)
        self.assertEqual(result['aggregate']['宁夏回族自治区']['contract_mw'],9)
        self.assertEqual(result['aggregate']['宁夏回族自治区']['count'],1)

    def test_http_contract_and_invalid_province(self):
        original=api.planning_demand
        api.planning_demand=self.repository
        try:
            client=TestClient(api.app)
            response=client.post('/api/platform/planning/demand/import',json={'operator':'规划甲','records':self.rows})
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json()['added'],2)
            self.assertEqual(client.get('/api/platform/planning/demand').json()['aggregate']['江苏省']['contract_mw'],12)
            invalid={**self.rows[0],'province':'未知地区'}
            self.assertEqual(client.post('/api/platform/planning/demand/import',json={'operator':'规划甲','records':[invalid]}).status_code,422)
        finally:api.planning_demand=original


if __name__=='__main__':unittest.main()
