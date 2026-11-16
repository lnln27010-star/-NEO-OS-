import {emptyIdcModel,emptyIdcPhase,installedKw,type IdcModel,type IdcPhase} from './idcInvestment.ts'

const num=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null
const ratioPct=(value:unknown):number|null=>{const n=num(value);return n===null?null:Math.abs(n)<=1?n*100:n}

/** Reads the editable assumptions and cached formula outputs. It does not trust the Lead snapshot as a live model. */
export async function importIdcWorkbook(buffer:ArrayBuffer,filename:string){
  const XLSX=(await import('xlsx')).default,workbook=XLSX.read(buffer,{type:'array',cellDates:false}),sheet=workbook.Sheets['业务填报_基本假设']
  if(!sheet)throw Error('缺少“业务填报_基本假设”工作表')
  const cell=(address:string)=>sheet[address]?.v,number=(address:string)=>num(cell(address)),percent=(address:string)=>ratioPct(cell(address))
  const excelDate=(address:string)=>{const value=cell(address);if(typeof value==='number'){const parsed=XLSX.SSF.parse_date_code(value);return parsed?{year:parsed.y,month:parsed.m,day:parsed.d}:null}if(typeof value==='string'){const match=value.match(/^(\d{4})-(\d{1,2})/);return match?{year:Number(match[1]),month:Number(match[2]),day:1}:null}return null}
  const dated=['E','F','G','H'].map(column=>excelDate(`${column}18`)).filter((value):value is {year:number;month:number;day:number}=>value!==null)
  const model:IdcModel=emptyIdcModel();model.startYear=dated.length?Math.min(...dated.map(d=>d.year)):new Date().getFullYear();model.phases=[]
  const warnings:string[]=[]
  for(const [index,col] of ['E','F','G','H'].entries()){
    const rack1Kw=number(`${col}7`),rack1Count=number(`${col}8`),rack2Kw=number(`${col}10`),rack2Count=number(`${col}11`)
    if(!rack1Kw&&!rack2Kw&&!rack1Count&&!rack2Count)continue
    const phase:IdcPhase=emptyIdcPhase(['一期','二期','三期','四期'][index]),delivery=excelDate(`${col}18`)
    phase.deliveryMonth=delivery?(delivery.year-model.startYear)*12+delivery.month:null
    phase.operationYears=number(`${col}6`)??20
    phase.rack1={kw:rack1Kw,count:rack1Count,grossYuanKwMonth:number(`${col}9`),itUsePct:percent(`${col}35`),mechYuanKw:number(`${col}81`)}
    phase.rack2={kw:rack2Kw,count:rack2Count,grossYuanKwMonth:number(`${col}12`),itUsePct:percent(`${col}36`),mechYuanKw:number(`${col}83`)}
    phase.bandwidthAttachPct=percent(`${col}13`);phase.bandwidthGrossYuanRackMonth=number(`${col}14`);phase.bandwidthGrossMarginPct=percent(`${col}15`)
    phase.ramp12Pct=percent(`${col}19`);phase.ramp24Pct=percent(`${col}20`);phase.ramp36Pct=percent(`${col}21`);phase.ramp48Pct=percent(`${col}22`);phase.steadyPct=percent(`${col}23`)
    phase.pueBefore=number(`${col}32`);phase.pueAfter=number(`${col}33`);phase.electricityGrossYuanKwh=number(`${col}38`)
    phase.demandFeeBeforeYuanMonth=number(`${col}40`);phase.demandFeeAfterYuanMonth=number(`${col}41`);phase.waterTonRackMonth=number(`${col}42`);phase.waterGrossYuanTon=number(`${col}43`)
    phase.facilitySalaryYuanMonth=number(`${col}45`);phase.facilityStaffBefore=number(`${col}46`);phase.facilityStaffAfter=number(`${col}47`)
    phase.roomSalaryYuanMonth=number(`${col}49`);phase.roomStaffBefore=number(`${col}50`);phase.roomStaffAfter=number(`${col}51`)
    phase.securityStaff=number(`${col}52`);phase.securitySalaryYuanMonth=number(`${col}53`);phase.cleaningStaff=number(`${col}54`);phase.cleaningSalaryYuanMonth=number(`${col}55`);phase.staffAnnualRisePct=percent(`${col}56`)??0
    const rentStart=excelDate(`${col}62`)
    phase.rentAreaSqm=number(`${col}58`);phase.rentYuanSqmDay=number(`${col}59`);phase.rentStartMonth=rentStart?Math.max(1,(rentStart.year-model.startYear)*12+rentStart.month):null;phase.rentFreeMonths=rentStart&&rentStart.year<model.startYear?0:number(`${col}63`)??0;phase.rentRiseEveryYears=number(`${col}60`)??3;phase.rentRisePct=percent(`${col}61`)??0
    phase.propertyAreaSqm=number(`${col}65`);phase.propertyYuanSqmDay=number(`${col}66`);phase.propertyRisePct=percent(`${col}68`)??0
    phase.opexRatioBeforePct=percent(`${col}72`);phase.opexRatioAfterPct=percent(`${col}73`);phase.opexMode=phase.opexRatioBeforePct!==null&&phase.opexRatioAfterPct!==null?'ratio':'detailed'
    const kw=installedKw(phase),mech=number(`${col}79`),grid=number(`${col}84`),civil=number(`${col}88`),land=number(`${col}92`),property=number(`${col}97`)
    phase.capexTargetYuanKw=col==='E'?number('M88')??(kw?(nz(mech)+nz(grid)+nz(civil)+nz(land)+nz(property))/kw:null):kw?(nz(mech)+nz(grid)+nz(civil)+nz(land)+nz(property))/kw:null
    phase.gridYuanKw=kw&&grid!==null?grid/kw:null;phase.civilYuanKw=kw&&civil!==null?civil/kw:null;phase.landYuanKw=kw&&land!==null?land/kw:null;phase.landAreaMu=number(`${col}93`);phase.propertyPurchaseYuanKw=kw&&property!==null?property/kw:null
    phase.batteryReplacementPct=mech&&number(`${col}101`)!==null?number(`${col}101`)!/mech*100:6.6
    phase.upsReplacementPct=mech&&number(`${col}102`)!==null?number(`${col}102`)!/mech*100:13.2
    phase.batteryCycleYears=number(`${col}104`)??5;phase.batteryReplacementCount=number(`${col}107`)??3;phase.upsCycleYears=number(`${col}105`)??10;phase.upsReplacementCount=number(`${col}108`)??1;phase.replacementRisePct=percent(`${col}109`)??0
    phase.otherCapexYuan=nz(number(`${col}110`))+nz(number(`${col}111`))
    if(phase.rack1.count&&phase.rack1.itUsePct===null)warnings.push(`${phase.name}电力使用率为空；比例法 OPEX 不受影响，详细电费不可校核`)
    model.phases.push(phase)
  }
  if(!model.phases.length)throw Error('工作簿没有可识别的机柜配置与数量')
  model.vatMechPct=percent('D117')??13;model.vatConstructionPct=percent('D118')??9;model.vatRevenuePct=percent('D129')??6;model.vatElectricityPct=percent('D124')??13;model.vatWaterPct=percent('D125')??9;model.vatRentPct=percent('D120')??9;model.vatPropertyPct=percent('D122')??6;model.incomeTaxPct=percent('D133')??25
  model.vatSurchargePct=(percent('D126')??5)+(percent('D127')??3)+(percent('D128')??2)
  model.propertyTaxDeductionPct=percent('D130')??10;model.propertyTaxPct=percent('D131')??1.2;model.landTaxYuanSqmYear=number('D132')??3
  const lead=workbook.Sheets.Lead
  const leadNumber=(address:string)=>num(lead?.[address]?.v)
  model.reference={filename,sheet:'业务填报_基本假设',importedAt:new Date().toISOString(),lead2028RevenueYuan:leadNumber('I5')===null?null:leadNumber('I5')!*1000,lead2029RevenueYuan:leadNumber('J5')===null?null:leadNumber('J5')!*1000,leadSteadyRackRevenueYuan:leadNumber('E5')===null?null:leadNumber('E5')!*1000,leadSteadyEbitdaYuan:leadNumber('E24')===null?null:leadNumber('E24')!*1000,leadIrrPct:leadNumber('C31')===null?null:leadNumber('C31')!*100,leadNpvYuan:leadNumber('C30')===null?null:leadNumber('C30')!*1000}
  warnings.push('工作簿的 NPV、IRR 和部分利润表结果为固定快照，缺少可追踪的完整现金流公式；系统将依据导入假设重新计算')
  warnings.push('工作簿未给出项目折现率、融资比例、贷款利率和期限；未补录前 NPV 与股权回报不提供数值')
  return {model,warnings}
}
const nz=(value:number|null)=>value??0
