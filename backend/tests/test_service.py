import json
import os
import tempfile
import time
import unittest
import sys
from unittest.mock import patch
from pathlib import Path

TEST_DATA=tempfile.TemporaryDirectory(prefix='aidc-算电-tests-')
os.environ['AIDC_SIM_DATA']=TEST_DATA.name
from backend.models import JobRequest
from backend.api import app,manager
from fastapi.testclient import TestClient

def small_model():
    devices=[]
    def add(id,kind,capacity,x,connections=None,**extra):devices.append({'id':id,'kind':kind,'capacity':capacity,'x':x,'z':0,'connections':connections or {},**extra})
    for side,x in [('A',0),('B',5)]:
        add('TX-'+side,'transformer',16000,x)
        add('LV-'+side,'lv-panel',20000,x+1,{'powerA':'TX-'+side})
        add('UPS-'+side,'ups',3500,x+2,{'powerA':'LV-'+side})
        add('BUS-'+side,'busbar',16000,x+3,{'powerA':'UPS-'+side})
    add('RPP-01','rpp',5000,10,{'powerA':'BUS-A','powerB':'BUS-B'})
    add('PDU-A','pdu',2400,11,{'powerA':'RPP-01','powerB':'RPP-01'})
    for i in range(3):add('R-A0'+str(i+1),'rack',16,12+i,{'powerA':'PDU-A','powerB':'PDU-A'},demand_kw=11.2,heat_air_kw=11.2)
    return {'revision':'fixture-1','devices':devices}

class ServiceTests(unittest.TestCase):
    client=TestClient(app)
    def wait(self,id):
        start=time.monotonic()
        while time.monotonic()-start<90:
            record=self.client.get('/api/simulation/jobs/'+id).json()
            if record['status'] not in {'queued','running'}:return record
            time.sleep(.15)
        self.fail('Solver job timeout')
    def test_01_real_pandapower(self):
        response=self.client.post('/api/simulation/jobs',json={'engine':'pandapower','snapshot':small_model(),'electrical':{'analysis':'power_flow_short_circuit'}})
        self.assertEqual(response.status_code,202,response.text)
        record=self.wait(response.json()['id']);self.assertEqual(record['status'],'succeeded',record)
        result=record['result'];self.assertTrue(result['executed']);self.assertTrue(result['converged'])
        self.assertTrue(all(c['passed'] for c in result['checks']),result)
        self.assertAlmostEqual(next(m['value'] for m in result['metrics'] if m['key']=='served_mw'),.0336,places=6)
        self.assertEqual(len(result['short_circuit']),2)
        self.assertTrue(all(a['redundant'] for a in result['assets'] if a['kind']=='rack'))
        self.assertTrue(all(abs(a['loading_percent']-70)<1e-4 for a in result['assets'] if a['kind']=='rack'))
        self.assertEqual(self.client.get(f"/api/simulation/jobs/{record['id']}/artifacts/electrical-network.json").status_code,200)
    def test_02_disconnected_loads(self):
        model=small_model();next(d for d in model['devices'] if d['id']=='PDU-A')['enabled']=False
        response=self.client.post('/api/simulation/jobs',json={'engine':'pandapower','snapshot':model})
        record=self.wait(response.json()['id']);self.assertEqual(record['status'],'succeeded',record)
        result=record['result'];self.assertAlmostEqual(next(m['value'] for m in result['metrics'] if m['key']=='unserved_kw'),33.6,places=5)
        self.assertFalse(next(c['passed'] for c in result['checks'] if c['name']=='负载全部供电'))
    def test_03_real_pypsa(self):
        response=self.client.post('/api/simulation/jobs',json={'engine':'pypsa'})
        record=self.wait(response.json()['id']);self.assertEqual(record['status'],'succeeded',record)
        result=record['result'];self.assertTrue(all(c['passed'] for c in result['checks']),result)
        self.assertEqual(len(result['series']),24)
        self.assertAlmostEqual(result['series'][-1]['soc_mwh'],10,places=5)
        self.assertTrue(all(row['grid_mw']<=26+1e-5 for row in result['series']))
    def test_04_infeasible_pypsa(self):
        response=self.client.post('/api/simulation/jobs',json={'engine':'pypsa','dispatch':{'demand_mw':200}})
        record=self.wait(response.json()['id']);self.assertEqual(record['status'],'failed',record)
        self.assertIn('无最优可行解',record['error'])
        self.assertNotIn('result',record)
    def test_05_case_bundles(self):
        for mode in ['room_airflow','local_cht']:
            response=self.client.post('/api/simulation/cases',json={'engine':'openfoam','snapshot':small_model(),'thermal':{'mode':mode}})
            self.assertEqual(response.status_code,201,response.text)
            folder=manager.folder(response.json()['id']);self.assertTrue((folder/'case.zip').exists())
            self.assertIn('FoamFile',(folder/'case/system/blockMeshDict').read_text())
            if mode=='local_cht':self.assertIn('air water',(folder/'case/constant/regionProperties').read_text())
        response=self.client.post('/api/simulation/cases',json={'engine':'fenicsx'})
        self.assertEqual(response.status_code,201)
    def test_06_validation_and_boundaries(self):
        self.assertEqual(self.client.post('/api/simulation/jobs',json={'engine':'shell','command':'anything'}).status_code,422)
        self.assertEqual(self.client.post('/api/simulation/jobs',json={'engine':'pandapower','electrical':{'transformer_vk_percent':.5,'transformer_vkr_percent':1}}).status_code,422)
        self.assertEqual(self.client.post('/api/simulation/jobs',json={'engine':'openfoam','thermal':{'cells_x':80,'cells_y':48,'cells_z':30}}).status_code,422)
        self.assertEqual(self.client.post('/api/simulation/jobs',json={'engine':'pypsa'},headers={'Origin':'https://untrusted.example'}).status_code,403)
        self.assertEqual(self.client.get('/api/simulation/jobs/not-a-job').status_code,404)
        capabilities=self.client.get('/api/simulation/engines').json()['engines']
        self.assertEqual(len(capabilities),4)
        for engine in capabilities:
            if not engine['available']:
                self.assertEqual(self.client.post('/api/simulation/jobs',json={'engine':engine['id']}).status_code,409)
        response=self.client.post('/api/simulation/model',json=small_model());self.assertEqual(response.status_code,200)
        self.assertEqual(self.client.get('/api/simulation/model').json()['snapshot']['revision'],'fixture-1')
        self.assertEqual(self.client.post('/api/simulation/cases',json={'engine':'fenicsx','fem':{'length_m':.011,'width_m':3,'cells':64}}).status_code,422)
        with self.assertRaises(KeyError):manager.artifact(next(iter(manager.jobs)),'../outside.json')
        model=small_model();model['devices'].append({'id':'CRAC-01','kind':'crac','capacity':250,'x':1,'z':1,'operating':False,'cooling_ready':False})
        self.assertEqual(self.client.post('/api/simulation/cases',json={'engine':'openfoam','snapshot':model}).status_code,422)
    def test_07_cancel_job(self):
        with patch('backend.jobs.worker_command',return_value=[sys.executable,'-c','import time; time.sleep(20)']):
            response=self.client.post('/api/simulation/jobs',json={'engine':'pandapower','snapshot':small_model()})
            id=response.json()['id'];deadline=time.monotonic()+5
            while id not in manager.processes and time.monotonic()<deadline:time.sleep(.05)
            self.assertIn(id,manager.processes)
            record=self.client.post('/api/simulation/jobs/'+id+'/cancel',json={}).json()
            self.assertEqual(record['status'],'cancelled')
            self.assertTrue((manager.folder(id)/'request.json').exists())

if __name__=='__main__':unittest.main(verbosity=2)
