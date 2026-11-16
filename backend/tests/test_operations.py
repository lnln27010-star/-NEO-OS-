import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

TEMP=tempfile.TemporaryDirectory(prefix='aidc-运营-tests-');os.environ.setdefault('AIDC_SIM_DATA',TEMP.name)
from backend.tests.test_foundation import center
from backend.foundation import CenterRepository,SaveCenter,compile_request
from backend.models import JobRequest
from backend.operations import OperationsRepository,EntitySave,ChangePlan,ChangeComplete,TelemetryBatch
from backend.documents import DocumentRepository,DocumentMeta,ImportMapping
from backend.document_parser import parse

class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='aidc-运营档案-');self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.repo=CenterRepository(self.root/'foundation.sqlite3');self.ops=OperationsRepository(self.repo);self.c=center('DC-OPS');self.repo.save(SaveCenter(data=self.c))
    def save_server(self,id='S1',**values):
        return self.ops.save(self.c.id,'server',EntitySave(data={'id':id,'rack_id':'R-01','status':'installed','u_start':1,'u_height':2,'measured_w':800,**values}))
    def save_part(self,id,**values):return self.ops.save(self.c.id,'component',EntitySave(data={'id':id,'kind':'gpu',**values}))
    def test_publication_freezes_draft_and_inventory(self):
        with self.assertRaisesRegex(ValueError,'尚未发布'):compile_request(JobRequest(engine='pandapower',data_center_ids=[self.c.id]),self.repo)
        self.save_server();self.repo.publish(self.c.id,1,'测试员','初始基线',1)
        self.c.assets[2].measured_kw=12;self.repo.save(SaveCenter(data=self.c,expected_revision=1))
        request=compile_request(JobRequest(engine='pandapower',data_center_ids=[self.c.id]),self.repo)
        self.assertEqual(request.snapshot.devices[2].demand_kw,8)
        self.assertEqual(request.data_sources[0]['baseline'],1)
        self.repo.publish(self.c.id,2,'测试员','更新负载',1)
        self.assertEqual(compile_request(JobRequest(engine='pandapower',data_center_ids=[self.c.id]),self.repo).snapshot.devices[2].demand_kw,12)
        with self.assertRaises(ValueError):self.repo.publish(self.c.id,2,'测试员','重复发布',1)
    def test_slots_change_conflicts_and_power_remeasurement(self):
        self.save_server()
        with self.assertRaisesRegex(ValueError,'U 位冲突'):self.save_server('S2',u_start=2)
        with self.assertRaisesRegex(ValueError,'U 位范围'):self.save_server('S3',u_start=42)
        self.save_part('GPU-OLD',server_id='S1',slot='GPU-0',status='installed',model='旧部件')
        with self.assertRaisesRegex(ValueError,'槽位已占用'):self.save_part('GPU-DUP',server_id='S1',slot='GPU-0',status='installed')
        self.save_part('GPU-NEW',status='stock',model='新部件')
        self.repo.publish(self.c.id,1,'测试员','配置核实',3)
        plans=self.ops.create_change(self.c.id,ChangePlan(kind='replace-component',target_id='GPU-OLD',replacement_id='GPU-NEW',reason='更换故障部件',operator='测试员'))
        id=plans[0]['id']
        with self.assertRaisesRegex(ValueError,'现场操作'):self.ops.complete_change(self.c.id,id,ChangeComplete(expected_revision=1,operator='测试员'))
        self.ops.complete_change(self.c.id,id,ChangeComplete(expected_revision=1,operator='测试员',compatibility_checked=True))
        parts={r['id']:r['data'] for r in self.ops.list(self.c.id,'component')}
        self.assertEqual(parts['GPU-NEW']['slot'],'GPU-0');self.assertEqual(parts['GPU-OLD']['status'],'repair')
        self.assertEqual(self.repo.get(self.c.id)['revision'],2)
        self.assertIsNone(self.repo.get(self.c.id)['data']['assets'][2]['measured_kw'])
        self.assertIsNone(self.ops.list(self.c.id,'server')[0]['data']['measured_w'])
        self.assertEqual(self.repo.published(self.c.id)['data']['assets'][2]['measured_kw'],8)
        with self.assertRaises(RuntimeError):self.ops.complete_change(self.c.id,id,ChangeComplete(expected_revision=1,operator='测试员',compatibility_checked=True))
        self.repo.publish(self.c.id,2,'测试员','待重新采集',4)
        with self.assertRaisesRegex(ValueError,'功率'):compile_request(JobRequest(engine='pandapower',data_center_ids=[self.c.id]),self.repo)
        s=self.ops.list(self.c.id,'server')[0];self.ops.save(self.c.id,'server',EntitySave(expected_revision=s['revision'],data={**s['data'],'measured_w':900}))
        self.repo.publish(self.c.id,2,'测试员','实测更新',5)
        self.assertAlmostEqual(compile_request(JobRequest(engine='pandapower',data_center_ids=[self.c.id]),self.repo).snapshot.devices[2].demand_kw,.9)
    def test_plan_detects_changed_configuration(self):
        self.save_server();self.save_part('P1',server_id='S1',slot='GPU-0',status='installed')
        c=self.ops.create_change(self.c.id,ChangePlan(kind='remove-component',target_id='P1',reason='拆卸',operator='测试员'))[0]
        row=self.ops.list(self.c.id,'component')[0];self.ops.save(self.c.id,'component',EntitySave(expected_revision=1,data={**row['data'],'model':'已被另一窗口修改'}))
        with self.assertRaisesRegex(RuntimeError,'配置在计划后已改变'):self.ops.complete_change(self.c.id,c['id'],ChangeComplete(expected_revision=1,operator='测试员',compatibility_checked=True))
    def test_measurements_timezone_duplicates_and_missing_hours(self):
        batch=TelemetryBatch(name='IT 总表',source_id='SRC1',rows=[{'timestamp':'2026-10-18T16:00:00Z','metric':'it_kw','value':10},{'timestamp':'2026-10-19T00:30:00+08:00','metric':'it_kw','value':20},{'timestamp':'2026-10-19T00:00:00','metric':'solar_kw','value':0}])
        self.assertEqual(self.ops.ingest(self.c.id,batch)['added'],3)
        self.assertEqual(self.ops.ingest(self.c.id,batch)['added'],0)
        result=self.ops.daily(self.c.id,'SRC1','2026-10-19');self.assertEqual(result['hourly'][0]['it_kw'],15);self.assertEqual(result['hourly'][0]['solar_kw'],0);self.assertIsNone(result['hourly'][1]['it_kw'])
        self.assertGreaterEqual(len(self.ops.audit(self.c.id)),2)
    def test_document_preview_merge_and_source(self):
        docs=DocumentRepository(self.repo,self.ops,self.root/'documents');self.addCleanup(docs.pool.shutdown,True)
        content='设备编号,设备名称,设备类型,额定功率,厂家,功率因数\nR-01,一号机柜,机柜,20,现场清册,98%\n'.encode('utf-8')
        d=docs.upload(self.c.id,'清册.csv',content,DocumentMeta(title='竣工设备清册'))
        for _ in range(100):
            time.sleep(.05)
            if docs.get(self.c.id,d['id'])['status']!='processing':break
        self.assertEqual(docs.get(self.c.id,d['id'])['status'],'ready')
        request=ImportMapping(table=0,target='assets',mapping={'id':'设备编号','name':'设备名称','kind':'设备类型','capacity':'额定功率','manufacturer':'厂家','power_factor':'功率因数'},expected_revision=1,operator='校核员')
        preview=docs.preview(self.c.id,d['id'],request);self.assertEqual(preview['error_count'],0);self.assertEqual(preview['candidate']['assets'][2]['capacity'],20)
        self.assertEqual(preview['candidate']['assets'][2]['nameplate']['power_factor'],.98)
        self.assertEqual(self.repo.get(self.c.id)['data']['assets'][2]['capacity'],16)
        docs.apply(self.c.id,d['id'],request);asset=self.repo.get(self.c.id)['data']['assets'][2]
        self.assertEqual(asset['capacity'],20);self.assertEqual(asset['source'],'document');self.assertEqual(asset['provenance']['sha256'],d['sha256'])
        with self.assertRaises(RuntimeError):docs.apply(self.c.id,d['id'],request)
    def test_unknown_site_values_and_import_slot_check(self):
        from backend.foundation import Center
        new=Center(id='DC-BLANK',code='BLANK',name='空白档案')
        self.assertIsNone(new.it_capacity_mw);self.assertIsNone(new.grid_short_circuit_mva)
        self.repo.save(SaveCenter(data=new));self.repo.publish(new.id,1,'测试员','资料尚未补全')
        with self.assertRaisesRegex(ValueError,'请补齐'):compile_request(JobRequest(engine='pypsa',data_center_ids=[new.id]),self.repo)
        self.save_server()
        docs=DocumentRepository(self.repo,self.ops,self.root/'docs-slots');self.addCleanup(docs.pool.shutdown,True)
        d=docs.upload(self.c.id,'servers.csv',b'id,rack_id,u_start,u_height,status\nS2,R-01,1,2,installed\n',DocumentMeta(title='服务器位置清册'))
        for _ in range(100):
            if docs.get(self.c.id,d['id'])['status']!='processing':break
            time.sleep(.05)
        fields=['id','rack_id','u_start','u_height','status']
        request=ImportMapping(target='servers',mapping={k:k for k in fields},expected_revision=1,expected_inventory_revision=1,operator='校核员')
        preview=docs.preview(self.c.id,d['id'],request);self.assertGreater(preview['error_count'],0);self.assertIn('U 位冲突',preview['errors'][0]['message'])
    def test_actual_file_extractors(self):
        from openpyxl import Workbook
        book=Workbook();book.active.append(['id','kind','capacity']);book.active.append(['R-02','rack',30]);xlsx=self.root/'清册.xlsx';book.save(xlsx)
        self.assertEqual(parse(xlsx)['tables'][0]['rows'][0]['capacity'],'30')
        import ifcopenshell
        model=ifcopenshell.file(schema='IFC4');unit=model.createIfcSIUnit(None,'LENGTHUNIT',None,'METRE');assignment=model.createIfcUnitAssignment([unit]);model.create_entity('IfcProject',GlobalId=ifcopenshell.guid.new(),UnitsInContext=assignment);model.create_entity('IfcTransformer',GlobalId=ifcopenshell.guid.new(),Name='Transformer',Tag='TX-IFC');path=self.root/'model.ifc';model.write(str(path))
        data=parse(path);self.assertEqual(data['tables'][0]['rows'][0]['id'],'TX-IFC');self.assertNotIn('capacity',data['tables'][0]['rows'][0])
        import ezdxf
        from ezdxf import units
        drawing=ezdxf.new();drawing.units=units.MM;block=drawing.blocks.new('RACK');block.add_attdef('id',(0,0));block.add_attdef('capacity',(0,1));drawing.modelspace().add_blockref('RACK',(1000,2000)).add_auto_attribs({'id':'R-DXF','capacity':'20'});dxf=self.root/'layout.dxf';drawing.saveas(dxf)
        row=parse(dxf)['tables'][0]['rows'][0];self.assertEqual(float(row['x']),1);self.assertEqual(float(row['z']),2)
        from pypdf import PdfWriter
        from pypdf.generic import NameObject,DictionaryObject,DecodedStreamObject
        writer=PdfWriter();page=writer.add_blank_page(width=600,height=800);font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')});page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})});stream=DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 50 700 Td (DEVICE-1 rack 20 kW) Tj ET');page[NameObject('/Contents')]=writer._add_object(stream);pdf=self.root/'drawing.pdf'
        with pdf.open('wb') as f:writer.write(f)
        self.assertIn('DEVICE-1',parse(pdf)['text'][0]['text'])
        raw={'system':{'Id':'Node1','SerialNumber':'SN1','Model':'ComputeNode'},'processors':[{'Id':'GPU0','ProcessorType':'GPU','Model':'GPU Model','MaxTDPWatts':700}]};snapshot=self.root/'redfish.json';snapshot.write_text(json.dumps(raw),encoding='utf-8');parsed=parse(snapshot)
        self.assertEqual(parsed['tables'][1]['rows'][0]['kind'],'gpu');self.assertEqual(parsed['tables'][0]['rows'][0]['status'],'unlocated')
    def test_http_upload_publication_and_isolation(self):
        from fastapi.testclient import TestClient
        from backend.api import app
        client=TestClient(app);data=center('DC-OP-API').model_dump()
        self.assertEqual(client.post('/api/simulation/data-centers',json={'data':data,'expected_revision':0}).status_code,200)
        self.assertEqual(client.post('/api/simulation/data-centers/DC-OP-API/publish',json={'expected_revision':1,'operator':'测试员','note':'测试发布','expected_inventory_revision':0}).status_code,200)
        upload=client.post('/api/simulation/data-centers/DC-OP-API/documents',files={'file':('test.csv',b'id,kind,capacity\nR-03,rack,20\n','text/csv')},data={'metadata':json.dumps({'title':'API 清册'})})
        self.assertEqual(upload.status_code,200,upload.text);id=upload.json()['id']
        for _ in range(100):
            docs=client.get('/api/simulation/data-centers/DC-OP-API/documents').json()['documents']
            if docs[0]['status']!='processing':break
            time.sleep(.05)
        self.assertEqual(docs[0]['status'],'ready',docs)
        self.assertEqual(client.get(f'/api/simulation/data-centers/DC-OP-API/documents/{id}/content').status_code,200)
        self.assertNotEqual(client.get(f'/api/simulation/data-centers/OTHER/documents/{id}/content').status_code,200)
        self.assertEqual(client.get('/api/simulation/data-centers/DC-OP-API/publication').json()['baseline']['version'],1)
        response=client.post('/api/simulation/jobs',json={'engine':'pandapower','data_center_ids':['DC-OP-API']})
        self.assertEqual(response.status_code,202,response.text);job=response.json();self.assertEqual(job['data_sources'][0]['baseline'],1)
        for _ in range(300):
            job=client.get('/api/simulation/jobs/'+job['id']).json()
            if job['status'] not in {'queued','running'}:break
            time.sleep(.1)
        self.assertEqual(job['status'],'succeeded',job)
        self.assertAlmostEqual(next(m['value'] for m in job['result']['metrics'] if m['key']=='served_mw'),.008,places=6)

if __name__=='__main__':unittest.main()
