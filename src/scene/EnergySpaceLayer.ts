import type { CustomLayerInterface, Map } from 'maplibre-gl'
export type EnergySpaceStyle='stars'|'galaxy'

/** A full-screen backdrop below the map's globe background, never above map data. */
export class EnergySpaceLayer implements CustomLayerInterface {
  id = 'energy-space-backdrop'
  type = 'custom' as const
  renderingMode = '2d' as const
  enabled = true
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private texture: WebGLTexture | null = null
  private vao: WebGLVertexArrayObject | null = null
  private ready = false
  private disposed = false
  private image: HTMLImageElement | null = null
  private hasTexture=false
  private uploadPending=false
  private attribute=0
  private sampler: WebGLUniformLocation|null=null
  private aspect: WebGLUniformLocation|null=null
  private imageReady: WebGLUniformLocation|null=null
  private gain:WebGLUniformLocation|null=null
  private owner:Map|null=null
  private backgroundStyle:EnergySpaceStyle='galaxy'
  private loadedStyle:EnergySpaceStyle='galaxy'
  private uploadedStyle:EnergySpaceStyle='galaxy'
  private cachedImages=new globalThis.Map<EnergySpaceStyle,HTMLImageElement>()

  setBackgroundStyle(style:EnergySpaceStyle) {
    if(style===this.backgroundStyle)return
    this.backgroundStyle=style
    if(this.owner&&this.ready)this.loadBackground(this.owner)
  }

  private loadBackground(map:Map) {
    const style=this.backgroundStyle
    const cached=this.cachedImages.get(style)
    if(cached){this.image=cached;this.loadedStyle=style;this.uploadPending=true;map.triggerRepaint();return}
    const image=new Image()
    image.onload=()=>{
      if(this.disposed)return
      this.cachedImages.set(style,image)
      if(this.backgroundStyle===style){this.image=image;this.loadedStyle=style;this.uploadPending=true;map.triggerRepaint()}
    }
    image.onerror=()=>{if(!this.disposed){console.warn('Space texture unavailable; retaining starfield');map.triggerRepaint()}}
    image.src=style==='galaxy'?'/textures/energy-galaxy-v1.webp':'/textures/energy-space-v1.webp'
  }

  onAdd(map: Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.owner=map
    this.disposed=false;this.ready=false;this.hasTexture=false;this.uploadPending=false
    const modern = typeof WebGL2RenderingContext!=='undefined' && gl instanceof WebGL2RenderingContext
    const vertex = modern ? '#version 300 es\nin vec2 position; out vec2 uv; void main(){ uv=(position+1.0)*0.5; gl_Position=vec4(position,0.0,1.0); }' : 'attribute vec2 position; varying vec2 uv; void main(){ uv=(position+1.0)*0.5; gl_Position=vec4(position,0.0,1.0); }'
    const fragment = `${modern ? '#version 300 es\n' : ''}precision mediump float; ${modern ? 'in' : 'varying'} vec2 uv; uniform sampler2D backdrop; uniform vec2 aspect; uniform float imageReady; uniform float imageGain; ${modern ? 'out vec4 pixel;' : ''} void main(){ vec2 p=uv; if(aspect.x>aspect.y) p.y=(p.y-.5)*aspect.y/aspect.x+.5; else p.x=(p.x-.5)*aspect.x/aspect.y+.5; vec3 color=${modern ? 'texture' : 'texture2D'}(backdrop,vec2(p.x,1.0-p.y)).rgb*imageReady; vec2 cell=uv*vec2(140.0,88.0); float h=fract(sin(dot(floor(cell),vec2(12.9898,78.233)))*437.585); float star=step(.987,h)*pow(max(0.0,1.0-length(fract(cell)-.5)*3.0),6.0); float edge=1.0-smoothstep(.1,.85,length(uv-.5)); ${modern ? 'pixel' : 'gl_FragColor'}=vec4(color*imageGain*(.82+edge*.18)+vec3(.009,.014,.023)+star*vec3(.36,.43,.52),1.0); }`
    const compile = (kind: number, code: string) => {
      const shader = gl.createShader(kind)!
      gl.shaderSource(shader, code); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error=gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`Space shader: ${error}`) }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment)
    this.program = gl.createProgram()!
    gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program)
    gl.deleteShader(vs); gl.deleteShader(fs)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('Space backdrop program failed to link')
    this.attribute=gl.getAttribLocation(this.program,'position')
    this.sampler=gl.getUniformLocation(this.program,'backdrop');this.aspect=gl.getUniformLocation(this.program,'aspect');this.imageReady=gl.getUniformLocation(this.program,'imageReady')
    this.gain=gl.getUniformLocation(this.program,'imageGain')
    if (modern) { this.vao=gl.createVertexArray(); gl.bindVertexArray(this.vao) }
    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
    if (modern) gl.bindVertexArray(null)
    gl.activeTexture(gl.TEXTURE0)
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]))
    this.ready=true
    this.loadBackground(map)
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    if(!this.enabled || !this.ready || !this.program) return
    const modern=typeof WebGL2RenderingContext!=='undefined' && gl instanceof WebGL2RenderingContext
    const previous={depth:gl.isEnabled(gl.DEPTH_TEST),cull:gl.isEnabled(gl.CULL_FACE),scissor:gl.isEnabled(gl.SCISSOR_TEST),stencil:gl.isEnabled(gl.STENCIL_TEST),program:gl.getParameter(gl.CURRENT_PROGRAM),activeTexture:gl.getParameter(gl.ACTIVE_TEXTURE),arrayBuffer:gl.getParameter(gl.ARRAY_BUFFER_BINDING),vao:modern?gl.getParameter(gl.VERTEX_ARRAY_BINDING):null}
    gl.activeTexture(gl.TEXTURE0)
    const oldTexture=gl.getParameter(gl.TEXTURE_BINDING_2D)
    gl.useProgram(this.program); gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.STENCIL_TEST)
    if(modern) gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer)
    const location=this.attribute
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.texture)
    if(this.uploadPending && this.image){const flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.image);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);this.uploadPending=false;this.hasTexture=true;this.uploadedStyle=this.loadedStyle}
    gl.uniform1i(this.sampler,0);gl.uniform1f(this.imageReady,this.hasTexture?1:0)
    gl.uniform1f(this.gain,this.uploadedStyle==='galaxy'?.46:.96)
    gl.uniform2f(this.aspect,gl.drawingBufferWidth/gl.drawingBufferHeight,(this.image?.width || 2048)/(this.image?.height || 1152))
    gl.drawArrays(gl.TRIANGLES,0,6)
    if(modern) gl.bindVertexArray(previous.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER,previous.arrayBuffer)
    gl.bindTexture(gl.TEXTURE_2D,oldTexture);gl.activeTexture(previous.activeTexture);gl.useProgram(previous.program)
    for(const [cap,on] of [[gl.DEPTH_TEST,previous.depth],[gl.CULL_FACE,previous.cull],[gl.SCISSOR_TEST,previous.scissor],[gl.STENCIL_TEST,previous.stencil]] as const)on?gl.enable(cap):gl.disable(cap)
  }

  onRemove(_map: Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.disposed=true;this.ready=false;this.uploadPending=false
    this.owner=null;this.cachedImages.clear()
    if(this.image) { this.image.onload=null;this.image.onerror=null }
    gl.deleteTexture(this.texture); gl.deleteBuffer(this.buffer); gl.deleteProgram(this.program)
    if(typeof WebGL2RenderingContext!=='undefined' && gl instanceof WebGL2RenderingContext) gl.deleteVertexArray(this.vao)
  }
}
