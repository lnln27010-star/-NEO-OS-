import { Component, type ReactNode } from 'react'

export class SceneBoundary extends Component<{children:ReactNode}, {error:string}> {
  state={error:''}
  static getDerivedStateFromError(error:Error){return {error:error.message}}
  render(){
    if(this.state.error)return <div className="scene-module-loading" role="alert"><div><strong>场景暂时无法显示</strong><p>请重新加载场景资源后继续浏览。</p><button onClick={()=>window.location.reload()}>重新加载页面</button><details><summary>错误详情</summary>{this.state.error}</details></div></div>
    return this.props.children
  }
}
