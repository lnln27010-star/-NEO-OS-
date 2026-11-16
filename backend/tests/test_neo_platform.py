"""Product center, design and bounded task orchestration contract checks."""
import os
import hashlib
import tempfile
import time
import unittest

TEST_DATA=tempfile.TemporaryDirectory(prefix='aidc-neo-tests-')
os.environ.setdefault('AIDC_SIM_DATA',TEST_DATA.name)

from fastapi.testclient import TestClient
from backend.api import app
from backend.tests.test_foundation import center


class NeoPlatformTests(unittest.TestCase):
    client=TestClient(app)

    def setUp(self):
        self.center_id='DC-NEO-'+hashlib.md5(self.id().encode()).hexdigest()[:12]
        if self.client.get('/api/simulation/data-centers/'+self.center_id).status_code!=200:
            data=center(self.center_id).model_dump()
            response=self.client.post('/api/simulation/data-centers',json={'data':data,'expected_revision':0})
            self.assertEqual(response.status_code,200,response.text)

    def wait(self,id):
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            record=self.client.get('/api/simulation/jobs/'+id).json()
            if record['status'] not in {'queued','running'}:return record
            time.sleep(.2)
        self.fail('专业求解未在测试时间内完成')

    def test_dashboard_uses_registered_data_only(self):
        response=self.client.get('/api/platform/overview')
        self.assertEqual(response.status_code,200,response.text)
        entry=next(c for c in response.json()['centers'] if c['id']==self.center_id)
        self.assertEqual(entry['asset_count'],3)
        self.assertEqual(entry['telemetry_source_count'],0)
        self.assertIsNone(entry['latitude'])
        self.assertIsNone(entry['baseline'])
        directory=self.client.get('/api/platform/capabilities').json()
        self.assertEqual({c['id'] for c in directory['capabilities']},{'pandapower','pypsa','openfoam','fenicsx'})
        self.assertTrue(all('calibration' in c and 'available' in c for c in directory['capabilities']))

    def test_design_is_recomputed_and_saved(self):
        payload={'name':'双路液冷草案','site_id':'S01','site_name':'规划候选站','center_id':self.center_id,'source':'user-planning-input','inputs':{'racks':384,'liquid_percent':50,'pue':1.3,'redundancy':'N+1','it_kw_air':16,'it_kw_liquid':60},'results':{'it_mw':9999},'note':'参数假设待核实'}
        response=self.client.post('/api/platform/designs',json=payload)
        self.assertEqual(response.status_code,201,response.text)
        result=response.json()
        self.assertAlmostEqual(result['results']['it_mw'],14.592,places=6)
        self.assertEqual(result['source'],'user-planning-input')
        records=self.client.get('/api/platform/designs',params={'center_id':self.center_id}).json()['designs']
        self.assertTrue(any(p['id']==result['id'] and p['results']['it_mw']==14.592 for p in records))

    def test_assistant_requires_published_data_and_runs_solver(self):
        coverage=self.client.post('/api/platform/assistant/tasks',json={'action':'coverage','center_ids':[self.center_id]})
        self.assertEqual(coverage.status_code,200)
        self.assertEqual(coverage.json()['centers'][0]['asset_count'],3)
        self.assertEqual(self.client.post('/api/platform/assistant/tasks',json={'action':'shell','command':'anything'}).status_code,422)
        self.assertEqual(self.client.post('/api/platform/assistant/tasks',json={'action':'power_check','center_ids':[self.center_id]}).status_code,422)
        publish=self.client.post('/api/simulation/data-centers/'+self.center_id+'/publish',json={'expected_revision':1,'operator':'验证员','note':'单元测试','expected_inventory_revision':0})
        self.assertEqual(publish.status_code,200,publish.text)
        response=self.client.post('/api/platform/assistant/tasks',json={'action':'power_check','center_ids':[self.center_id]})
        self.assertEqual(response.status_code,200,response.text)
        job=response.json()['job']
        self.assertEqual(job['data_sources'][0]['baseline'],1)
        record=self.wait(job['id'])
        self.assertEqual(record['status'],'succeeded',record)
        self.assertAlmostEqual(next(m['value'] for m in record['result']['metrics'] if m['key']=='served_mw'),.008,places=6)


if __name__=='__main__':unittest.main()
