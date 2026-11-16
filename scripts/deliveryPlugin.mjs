import fs from 'node:fs'
import path from 'node:path'
import {gzipSync} from 'node:zlib'

function middleware(root) {
  return (req,res,next)=>{
    res.setHeader('X-Energy-Project','compute-power-twin-copy')
    const requestPath=req.url?.split('?')[0]
    if(requestPath==='/'||requestPath==='/index.html'){res.setHeader('Cache-Control','no-store');const html=path.join(root,'index.html');if(fs.existsSync(html)){res.setHeader('Content-Type','text/html; charset=utf-8');fs.createReadStream(html).pipe(res);return}}
    if(requestPath==='/__project') {res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');let version={};try{version=JSON.parse(fs.readFileSync(path.join(root,'build-version.json'),'utf8'))}catch{}res.end(JSON.stringify({project:'compute-power-twin-copy',port:4186,...version}));return}
    if(req.method!=='GET'||!req.headers['accept-encoding']?.includes('gzip'))return next()
    let file
    try{file=path.resolve(root,`.${decodeURIComponent(new URL(req.url??'/','http://localhost').pathname)}`)}catch{return next()}
    if(!file.startsWith(root+path.sep)||!fs.existsSync(`${file}.gz`))return next()
    const types={'.json':'application/json','.geojson':'application/geo+json','.glb':'model/gltf-binary','.hdr':'application/octet-stream','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}
    const type=types[path.extname(file)]
    if(!type)return next()
    const stat=fs.statSync(`${file}.gz`),etag=`"gzip-${stat.size}-${stat.mtimeMs}"`
    res.setHeader('ETag',etag);res.setHeader('Vary','Accept-Encoding')
    res.setHeader('Cache-Control',file.includes(`${path.sep}assets${path.sep}`)?'public,max-age=31536000,immutable':'no-cache')
    if(req.headers['if-none-match']===etag){res.statusCode=304;res.end();return}
    res.setHeader('Content-Type',type);res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',stat.size)
    fs.createReadStream(`${file}.gz`).pipe(res)
  }
}
export function deliveryPlugin(buildId) {
  const root=process.cwd()
  return {
    name:'energy-asset-delivery',
    generateBundle(){this.emitFile({type:'asset',fileName:'build-version.json',source:JSON.stringify({build:buildId,release:'7.0'})})},
    configureServer(server){server.middlewares.use(middleware(path.resolve(root,'public')))},
    configurePreviewServer(server){server.middlewares.use(middleware(path.resolve(root,'dist')))},
    closeBundle(){
      const assets=path.resolve(root,'dist/assets')
      if(!fs.existsSync(assets))return
      for(const name of fs.readdirSync(assets))if(/\.(m?js|css)$/.test(name)){const file=path.join(assets,name);fs.writeFileSync(`${file}.gz`,gzipSync(fs.readFileSync(file),{level:9}))}
    },
  }
}
