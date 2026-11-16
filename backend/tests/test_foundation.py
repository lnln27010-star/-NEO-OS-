import json
import os
from pathlib import Path
import tempfile
import unittest

TEMP=tempfile.TemporaryDirectory(prefix='aidc-基础数据-test-')
os.environ.setdefault('AIDC_SIM_DATA',TEMP.name)
from backend.foundation import Asset,Cable,Center,CenterRepository,Hour,SaveCenter,compile_request,quality
from backend.models import JobRequest,Nameplate
from backend.engines.pandapower_engine import solve as power_solve
from backend.engines.pypsa_engine import solve as dispatch_solve

def center(id='DC-TEST'):
    plate=Nameplate(rated_kva=1000,hv_kv=10,lv_kv=.415,power_factor=.98,vk_percent=6,vkr_percent=.7,pfe_kw=1,i0_percent=.2)
    return Center(id=id,code=id,name='测试数据中心',it_capacity_mw=1,grid_capacity_mw=2,pue=1.2,solar_mw=0,battery_mwh=0,battery_mw=0,grid_short_circuit_mva=500,assets=[
        Asset(id='TX-01',kind='transformer',capacity=980,nameplate=plate,manufacturer='测试厂家',model='TX'),
        Asset(id='LV-01',kind='lv-panel',capacity=500,nameplate=Nameplate(power_factor=.98)),
        Asset(id='R-01',kind='rack',capacity=16,measured_kw=8,nameplate=Nameplate(power_factor=.98))],cables=[
        Cable(id='C1',source='TX-01',target='LV-01',port='powerA',length_m=10,r_ohm_km=.08,x_ohm_km=.08,max_i_ka=1),
        Cable(id='C2',source='LV-01',target='R-01',port='powerA',length_m=10,r_ohm_km=.08,x_ohm_km=.08,max_i_ka=1)],hourly=[Hour(price=.2 if h<8 else .9,it_kw=20,solar_kw=0) for h in range(24)])

class FoundationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='aidc-档案-');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.repo=CenterRepository(self.root/'data.sqlite3')
    def test_persistence_revision_conflict_and_history(self):
        c=center();first=self.repo.save(SaveCenter(data=c));self.assertEqual(first['revision'],1)
        self.assertEqual(CenterRepository(self.root/'data.sqlite3').get(c.id)['data']['assets'][0]['nameplate']['rated_kva'],1000)
        with self.assertRaises(RuntimeError):self.repo.save(SaveCenter(data=c))
        c.name='更新名称';self.repo.save(SaveCenter(data=c,expected_revision=1))
        self.assertEqual(self.repo.version(c.id,1)['data']['name'],'测试数据中心')
        self.assertEqual(len(self.repo.history(c.id)),2)
        other=center('DC-OTHER');other.assets[2].measured_kw=12;self.repo.save(SaveCenter(data=other))
        self.assertEqual(self.repo.get(c.id)['data']['assets'][2]['measured_kw'],8)
    def test_quality_and_missing_data(self):
        c=center();c.cables.append(c.cables[0].model_copy(update={'id':'C3'}))
        self.assertGreater(quality(c)['errors'],0)
        with self.assertRaises(ValueError):self.repo.save(SaveCenter(data=c))
        c=center();c.cables[0].length_m=None;self.repo.save(SaveCenter(data=c))
        self.repo.publish(c.id,1,'测试','缺参校验')
        with self.assertRaisesRegex(ValueError,'实际长度'):compile_request(JobRequest(engine='pandapower',data_center_ids=[c.id]),self.repo)
        c=center('DC-MISSING');c.hourly[3].price=None;self.repo.save(SaveCenter(data=c))
        self.repo.publish(c.id,1,'测试','缺参校验')
        with self.assertRaisesRegex(ValueError,'24 小时'):compile_request(JobRequest(engine='pypsa',data_center_ids=[c.id]),self.repo)
        c=center('DC-MANY');c.assets.extend(Asset(id='EXTRA-'+str(i)) for i in range(600));c.cables[0].source='MISSING'
        checked=quality(c);self.assertGreater(checked['warnings'],1000);self.assertEqual(checked['issues'][0]['severity'],'error')
        with self.assertRaisesRegex(ValueError,'端点不存在'):self.repo.save(SaveCenter(data=c))
    def test_real_power_uses_saved_nameplate_and_cable(self):
        c=center();c.assets[1].nameplate.rated_current_a=20;self.repo.save(SaveCenter(data=c))
        self.repo.publish(c.id,1,'测试','初始工况')
        request=compile_request(JobRequest(engine='pandapower',data_center_ids=[c.id]),self.repo)
        self.assertEqual(request.snapshot.devices[0].nameplate.rated_kva,1000)
        self.assertEqual(request.data_sources[0]['revision'],1)
        a=self.root/'a';a.mkdir();result=power_solve(request,a)
        voltage=next(m['value'] for m in result['metrics'] if m['key']=='voltage_min')
        self.assertGreater(next(a['loading_percent'] for a in result['assets'] if a['id']=='LV-01'),50)
        self.assertLess(next(a['loading_percent'] for a in result['assets'] if a['id']=='LV-01'),75)
        c.cables[1].length_m=200;self.repo.save(SaveCenter(data=c,expected_revision=1))
        self.repo.publish(c.id,2,'测试','电缆修订')
        request2=compile_request(JobRequest(engine='pandapower',data_center_ids=[c.id]),self.repo)
        b=self.root/'b';b.mkdir();result2=power_solve(request2,b)
        voltage2=next(m['value'] for m in result2['metrics'] if m['key']=='voltage_min')
        self.assertLess(voltage2,voltage)
        network=json.loads((b/'electrical-network.json').read_text(encoding='utf-8'))
        self.assertTrue(network)
        c.assets[2].load_profile_kw=[8.0]*24;c.assets[2].load_profile_kw[7]=12
        self.repo.save(SaveCenter(data=c,expected_revision=2))
        self.repo.publish(c.id,3,'测试','负载曲线')
        hour=compile_request(JobRequest(engine='pandapower',data_center_ids=[c.id],data_hour=7),self.repo)
        self.assertEqual(hour.snapshot.devices[2].demand_kw,12)
    def test_real_dispatch_uses_each_centers_hourly_data(self):
        a=center('DC-A');b=center('DC-B');b.hourly=[Hour(price=1,it_kw=10,solar_kw=0) for _ in range(24)]
        b.battery_mwh=.01;b.battery_mw=.005
        self.repo.save(SaveCenter(data=a));self.repo.save(SaveCenter(data=b))
        self.repo.publish(a.id,1,'测试','节点 A');self.repo.publish(b.id,1,'测试','节点 B')
        request=compile_request(JobRequest(engine='pypsa',data_center_ids=[a.id,b.id],dispatch={'flexible_percent':0,'grid_limit_mw':1}),self.repo)
        self.assertEqual(request.dispatch.sites[0].hourly_prices[0],.2)
        output=self.root/'dispatch';output.mkdir();result=dispatch_solve(request,output)
        self.assertTrue(all(c['passed'] for c in result['checks']))
        self.assertAlmostEqual(result['series'][0]['sites'][0]['it_mw'],.02,places=6)
        self.assertAlmostEqual(result['series'][0]['sites'][1]['it_mw'],.01,places=6)
        self.assertEqual(result['series'][0]['sites'][1]['price_yuan_kwh'],1)
        self.assertAlmostEqual(result['series'][-1]['soc_mwh'],.005,places=6)
    def test_http_contract_and_archive(self):
        from fastapi.testclient import TestClient
        from backend.api import app
        client=TestClient(app);c=center('DC-API')
        response=client.post('/api/simulation/data-centers',json={'data':c.model_dump(),'expected_revision':0})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(client.post('/api/simulation/data-centers',json={'data':c.model_dump(),'expected_revision':0}).status_code,409)
        self.assertEqual(client.get('/api/simulation/data-centers/DC-API').json()['revision'],1)
        self.assertEqual(client.get('/api/simulation/data-centers/DC-API/history/1').status_code,200)
        self.assertEqual(client.get('/api/simulation/data-centers/no-such').status_code,404)
        c.archived=True
        self.assertEqual(client.post('/api/simulation/data-centers',json={'data':c.model_dump(),'expected_revision':1}).status_code,200)
        self.assertEqual(client.post('/api/simulation/jobs',json={'engine':'pandapower','data_center_ids':['DC-API']}).status_code,422)

if __name__=='__main__':unittest.main()
