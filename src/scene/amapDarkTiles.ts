import * as maplibregl from 'maplibre-gl'
const recentTiles=new Map<string,ArrayBuffer>()
let diskCache: Promise<Cache|null>|undefined
const getDiskCache=()=>diskCache??=typeof caches==='undefined'?Promise.resolve(null):caches.open('energy-basemap-v3').catch(()=>null)

/** Recolor only AMap road tiles; infrastructure, selection and price layers stay intact. */
export function registerAmapDarkProtocol() {
  maplibregl.addProtocol('amap-dark', async (request, controller) => {
    const match = request.url.match(/^amap-dark:\/\/tiles\/(black|blueblack)\/(\d+)\/(\d+)\/(\d+)$/)
    if (!match) throw new Error('Invalid AMap tile coordinates')
    const [,tone,z,x,y] = match
    const key=`${tone}/${z}/${x}/${y}`
    const cached=recentTiles.get(key)
    if(cached){recentTiles.delete(key);recentTiles.set(key,cached);return {data:cached.slice(0)}}
    const disk=await getDiskCache()
    const cacheUrl=new URL(`/__energy_tiles/v3/${key}.png`,location.origin).href
    const hit=await disk?.match(cacheUrl).catch(()=>undefined)
    if(hit){const data=await hit.arrayBuffer();recentTiles.set(key,data);if(recentTiles.size>128)recentTiles.delete(recentTiles.keys().next().value!);return {data:data.slice(0)}}
    const response = await fetch(`https://webrd0${Number(x)%4+1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`AMap tile ${response.status}`)
    const bitmap = await createImageBitmap(await response.blob())
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(bitmap,0,0)
      const image = ctx.getImageData(0,0,bitmap.width,bitmap.height)
      for(let i=0;i<image.data.length;i+=4) {
        const r=image.data[i],g=image.data[i+1],b=image.data[i+2]
        if(b-r>18 && b-g>8) { image.data[i]=8;image.data[i+1]=tone==='blueblack'?20:14;image.data[i+2]=tone==='blueblack'?36:21; continue }
        const light=10+(255-(r*.2126+g*.7152+b*.0722))*.58
        image.data[i]=tone==='blueblack'?light*.72+3:light*.94; image.data[i+1]=tone==='blueblack'?light*.95+6:light*1.02; image.data[i+2]=tone==='blueblack'?light*1.3+9:light*1.13
      }
      ctx.putImageData(image,0,0)
      const blob=await canvas.convertToBlob({type:'image/png'})
      const data=await blob.arrayBuffer()
      recentTiles.set(key,data);if(recentTiles.size>128)recentTiles.delete(recentTiles.keys().next().value!)
      void disk?.put(cacheUrl,new Response(data.slice(0),{headers:{'Content-Type':'image/png'}})).catch(()=>{})
      return { data:data.slice(0) }
    } finally { bitmap.close() }
  })
}
