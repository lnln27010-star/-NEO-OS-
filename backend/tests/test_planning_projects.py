import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError
from fastapi.testclient import TestClient

from backend.planning_projects import PlanningProjectRepository, Project, ProjectSave
from backend import api


class PlanningProjectsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = PlanningProjectRepository(Path(self.temp.name) / 'planning.sqlite3')
        self.data = {'name':'测试场址','phases':[{'name':'一期','opening_month':13,'build_months':12,'it_mw':5,'capex_wan':30000}]}

    def tearDown(self):
        self.temp.cleanup()

    def test_revision_and_evidence_gate(self):
        record = self.repo.save(ProjectSave(data=Project.model_validate(self.data)))
        self.assertEqual(record['revision'], 1)
        self.assertEqual(len(self.repo.list()['projects']), 1)
        changed = Project.model_validate({**self.data,'site':{'grid_mw':8,'evidence':{'grid':{'status':'verified','reference':'供电公司书面意见 001'}}}})
        updated = self.repo.save(ProjectSave(expected_revision=1,data=changed), record['id'])
        self.assertEqual(updated['revision'], 2)
        history=self.repo.history(record['id'])['versions']
        self.assertEqual([item['revision'] for item in history],[2,1])
        self.assertEqual(history[1]['data']['name'],'测试场址')
        with self.assertRaisesRegex(RuntimeError, '已由其他操作更新'):
            self.repo.save(ProjectSave(expected_revision=1,data=changed), record['id'])
        with self.assertRaises(ValidationError):
            Project.model_validate({**self.data,'site':{'evidence':{'grid':{'status':'verified'}}}})

    def test_document_is_scoped_and_checked(self):
        record = self.repo.save(ProjectSave(data=Project.model_validate(self.data)))
        doc = self.repo.add_document(record['id'],'grid','../供电函.pdf','application/pdf',b'%PDF-1.4 test')
        self.assertEqual(self.repo.documents(record['id'])['documents'][0]['filename'],'供电函.pdf')
        path,_,_ = self.repo.document_path(record['id'],doc['id'])
        self.assertEqual(path.read_bytes(),b'%PDF-1.4 test')
        with self.assertRaises(KeyError):
            self.repo.document_path('PLAN-other',doc['id'])
        with self.assertRaises(ValueError):
            self.repo.add_document(record['id'],'grid','evil.exe','application/octet-stream',b'bad')

    def test_invalid_phase_and_tariff_mix(self):
        with self.assertRaises(ValidationError):
            Project.model_validate({**self.data,'phases':[{'name':'一期','opening_month':12,'build_months':12,'it_mw':5,'capex_wan':1}]})
        with self.assertRaises(ValidationError):
            Project.model_validate({**self.data,'finance':{'peak_share_pct':70,'valley_share_pct':40}})
        with self.assertRaises(ValidationError):
            Project.model_validate({**self.data,'finance':{'horizon_years':1}})
        with self.assertRaises(ValidationError):
            Project.model_validate({**self.data,'customers':[{'code':'REQ-1','customer':'甲','it_mw':2},{'code':'REQ-1','customer':'甲','it_mw':2}]})

    def test_multiple_customer_stages_and_milestones_persist(self):
        project=Project.model_validate({**self.data,'business_model':'hybrid','customers':[{'code':'REQ-1','customer':'甲','customer_province':'江苏省','customer_city':'南京市','stage':'contract','workload':'inference','it_mw':2,'max_latency_ms':20,'bandwidth_gbps':100,'reference':'合同-A'},{'code':'REQ-2','customer':'乙','stage':'rfp','workload':'training','it_mw':4,'reference':'RFP-B'}],'milestones':[{'key':'lead','owner':'张三','actual_date':'2026-11-11'},{'key':'intent','planned_date':'2026-12-01','blocker':'客户需求书未签章'}],'technical_options':[{'name':'液冷方案','it_mw':5,'rack_count':100,'max_rack_kw':100,'power_scheme':'双路','redundancy':'2N','cooling_scheme':'液冷+风冷','liquid_pct':70,'pue':1.2,'capex_wan':30000,'delivery_months':18}]})
        saved=self.repo.save(ProjectSave(data=project))
        self.assertEqual(saved['data']['customers'][0]['stage'],'contract')
        self.assertEqual(saved['data']['customers'][1]['workload'],'training')
        self.assertEqual(saved['data']['milestones'][1]['blocker'],'客户需求书未签章')
        self.assertEqual(saved['data']['technical_options'][0]['redundancy'],'2N')
        self.assertEqual(saved['data']['business_model'],'hybrid')
        self.assertEqual(saved['data']['customers'][0]['bandwidth_gbps'],100)

    def test_idc_model_is_versioned_with_project(self):
        phase={'name':'一期','deliveryMonth':12,'rack1':{'kw':10,'count':100,'grossYuanKwMonth':255},'ramp12Pct':40,'steadyPct':95}
        data=Project.model_validate({**self.data,'idc_model':{'startYear':2027,'phases':[phase]}})
        saved=self.repo.save(ProjectSave(data=data))
        self.assertEqual(saved['data']['idc_model']['phases'][0]['rack1']['grossYuanKwMonth'],255)
        self.assertEqual(self.repo.history(saved['id'])['versions'][0]['data']['idc_model']['startYear'],2027)
        with self.assertRaises(ValidationError):
            Project.model_validate({**self.data,'idc_model':{'startYear':2027,'phases':[{'rack1':{'kw':-10}}]}})

    def test_park_candidate_keeps_coordinate_system(self):
        project=Project.model_validate({**self.data,'site':{'park_name':'示例园区','park_poi_id':'POI-1','address':'园区道路','longitude':118.77,'latitude':32.04,'coordinate_system':'GCJ02'}})
        saved=self.repo.save(ProjectSave(data=project))
        self.assertEqual(saved['data']['site']['coordinate_system'],'GCJ02')
        self.assertEqual(saved['data']['site']['park_poi_id'],'POI-1')

    def test_http_create_update_and_attachment(self):
        with patch.object(api,'planning_projects',self.repo), TestClient(api.app) as client:
            created=client.post('/api/platform/planning/projects',json={'expected_revision':0,'data':self.data})
            self.assertEqual(created.status_code,201)
            id=created.json()['id']
            self.assertEqual(client.get('/api/platform/planning/projects').json()['projects'][0]['id'],id)
            modified=client.put(f'/api/platform/planning/projects/{id}',json={'expected_revision':1,'data':{**self.data,'name':'修订项目'}})
            self.assertEqual(modified.status_code,200)
            conflict=client.put(f'/api/platform/planning/projects/{id}',json={'expected_revision':1,'data':self.data})
            self.assertEqual(conflict.status_code,409)
            self.assertEqual(len(client.get(f'/api/platform/planning/projects/{id}/versions').json()['versions']),2)
            uploaded=client.post(f'/api/platform/planning/projects/{id}/documents',data={'gate':'grid'},files={'file':('grid.pdf',b'%PDF-1.4 sample','application/pdf')})
            self.assertEqual(uploaded.status_code,201)
            doc_id=uploaded.json()['id']
            self.assertEqual(len(client.get(f'/api/platform/planning/projects/{id}/documents').json()['documents']),1)
            self.assertEqual(client.get(f'/api/platform/planning/projects/{id}/documents/{doc_id}').content,b'%PDF-1.4 sample')


if __name__ == '__main__':
    unittest.main()
