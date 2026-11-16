import {useEffect,useRef,useState} from 'react'
import {useVisualTheme} from '../useVisualTheme'
import './national-opportunity-map.css'

export type ParkPoi={id:string;name:string;address:string;city:string;province:string;longitude:number;latitude:number}
export type MapProvince={name:string;longitude:number;latitude:number;price:number|null;solar:number|null;wind:number|null;demand:number|null;policy:string|null;score:number|null}
export type MapMetric='price'|'solar'|'wind'|'demand'|'policy'|'score'|'readiness'

const key=import.meta.env.VITE_AMAP_KEY as string|undefined
const securityCode=import.meta.env.VITE_AMAP_SECURITY_CODE as string|undefined
let sdkPromise:Promise<any>|undefined
let provinceGeoPromise:Promise<any>|undefined

function loadAmap(){
  if(window.AMap)return Promise.resolve(window.AMap)
  if(!key)return Promise.reject(Error('未配置高德地图 Key'))
  if(sdkPromise)return sdkPromise
  sdkPromise=new Promise<any>((resolve,reject)=>{
    if(securityCode)window._AMapSecurityConfig={securityJsCode:securityCode}
    const script=document.createElement('script')
    script.src=`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.PlaceSearch,AMap.MarkerCluster`
    script.async=true
    script.onload=()=>window.AMap?resolve(window.AMap):reject(Error('高德地图组件未返回'))
    script.onerror=()=>reject(Error('高德地图加载失败'))
    document.head.appendChild(script)
  }).catch(error=>{sdkPromise=undefined;throw error})
  return sdkPromise
}

function loadProvinceGeo(){
  if(!provinceGeoPromise)provinceGeoPromise=fetch('/data/china-provinces.geojson').then(response=>{
    if(!response.ok)throw Error(`省界数据 ${response.status}`)
    return response.json()
  })
  return provinceGeoPromise
}

const format=(value:number|null,digits=1)=>value===null?'—':value.toFixed(digits)
function valueFor(item:MapProvince,metric:MapMetric){
  if(metric==='price')return `${format(item.price,3)} 元/kWh`
  if(metric==='solar')return `${format(item.solar)} kWh/m²`
  if(metric==='wind')return `${format(item.wind)} m/s`
  if(metric==='demand')return item.demand===null?'需求待核实':`${format(item.demand)} MW`
  if(metric==='policy')return item.policy??'非枢纽'
  if(metric==='readiness')return item.score===null?'证据待核实':`${format(item.score,0)} 分`
  return item.score===null?'综合待证':`${format(item.score,0)} 分`
}

function metricValue(item:MapProvince,metric:MapMetric){
  if(metric==='price')return item.price===null?null:1/(item.price+.001)
  if(metric==='solar')return item.solar
  if(metric==='wind')return item.wind
  if(metric==='demand')return item.demand
  if(metric==='policy')return item.policy?1:null
  return item.score
}

function convert(AMap:any,rows:MapProvince[]):Promise<Map<string,[number,number]>>{
  return new Promise(resolve=>{
    const coords=rows.map(row=>[row.longitude,row.latitude])
    AMap.convertFrom(coords,'gps',(status:string,result:any)=>{
      const locations=status==='complete'&&Array.isArray(result?.locations)?result.locations:[]
      resolve(new Map(rows.map((row,index)=>{
        const place=locations[index]
        return [row.name,place?[place.getLng(),place.getLat()] as [number,number]:[row.longitude,row.latitude] as [number,number]]
      })))
    })
  })
}

function featurePolygons(feature:any){
  const coordinates=feature?.geometry?.coordinates??[]
  return feature?.geometry?.type==='Polygon'?[coordinates]:feature?.geometry?.type==='MultiPolygon'?coordinates:[]
}

export function NationalOpportunityMap({provinces,metric,selected,focusProvince,parkSearchToken,parkSearchRegion,onSelectProvince,onParksLoaded,onParkSelect}:{provinces:MapProvince[];metric:MapMetric;selected:string;focusProvince:string;parkSearchToken:number;parkSearchRegion:string;onSelectProvince:(province:string)=>void;onParksLoaded:(parks:ParkPoi[],error?:string)=>void;onParkSelect:(park:ParkPoi)=>void}){
  const node=useRef<HTMLDivElement>(null)
  const mapRef=useRef<any>(null)
  const amapRef=useRef<any>(null)
  const coordsRef=useRef<Map<string,[number,number]>>(new Map())
  const provinceMarkers=useRef<any[]>([])
  const provincePolygons=useRef<any[]>([])
  const parkMarkers=useRef<any[]>([])
  const parkCluster=useRef<any>(null)
  const parkInfo=useRef<any>(null)
  const theme=useVisualTheme(state=>state.theme)
  const tone=useVisualTheme(state=>state.basemapTone)
  const [status,setStatus]=useState('高德地图加载中')

  useEffect(()=>{
    let active=true
    loadAmap().then(AMap=>{
      if(!active||!node.current)return
      amapRef.current=AMap
      const map=new AMap.Map(node.current,{center:[104,35],zoom:4.2,minZoom:3,maxZoom:18,viewMode:'2D',mapStyle:theme==='dark'?(tone==='blueblack'?'amap://styles/darkblue':'amap://styles/dark'):'amap://styles/normal',features:['bg','road','point']})
      mapRef.current=map
      const updateZoom=()=>node.current?.classList.toggle('is-zoomed',map.getZoom()>=5.5)
      map.on('zoomend',updateZoom)
      updateZoom()
      map.on('complete',()=>{if(active)setStatus('')})
      map.on('error',()=>{if(active)setStatus('底图加载失败')})
    }).catch(error=>{if(active)setStatus(String(error.message??error))})
    return()=>{
      active=false
      provinceMarkers.current.forEach(marker=>marker.setMap(null))
      provincePolygons.current.forEach(polygon=>polygon.setMap(null))
      parkCluster.current?.setMap(null)
      parkInfo.current?.close()
      parkMarkers.current.forEach(marker=>marker.setMap(null))
      mapRef.current?.destroy()
      mapRef.current=null
    }
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(map)map.setMapStyle(theme==='dark'?(tone==='blueblack'?'amap://styles/darkblue':'amap://styles/dark'):'amap://styles/normal')
  },[theme,tone])

  useEffect(()=>{
    const map=mapRef.current,AMap=amapRef.current
    if(!map||!AMap||!provinces.length)return
    let active=true
    Promise.all([convert(AMap,provinces),loadProvinceGeo()]).then(([coords,geo])=>{
      if(!active)return
      coordsRef.current=coords
      const values=provinces.map(row=>metricValue(row,metric)).filter((value):value is number=>value!==null&&Number.isFinite(value))
      const low=Math.min(...values),high=Math.max(...values)
      const rowByName=new Map(provinces.map(row=>[row.name,row]))
      const appearance=(row:MapProvince)=>{
        const value=metricValue(row,metric)
        if(value===null||!Number.isFinite(value))return {fill:'#274052',stroke:'#587184',opacity:.08}
        const ratio=high===low ? .55 : Math.max(0,Math.min(1,(value-low)/(high-low)))
        const stops=['#245c99','#277f9d','#2ca58d','#9cbd62','#e3b344','#e46b43']
        const color=stops[Math.min(stops.length-1,Math.floor(ratio*stops.length))]
        return {fill:color,stroke:color,opacity:.22+ratio*.27}
      }

      provincePolygons.current.forEach(polygon=>polygon.setMap(null))
      provincePolygons.current=[]
      for(const feature of geo.features??[]){
        const name=String(feature?.properties?.name??'')
        const row=rowByName.get(name)
        if(!row)continue
        const style=appearance(row)
        for(const path of featurePolygons(feature)){
          const polygon=new AMap.Polygon({path,fillColor:style.fill,fillOpacity:style.opacity,strokeColor:row.name===selected?'#d6fff5':style.stroke,strokeOpacity:row.name===selected ? .95 : .5,strokeWeight:row.name===selected?2.2:1.1,zIndex:row.name===selected?45:30,bubble:true})
          polygon.on('click',()=>onSelectProvince(row.name))
          polygon.setMap(map)
          provincePolygons.current.push(polygon)
        }
      }

      provinceMarkers.current.forEach(marker=>marker.setMap(null))
      provinceMarkers.current=provinces.filter(row=>coords.has(row.name)).map(row=>{
        const element=document.createElement('button')
        element.type='button'
        element.className=`no-map-pin${row.name===selected?' is-selected':''}`
        element.title=`${row.name} · ${valueFor(row,metric)}`
        const dot=document.createElement('i'),label=document.createElement('span'),value=document.createElement('b')
        label.textContent=row.name.replace(/省$|市$|自治区$|维吾尔|壮族|回族/g,'')
        value.textContent=valueFor(row,metric)
        element.append(dot,label,value)
        element.addEventListener('click',()=>onSelectProvince(row.name))
        const marker=new AMap.Marker({position:coords.get(row.name),content:element,anchor:'center',zIndex:row.name===selected?160:100})
        marker.setMap(map)
        return marker
      })
    }).catch(()=>{if(active)setStatus('省域热力图加载失败')})
    return()=>{active=false}
  },[provinces,metric,selected,onSelectProvince,status])

  useEffect(()=>{
    const map=mapRef.current,coord=coordsRef.current.get(focusProvince)
    if(map&&coord&&focusProvince)map.setZoomAndCenter(5.8,coord)
  },[focusProvince])

  useEffect(()=>{
    if(!parkSearchToken||!parkSearchRegion)return
    let active=true
    const AMap=amapRef.current,map=mapRef.current
    if(!AMap||!map)return
    AMap.plugin(['AMap.PlaceSearch','AMap.MarkerCluster'],()=>{
      if(!active)return
      const queries=['产业园区','工业园区','经济技术开发区','高新技术产业开发区']
      loadProvinceGeo().then(geo=>{
        const feature=(geo.features??[]).find((item:any)=>item?.properties?.name===parkSearchRegion)
        const city=String(feature?.properties?.adcode??parkSearchRegion)
        return Promise.all(queries.map(word=>new Promise<any[]>(resolve=>{
          const search=new AMap.PlaceSearch({city,citylimit:true,pageSize:30,pageIndex:1,extensions:'base',autoFitView:false})
          search.search(word,(state:string,result:any)=>resolve(state==='complete'?result?.poiList?.pois??[]:[]))
        })))
      }).then(groups=>{
        if(!active)return
        const dedupe=new Map<string,ParkPoi>()
        for(const poi of groups.flat()){
          const province=String(poi.pname??poi.province??'')
          if(province&&province!==parkSearchRegion)continue
          const location=poi.location
          if(!location)continue
          const lng=typeof location.getLng==='function'?location.getLng():location.lng,lat=typeof location.getLat==='function'?location.getLat():location.lat
          if(!Number.isFinite(lng)||!Number.isFinite(lat))continue
          const item:ParkPoi={id:String(poi.id??`${poi.name}-${lng}`),name:String(poi.name??'园区'),address:String(poi.address??''),city:String(poi.cityname??''),province:parkSearchRegion,longitude:lng,latitude:lat}
          dedupe.set(item.id,item)
        }
        const parks=[...dedupe.values()].slice(0,60)
        parkCluster.current?.setMap(null)
        parkMarkers.current.forEach(marker=>marker.setMap(null))
        parkMarkers.current=[]
        const points=parks.map(park=>({lnglat:[park.longitude,park.latitude],weight:1,park}))
        if(points.length){try{parkCluster.current=new AMap.MarkerCluster(map,points,{gridSize:82,maxZoom:10,renderClusterMarker:(context:any)=>{const element=document.createElement('button');element.type='button';element.className='no-park-cluster';element.title=`附近 ${context.count} 个园区，点击放大`;element.innerHTML=`<span class="no-park-factory"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V10l6 3V9l6 3V5h4v16H3Z"/><path d="M7 21v-4h3v4m4-4h3v4"/></svg></span><b>${context.count}</b>`;element.addEventListener('click',event=>{event.stopPropagation();const position=context.marker.getPosition();map.setZoomAndCenter(Math.min(11,map.getZoom()+2.6),position)});context.marker.setContent(element);context.marker.setOffset(new AMap.Pixel(-16,-16))},renderMarker:(context:any)=>{const point=Array.isArray(context.data)?context.data[0]:context.data,park=point?.park as ParkPoi|undefined;const element=document.createElement('button');element.className='no-park-pin';element.type='button';element.title=park?.name??'工业园区';element.innerHTML='<span class="no-park-factory"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V10l6 3V9l6 3V5h4v16H3Z"/><path d="M7 21v-4h3v4m4-4h3v4"/></svg></span>';if(park)element.addEventListener('click',event=>{event.stopPropagation();onParkSelect(park);const card=document.createElement('div');card.className='no-park-info';const name=document.createElement('strong'),address=document.createElement('span');name.textContent=park.name;address.textContent=[park.city,park.address].filter(Boolean).join(' · ')||'地址待补充';card.append(name,address);parkInfo.current?.close();parkInfo.current=new AMap.InfoWindow({content:card,offset:new AMap.Pixel(0,-18),anchor:'bottom-center'});parkInfo.current.open(map,[park.longitude,park.latitude]);map.setCenter([park.longitude,park.latitude])});context.marker.setContent(element);context.marker.setOffset(new AMap.Pixel(-12,-12))}})}catch{parkCluster.current=null;const coord=coordsRef.current.get(parkSearchRegion);if(coord){const element=document.createElement('button');element.type='button';element.className='no-park-cluster';element.title=`${parkSearchRegion}共检索到 ${parks.length} 个园区`;element.innerHTML=`<span class="no-park-factory"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V10l6 3V9l6 3V5h4v16H3Z"/></svg></span><b>${parks.length}</b>`;const marker=new AMap.Marker({position:coord,content:element,anchor:'center',zIndex:180});marker.setMap(map);parkMarkers.current=[marker]}}}
        onParksLoaded(parks,parks.length?'':'未检索到园区 POI')
      }).catch(()=>onParksLoaded([],'园区检索失败'))
    })
    return()=>{active=false}
  },[parkSearchToken,parkSearchRegion,onParksLoaded,onParkSelect,status])

  return <div className="no-amap"><div ref={node} className="no-amap-canvas" aria-label="高德中国地图"/>{status&&<div className="no-amap-status" role="status">{status}</div>}<div className="no-amap-credit">高德底图 · 省域分级热力 · 园区 POI</div></div>
}
