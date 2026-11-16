"""Extract explicit file content. No OCR, network access or inferred circuit topology."""
import csv
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

def safe_id(value,prefix):
    text=re.sub(r'[^A-Za-z0-9_-]','-',str(value or '')).strip('-')
    return (text[:52] if text else prefix)+'-'+hashlib.sha1(str(value).encode()).hexdigest()[:7]
def clean(value):
    if value is None:return ''
    if hasattr(value,'isoformat'):return value.isoformat()
    return str(value)[:1000]
def table(name,rows,suggested='assets'):
    columns=list(dict.fromkeys(k for row in rows for k in row))[:120]
    return {'name':name,'columns':columns,'rows':[{k:clean(v) for k,v in row.items() if k in columns} for row in rows[:10000]],'suggested':suggested}
def inspect_zip(path):
    with zipfile.ZipFile(path) as z:
        if len(z.infolist())>3000 or sum(i.file_size for i in z.infolist())>120_000_000:raise ValueError('工作簿展开后过大')

def parse(path:Path):
    ext=path.suffix.lower();tables=[];warnings=[];text=[]
    if ext=='.csv':
        content=path.read_text(encoding='utf-8-sig');reader=csv.DictReader(content.splitlines())
        if not reader.fieldnames or len(reader.fieldnames)>120 or len(set(reader.fieldnames))!=len(reader.fieldnames):raise ValueError('CSV 表头为空、重复或列数过多')
        rows=[]
        for row in reader:
            if None in row:raise ValueError('CSV 行列数不匹配')
            rows.append(row)
            if len(rows)>10000:raise ValueError('单表最多 10000 行，请拆分文件')
        tables.append(table('CSV 数据表',rows))
    elif ext=='.xlsx':
        inspect_zip(path)
        from openpyxl import load_workbook
        workbook=load_workbook(path,read_only=True,data_only=True,keep_links=False)
        try:
            for sheet in workbook.worksheets[:10]:
                if sheet.max_column and sheet.max_column>120:raise ValueError('工作表最多 120 列')
                iterator=sheet.iter_rows(values_only=True);headers=[clean(c).strip() for c in next(iterator,())]
                if not headers:continue
                if len(set(headers))!=len(headers) or any(not h for h in headers):warnings.append(sheet.title+' 表头包含空列或重名列，已跳过');continue
                rows=[]
                for i,row in enumerate(iterator):
                    if i>=10000:raise ValueError('单表最多 10000 行，请拆分文件')
                    if any(v is not None for v in row):rows.append(dict(zip(headers,row)))
                if rows:tables.append(table(sheet.title,rows))
        finally:workbook.close()
        warnings.append('仅读取已保存的单元格值；公式无缓存时保持空白，不执行公式或宏。')
    elif ext=='.ifc':
        import ifcopenshell
        import ifcopenshell.util.element as element_util
        import ifcopenshell.util.placement as placement_util
        import ifcopenshell.util.unit as unit_util
        model=ifcopenshell.open(str(path));scale=unit_util.calculate_unit_scale(model)
        mapping={'IfcTransformer':'transformer','IfcElectricDistributionBoard':'lv-panel','IfcElectricGenerator':'generator','IfcChiller':'chiller','IfcPump':'chw-pump','IfcAirToAirHeatRecovery':'crac','IfcCoolingTower':'cooling-tower','IfcPipeSegment':'pipe','IfcUnitaryEquipment':'crac'}
        rows=[];ids={}
        for obj in model.by_type('IfcElement'):
            kind=mapping.get(obj.is_a());name=str(obj.Name or '')
            if not kind and any(t in name.casefold() for t in ['rack','机柜']):kind='rack'
            if not kind:continue
            raw=getattr(obj,'Tag',None) or obj.GlobalId;id=raw if re.fullmatch(r'[A-Za-z0-9_-]{1,64}',str(raw)) else safe_id(raw,'IFC')
            if id in ids.values():id=safe_id(obj.GlobalId,'IFC')
            ids[obj.id()]=id
            row={'id':id,'name':name,'kind':kind,'ifc_guid':obj.GlobalId,'ifc_class':obj.is_a()}
            container=element_util.get_container(obj)
            if container:row['room']=container.Name or container.GlobalId
            if obj.ObjectPlacement:
                matrix=placement_util.get_local_placement(obj.ObjectPlacement);row.update(x=float(matrix[0,3])*scale,z=float(matrix[1,3])*scale)
            for pset,properties in element_util.get_psets(obj).items():
                for key,value in properties.items():
                    if key=='id' or isinstance(value,(dict,list)):continue
                    row[(pset+'.'+key)[:100]]=clean(value)
                    canonical={'manufacturer':'manufacturer','modelreference':'model','modelnumber':'model','serialnumber':'serial','capacity_kw':'capacity','powerfactor':'power_factor','rackunits':'rack_units','numberofrackunits':'rack_units'}.get(key.casefold())
                    if canonical:row[canonical]=clean(value)
            rows.append(row)
            if len(rows)>=5000:raise ValueError('机电设备超过 5000 项，请按建筑或专业拆分 IFC')
        tables.append(table('IFC 机电设备属性',rows))
        spaces=[]
        for obj in model.by_type('IfcSpace')[:1000]:spaces.append({'id':safe_id(obj.GlobalId,'SPACE'),'name':obj.LongName or obj.Name or obj.GlobalId,'ifc_guid':obj.GlobalId})
        if spaces:tables.append(table('IFC 空间',spaces,'spaces'))
        owners={}
        for rel in model.by_type('IfcRelConnectsPortToElement'):owners[rel.RelatingPort.id()]=rel.RelatedElement
        for rel in model.by_type('IfcRelNests'):
            for obj in rel.RelatedObjects:
                if obj.is_a('IfcDistributionPort'):owners[obj.id()]=rel.RelatingObject
        links=[]
        for rel in model.by_type('IfcRelConnectsPorts'):
            src=owners.get(rel.RelatingPort.id());dst=owners.get(rel.RelatedPort.id())
            if not src or not dst or src.id() not in ids or dst.id() not in ids:continue
            links.append({'id':safe_id(rel.GlobalId,'LINK'),'source':ids[src.id()],'target':ids[dst.id()],'port_name':rel.RelatedPort.Name or '', 'ifc_guid':rel.GlobalId})
        if links:tables.append(table('IFC 显式端口连接',links,'cables'))
        warnings.append('只提取源模型已有属性和显式端口关系；容量、端口含义和局部坐标需审核，不由邻近位置推断接线。')
    elif ext=='.dxf':
        import ezdxf
        from ezdxf import units
        drawing=ezdxf.readfile(path);factor=units.conversion_factor(drawing.units,units.M) if drawing.units else None
        rows=[];texts=[]
        for entity in drawing.modelspace():
            if entity.dxftype()=='INSERT':
                row={'block':entity.dxf.name,'layer':entity.dxf.layer,'drawing_x':entity.dxf.insert.x,'drawing_y':entity.dxf.insert.y,'entity_handle':entity.dxf.handle}
                row.update({a.dxf.tag:a.dxf.text for a in entity.attribs})
                if factor:row.update(x=entity.dxf.insert.x*factor,z=entity.dxf.insert.y*factor)
                rows.append(row)
            elif entity.dxftype() in {'TEXT','MTEXT'}:texts.append({'text':entity.dxf.text if entity.dxftype()=='TEXT' else entity.plain_text(),'layer':entity.dxf.layer,'entity_handle':entity.dxf.handle})
            if len(rows)+len(texts)>10000:raise ValueError('DXF 实体过多，请按机房或专业拆分')
        if rows:tables.append(table('DXF 块属性',rows))
        if texts:tables.append(table('DXF 文字',texts))
        warnings.append('未从普通线段自动推定电气拓扑；无单位声明时只保留原始坐标。')
    elif ext=='.pdf':
        from pypdf import PdfReader
        reader=PdfReader(path)
        if reader.is_encrypted:raise ValueError('请先导出无密码 PDF')
        if len(reader.pages)>150:raise ValueError('PDF 超过 150 页，请按专业拆分')
        for page_num,page in enumerate(reader.pages):
            content=(page.extract_text(extraction_mode='layout') or '')[:30000]
            if content.strip():text.append({'page':page_num+1,'text':content})
            lines=content.splitlines()
            for index,line in enumerate(lines):
                headers=re.split(r'\s{2,}|\t+',line.strip())
                if len(headers)<2 or len(headers)>25 or not any(h in {'id','编号','设备编号','设备名称','名称','source','上游设备'} for h in headers):continue
                rows=[]
                for following in lines[index+1:]:
                    values=re.split(r'\s{2,}|\t+',following.strip())
                    if len(values)!=len(headers):break
                    rows.append({**dict(zip(headers,values)),'source_page':page_num+1})
                if rows:tables.append(table('PDF 第 '+str(page_num+1)+' 页表格',rows))
                break
            if sum(len(t['text']) for t in text)>150000:break
        warnings.append('PDF 提取范围为可读取文字和规则表格；扫描页不做 OCR，不自动确认符号和连线。')
        if not text:warnings.append('未检测到可读取文字；原文件已保留，需人工录入或另行 OCR。')
    elif ext=='.json':
        raw=json.loads(path.read_text(encoding='utf-8-sig'))
        if isinstance(raw,list):tables.append(table('JSON 记录',raw))
        elif isinstance(raw,dict) and isinstance(raw.get('system'),dict):
            s=raw['system'];server_id=safe_id(s.get('SerialNumber') or s.get('Id'),'SERVER')
            tables.append(table('Redfish 系统快照',[{'id':server_id,'name':s.get('Name',''),'manufacturer':s.get('Manufacturer',''),'model':s.get('Model',''),'serial':s.get('SerialNumber',''),'reference':s.get('@odata.id',''),'status':'unlocated'}],'servers'))
            components=[]
            for group,kind in [('processors','cpu'),('memory','memory'),('drives','disk'),('network','nic')]:
                for p in raw.get(group,[])[:500]:
                    if not isinstance(p,dict):continue
                    components.append({'id':safe_id(server_id+'-'+str(p.get('Id') or p.get('SerialNumber')),kind.upper()),'server_id':server_id,'kind':'gpu' if p.get('ProcessorType')=='GPU' else kind,'slot':p.get('Socket') or p.get('Id') or '', 'manufacturer':p.get('Manufacturer',''),'model':p.get('Model',''),'serial':p.get('SerialNumber',''),'status':'unlocated','rated_w':p.get('MaxTDPWatts',''),'reference':p.get('@odata.id','')})
            if components:tables.append(table('Redfish 部件快照',components,'components'))
            warnings.append('只读取文件内已有资源，不跟随 @odata 链接访问服务器；待定位配置需补充机柜和槽位并审核。')
        elif isinstance(raw,dict) and isinstance(raw.get('rows'),list):tables.append(table('JSON rows',raw['rows']))
        else:raise ValueError('JSON 应为记录数组、rows 数组或包含 system 的 Redfish 快照包')
    else:warnings.append('当前格式仅保留原文件；DWG 请导出 DXF/IFC，图片或扫描件需另行识别。')
    return {'tables':tables[:20],'text':text,'warnings':warnings,'extractor':'aidc-explicit-content-v1'}

if __name__=='__main__':
    path=Path(sys.argv[1]);output=Path(sys.argv[2])
    try:output.write_text(json.dumps(parse(path),ensure_ascii=False,allow_nan=False),encoding='utf-8')
    except Exception as e:output.write_text(json.dumps({'error':str(e)},ensure_ascii=False),encoding='utf-8');raise
