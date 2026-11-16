import tempfile
import unittest
from pathlib import Path

from backend.foundation import Asset,Center,CenterRepository,SaveCenter
from backend.work_orders import OrderAction,OrderCreate,WorkOrderRepository
from fastapi.testclient import TestClient
from backend import api


class WorkOrderTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.centers=CenterRepository(Path(self.directory.name)/'foundation.sqlite3')
        self.centers.save(SaveCenter(data=Center(id='DC1',code='DC1',name='测试中心',assets=[Asset(id='UPS1',kind='ups')])))
        self.orders=WorkOrderRepository(self.centers)

    def test_audited_lifecycle_and_revision_conflict(self):
        order=self.orders.create('DC1',OrderCreate(asset_id='UPS1',summary='UPS 输出异常',evidence='现场巡检记录 2026-11-02',owner='运维甲',severity='high'))
        self.assertEqual(order['status'],'reported')
        with self.assertRaises(ValueError):self.orders.create('DC1',OrderCreate(asset_id='UNKNOWN',summary='UPS 输出异常',evidence='现场巡检记录 2026-11-02',owner='运维甲'))
        started=self.orders.act('DC1',order['id'],OrderAction(expected_revision=1,action='start',operator='运维甲',evidence='已隔离并核对负载'))
        with self.assertRaises(RuntimeError):self.orders.act('DC1',order['id'],OrderAction(expected_revision=1,action='request-review',operator='运维甲',evidence='已更换模块并复测'))
        review=self.orders.act('DC1',order['id'],OrderAction(expected_revision=started['revision'],action='request-review',operator='运维甲',evidence='已更换模块并复测'))
        with self.assertRaises(ValueError):self.orders.act('DC1',order['id'],OrderAction(expected_revision=review['revision'],action='close',operator='运维甲',evidence='复核通过'))
        closed=self.orders.act('DC1',order['id'],OrderAction(expected_revision=review['revision'],action='close',operator='复核乙',evidence='现场测得输出正常'))
        self.assertEqual(closed['status'],'closed')
        self.assertEqual(len(closed['events']),4)
        self.assertEqual(len(self.orders.list('DC1')),1)
        with self.centers.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit WHERE center_id='DC1' AND action LIKE 'work-order-%'").fetchone()[0],4)

    def test_http_contract_uses_registered_assets(self):
        original_centers,original_orders=api.centers,api.work_orders
        api.centers,api.work_orders=self.centers,self.orders
        try:
            client=TestClient(api.app)
            assets=client.get('/api/platform/centers/DC1/work-order-assets')
            self.assertEqual(assets.status_code,200)
            self.assertEqual(assets.json()['assets'][0]['id'],'UPS1')
            created=client.post('/api/platform/centers/DC1/work-orders',json={'asset_id':'UPS1','summary':'UPS 输出异常','evidence':'现场巡检记录 2026-11-02','owner':'运维甲','severity':'high'})
            self.assertEqual(created.status_code,201)
            order=created.json()
            self.assertEqual(client.get('/api/platform/centers/DC1/work-orders').json()['orders'][0]['id'],order['id'])
            updated=client.post(f"/api/platform/centers/DC1/work-orders/{order['id']}/actions",json={'expected_revision':1,'action':'start','operator':'运维甲','evidence':'已隔离并核对负载'})
            self.assertEqual(updated.status_code,200)
            self.assertEqual(updated.json()['status'],'in_progress')
        finally:api.centers,api.work_orders=original_centers,original_orders


if __name__=='__main__':unittest.main()
