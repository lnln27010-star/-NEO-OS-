import unittest

from backend.platform_diagnostics import power_topology,dispatch_readiness,model_coverage


class PowerTopologyTests(unittest.TestCase):
    def test_shared_pdu_is_not_counted_as_redundant(self):
        assets=[{'id':'R1','kind':'rack','installed':True,'enabled':True,'source':'model'},
                {'id':'PDU1','kind':'pdu','source':'model'},
                {'id':'TX1','kind':'transformer','source':'manual'},
                {'id':'TX2','kind':'transformer','source':'manual'}]
        cables=[{'source':'PDU1','target':'R1','port':lane,'in_service':True} for lane in ('powerA','powerB')]
        cables += [{'source':'TX1','target':'PDU1','port':'powerA','in_service':True},
                   {'source':'TX2','target':'PDU1','port':'powerB','in_service':True}]
        result=power_topology({'id':'DC1','name':'站点','assets':assets,'cables':cables},2,None)
        self.assertEqual(result['counts'],{'separate':0,'shared':1,'missing':0})
        self.assertEqual(result['rows'][0]['shared_node'],'PDU1')
        self.assertEqual(result['rows'][0]['source'],'待现场核实')

    def test_independent_paths_and_missing_input(self):
        assets=[{'id':'R1','kind':'rack','installed':True,'enabled':True,'source':'manual'},
                {'id':'R2','kind':'rack','installed':True,'enabled':True,'source':'manual'},
                {'id':'PA','kind':'pdu','source':'manual'},
                {'id':'PB','kind':'pdu','source':'manual'},
                {'id':'TA','kind':'transformer','source':'manual'},
                {'id':'TB','kind':'transformer','source':'manual'}]
        def edge(source,target,port):return {'source':source,'target':target,'port':port,'in_service':True}
        cables=[edge('PA','R1','powerA'),edge('PB','R1','powerB'),edge('TA','PA','powerA'),edge('TB','PB','powerB'),edge('PA','R2','powerA')]
        result=power_topology({'id':'DC1','name':'站点','assets':assets,'cables':cables},3,{'version':1})
        self.assertEqual(result['counts'],{'separate':1,'shared':0,'missing':1})
        self.assertEqual(result['rows'][0]['path_a'],['R1','PA','TA'])
        self.assertEqual(result['rows'][0]['path_b'],['R1','PB','TB'])
        self.assertIn('powerB 未接线',result['rows'][1]['issues'])

    def test_dispatch_readiness_names_missing_inputs_and_stale_draft(self):
        data={'id':'DC1','name':'站点','source':'model','it_capacity_mw':12,'grid_capacity_mw':18,'pue':1.3,'solar_mw':0,'battery_mwh':0,'battery_mw':0,'hourly':[{'price':None,'it_kw':None,'solar_kw':0} for _ in range(24)]}
        draft=dispatch_readiness(data,None,3,3)
        self.assertFalse(draft['can_run'])
        self.assertEqual({row['key']:row['missing'] for row in draft['checks']}['price'],24)
        data['hourly']=[{'price':.6,'it_kw':1000,'solar_kw':0} for _ in range(24)]
        published=dispatch_readiness(data,{'version':2},4,3)
        self.assertTrue(published['can_run'])
        self.assertTrue(any('草稿修订' in warning for warning in published['warnings']))

    def test_model_coverage_does_not_call_model_fields_verified(self):
        data={'id':'DC1','name':'站点','assets':[{'id':'R1','kind':'rack','installed':True,'enabled':True,'source':'model','manufacturer':'','model':'','measured_kw':None,'load_profile_kw':None,'position_verified':False}], 'cables':[{'port':'powerA','in_service':True,'length_m':None,'r_ohm_km':None,'x_ohm_km':None,'max_i_ka':None}],'hourly':[{'price':None,'it_kw':None} for _ in range(24)],'spaces':[]}
        result=model_coverage(data,1,None,0,0,0)
        self.assertEqual(result['sources']['model'],1)
        self.assertTrue(all(check['complete']==0 for check in result['checks']))


if __name__=='__main__':unittest.main()
