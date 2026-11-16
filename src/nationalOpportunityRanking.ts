export type RankDimension='overall'|'economics'|'demand'|'resource'|'readiness'
export type RankInput={key:string;province:string;city:string;price:number|null;solar:number|null;wind:number|null;summer:number|null;contractMw:number|null;verifiedGates:number|null;blocked:boolean}
export type RankWeights={economics:number;demand:number;resource:number;readiness:number}
export const DEFAULT_WEIGHTS:RankWeights={economics:35,demand:30,resource:15,readiness:20}
export type RankedRegion=RankInput&{scores:{economics:number|null;demand:number|null;resource:number|null;readiness:number|null;overall:number|null};coverage:number;provisional:number|null}
const clamp=(value:number)=>Math.max(0,Math.min(100,value))
function scale(value:number|null,low:number,high:number,invert=false){if(value===null||!Number.isFinite(value))return null;if(high===low)return 50;return clamp((invert?(high-value):(value-low))/(high-low)*100)}
function bounds(rows:RankInput[],key:'price'|'solar'|'wind'|'summer'|'contractMw'){const values=rows.map(row=>row[key]).filter((v):v is number=>v!==null&&Number.isFinite(v));return {low:Math.min(...values),high:Math.max(...values)}}
export function rankRegions(rows:RankInput[],weights:RankWeights=DEFAULT_WEIGHTS,dimension:RankDimension='overall'){
  const price=bounds(rows,'price'),solar=bounds(rows,'solar'),wind=bounds(rows,'wind'),summer=bounds(rows,'summer'),demand=bounds(rows,'contractMw')
  const totalWeight=Math.max(1,Object.values(weights).reduce((n,v)=>n+Math.max(0,v),0))
  const ranked:RankedRegion[]=rows.map(row=>{
    const economics=scale(row.price,price.low,price.high,true)
    const demandScore=scale(row.contractMw,demand.low,demand.high)
    const resourceParts=[scale(row.solar,solar.low,solar.high),scale(row.wind,wind.low,wind.high),scale(row.summer,summer.low,summer.high,true)]
    const resource=resourceParts.every(v=>v!==null)?resourceParts[0]!*.45+resourceParts[1]!*.35+resourceParts[2]!*.2:null
    const readiness=row.verifiedGates===null?null:clamp(row.verifiedGates/6*100)
    const values={economics,demand:demandScore,resource,readiness}
    const coverage=Object.values(values).filter(value=>value!==null).length
    const weighted=Object.entries(values).reduce((sum,[key,value])=>sum+(value??0)*Math.max(0,weights[key as keyof RankWeights]),0)
    const availableWeight=Object.entries(values).reduce((sum,[key,value])=>sum+(value===null?0:Math.max(0,weights[key as keyof RankWeights])),0)
    const provisional=availableWeight>0?weighted/availableWeight:null
    const overall=coverage===4&&!row.blocked?weighted/totalWeight:null
    return {...row,scores:{...values,overall},coverage,provisional}
  })
  ranked.sort((a,b)=>{
    const metric=(row:RankedRegion)=>dimension==='overall'?row.scores.overall??row.provisional:row.scores[dimension]
    if(dimension==='overall'&&(a.scores.overall===null)!==(b.scores.overall===null))return a.scores.overall!==null?-1:1
    if(dimension==='overall'&&a.coverage!==b.coverage)return b.coverage-a.coverage
    return (metric(b)??-Infinity)-(metric(a)??-Infinity)||b.coverage-a.coverage||a.province.localeCompare(b.province,'zh-CN')
  })
  return ranked
}
