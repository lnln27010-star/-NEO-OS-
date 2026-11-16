"""Snapshot NASA POWER climatology at 31 provincial representative points."""
import json
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FEATURES=json.loads((ROOT/'public/data/china-provinces.geojson').read_text(encoding='utf-8'))['features']
PROVINCES=[feature for feature in FEATURES if feature.get('properties',{}).get('adcode',0) in {
    110000,120000,130000,140000,150000,210000,220000,230000,310000,320000,330000,340000,
    350000,360000,370000,410000,420000,430000,440000,450000,460000,500000,510000,520000,
    530000,540000,610000,620000,630000,640000,650000,
}]
API='https://power.larc.nasa.gov/api/temporal/climatology/point'


def fetch(feature):
    props=feature['properties']
    longitude,latitude=props.get('centroid') or props['center']
    query=urllib.parse.urlencode({'parameters':'ALLSKY_SFC_SW_DWN,WS50M,T2M','community':'RE','longitude':longitude,'latitude':latitude,'format':'JSON'})
    url=API+'?'+query
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url,timeout=30) as response:
                data=json.load(response)
            values=data['properties']['parameter']
            header=data['header']
            result={'province':props['name'],'longitude':longitude,'latitude':latitude,'solar_kwh_m2_day':values['ALLSKY_SFC_SW_DWN']['ANN'],'wind_50m_m_s':values['WS50M']['ANN'],'temperature_c':values['T2M']['ANN'],'summer_c':round((values['T2M']['JUL']+values['T2M']['AUG'])/2,2),'solar_months':{month:value for month,value in values['ALLSKY_SFC_SW_DWN'].items() if month!='ANN'},'wind_months':{month:value for month,value in values['WS50M'].items() if month!='ANN'},'source_url':url,'source_range':header['range']}
            if any(result[key]<=-900 for key in ('solar_kwh_m2_day','wind_50m_m_s','temperature_c','summer_c')):raise ValueError('fill value in response')
            return result
        except Exception:
            if attempt==2:raise
            time.sleep(2**attempt)


def main():
    if len(PROVINCES)!=31:raise RuntimeError(f'Expected 31 provinces, got {len(PROVINCES)}')
    rows=[]
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures={pool.submit(fetch,feature):feature['properties']['name'] for feature in PROVINCES}
        for future in as_completed(futures):
            row=future.result()
            rows.append(row)
            print(row['province'],row['solar_kwh_m2_day'],row['wind_50m_m_s'])
    rows.sort(key=lambda row:next(i for i,feature in enumerate(PROVINCES) if feature['properties']['name']==row['province']))
    output={'source':'NASA POWER Climatology API','period':rows[0]['source_range'],'scope':'31个省级行政区的GeoJSON代表点；点值不代表全省平均或具体场址','rows':rows}
    target=ROOT/'public/data/planning-climate.json'
    target.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('saved',target,len(rows))


if __name__=='__main__':main()
