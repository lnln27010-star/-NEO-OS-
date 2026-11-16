/** IDC workbook-style project model. Stored amounts are yuan; UI presents 万元. */
export type IdcRack={kw:number|null;count:number|null;grossYuanKwMonth:number|null;itUsePct:number|null;mechYuanKw:number|null}
export type IdcPhase={
  name:string;deliveryMonth:number|null;buildMonths:number;operationYears:number;
  rack1:IdcRack;rack2:IdcRack;
  ramp12Pct:number|null;ramp24Pct:number|null;ramp36Pct:number|null;ramp48Pct:number|null;steadyPct:number|null;
  bandwidthAttachPct:number|null;bandwidthGrossYuanRackMonth:number|null;bandwidthGrossMarginPct:number|null;
  electricityRecoveryGrossYuanKwh:number|null;
  pueBefore:number|null;pueAfter:number|null;electricityGrossYuanKwh:number|null;demandFeeBeforeYuanMonth:number|null;demandFeeAfterYuanMonth:number|null;
  waterTonRackMonth:number|null;waterGrossYuanTon:number|null;
  facilityStaffBefore:number|null;facilityStaffAfter:number|null;facilitySalaryYuanMonth:number|null;
  roomStaffBefore:number|null;roomStaffAfter:number|null;roomSalaryYuanMonth:number|null;
  securityStaff:number|null;securitySalaryYuanMonth:number|null;cleaningStaff:number|null;cleaningSalaryYuanMonth:number|null;staffAnnualRisePct:number;
  rentAreaSqm:number|null;rentYuanSqmDay:number|null;rentStartMonth:number|null;rentFreeMonths:number;rentRiseEveryYears:number;rentRisePct:number;
  propertyAreaSqm:number|null;propertyYuanSqmDay:number|null;propertyRisePct:number;
  opexMode:'ratio'|'detailed';opexRatioBeforePct:number|null;opexRatioAfterPct:number|null;steadyAfterMonth:number;
  capexTargetYuanKw:number|null;gridYuanKw:number|null;civilYuanKw:number|null;landYuanKw:number|null;landAreaMu:number|null;propertyPurchaseYuanKw:number|null;otherCapexYuan:number;
  batteryReplacementPct:number;batteryCycleYears:number;batteryReplacementCount:number;upsReplacementPct:number;upsCycleYears:number;upsReplacementCount:number;replacementRisePct:number;
}
export type IdcModel={startYear:number;phases:IdcPhase[];discountPct:number|null;loanPct:number|null;loanRatePct:number|null;loanYears:number|null;
  vatRevenuePct:number;vatMechPct:number;vatConstructionPct:number;vatElectricityPct:number;vatWaterPct:number;vatRentPct:number;vatPropertyPct:number;incomeTaxPct:number;vatSurchargePct:number;propertyTaxDeductionPct:number;propertyTaxPct:number;landTaxYuanSqmYear:number;
  reference?:{filename:string;sheet:string;importedAt:string;lead2028RevenueYuan?:number|null;lead2029RevenueYuan?:number|null;leadSteadyRackRevenueYuan?:number|null;leadSteadyEbitdaYuan?:number|null;leadIrrPct?:number|null;leadNpvYuan?:number|null}}
export type IdcMonth={month:number;year:number;operatingRacks:number;occupancyPct:number;revenueYuan:number;cashOpexYuan:number;electricityYuan:number|null;ebitdaYuan:number;depreciationYuan:number;interestYuan:number|null;incomeTaxYuan:number;equityIncomeTaxYuan:number|null;capexYuan:number;replacementYuan:number;vatCreditUsedYuan:number;debtDrawYuan:number|null;debtServiceYuan:number|null;projectCashYuan:number;equityCashYuan:number|null;cumulativeCashYuan:number}
export type IdcYear={year:number;revenueYuan:number;cashOpexYuan:number;electricityYuan:number|null;ebitdaYuan:number;depreciationYuan:number;interestYuan:number|null;incomeTaxYuan:number;equityIncomeTaxYuan:number|null;capexYuan:number;replacementYuan:number;projectCashYuan:number;equityCashYuan:number|null;occupancyPct:number}
export type IdcResult={available:boolean;missing:string[];months:IdcMonth[];years:IdcYear[];totalCapexYuan:number;projectNpvYuan:number|null;equityNpvYuan:number|null;projectIrrPct:number|null;equityIrrPct:number|null;paybackMonths:number|null;steadyRackRevenueYuan:number;steadyEbitdaYuan:number|null;terminalDebtYuan:number}

const nz=(value:number|null|undefined)=>value??0
const pct=(value:number|null|undefined)=>nz(value)/100
const safe=(value:number)=>Number.isFinite(value)?value:0
const monthHours=730

export function emptyIdcPhase(name='一期'):IdcPhase{return {name,deliveryMonth:null,buildMonths:12,operationYears:20,rack1:{kw:null,count:null,grossYuanKwMonth:null,itUsePct:null,mechYuanKw:null},rack2:{kw:null,count:null,grossYuanKwMonth:null,itUsePct:null,mechYuanKw:null},ramp12Pct:null,ramp24Pct:null,ramp36Pct:null,ramp48Pct:null,steadyPct:null,bandwidthAttachPct:null,bandwidthGrossYuanRackMonth:null,pueBefore:null,pueAfter:null,bandwidthGrossMarginPct:null,electricityRecoveryGrossYuanKwh:null,electricityGrossYuanKwh:null,demandFeeBeforeYuanMonth:null,demandFeeAfterYuanMonth:null,waterTonRackMonth:null,waterGrossYuanTon:null,facilityStaffBefore:null,facilityStaffAfter:null,facilitySalaryYuanMonth:null,roomStaffBefore:null,roomStaffAfter:null,roomSalaryYuanMonth:null,securityStaff:null,securitySalaryYuanMonth:null,cleaningStaff:null,cleaningSalaryYuanMonth:null,staffAnnualRisePct:0,rentAreaSqm:null,rentYuanSqmDay:null,rentStartMonth:null,rentFreeMonths:0,rentRiseEveryYears:3,rentRisePct:0,propertyAreaSqm:null,propertyYuanSqmDay:null,propertyRisePct:0,opexMode:'ratio',opexRatioBeforePct:null,opexRatioAfterPct:null,steadyAfterMonth:36,capexTargetYuanKw:null,gridYuanKw:null,civilYuanKw:null,landYuanKw:null,landAreaMu:null,propertyPurchaseYuanKw:null,otherCapexYuan:0,batteryReplacementPct:6.6,batteryCycleYears:5,batteryReplacementCount:3,upsReplacementPct:13.2,upsCycleYears:10,upsReplacementCount:1,replacementRisePct:0}}
export function emptyIdcModel():IdcModel{return {startYear:new Date().getFullYear(),phases:[emptyIdcPhase()],discountPct:null,loanPct:null,loanRatePct:null,loanYears:null,vatRevenuePct:6,vatMechPct:13,vatConstructionPct:9,vatElectricityPct:13,vatWaterPct:9,vatRentPct:9,vatPropertyPct:6,incomeTaxPct:25,vatSurchargePct:10,propertyTaxDeductionPct:10,propertyTaxPct:1.2,landTaxYuanSqmYear:3}}
export const installedKw=(phase:IdcPhase)=>nz(phase.rack1.kw)*nz(phase.rack1.count)+nz(phase.rack2.kw)*nz(phase.rack2.count)
export const installedRacks=(phase:IdcPhase)=>nz(phase.rack1.count)+nz(phase.rack2.count)
export function idcMissing(model:IdcModel){
  const missing:string[]=[]
  if(!Number.isInteger(model.startYear)||model.startYear<2000||model.startYear>2200)missing.push('项目起始年')
  if(!Array.isArray(model.phases)||model.phases.length<1||model.phases.length>4)return [...missing,'建设期次应为1至4期']
  model.phases.forEach((phase,i)=>{
    const prefix=phase.name||`第${i+1}期`
    if(!phase.rack1||!phase.rack2){missing.push(`${prefix}两档机柜配置`);return}
    if(!phase.deliveryMonth||phase.deliveryMonth<1||phase.deliveryMonth>360)missing.push(`${prefix}交付月份`)
    if(phase.buildMonths<1||phase.buildMonths>120)missing.push(`${prefix}建设月数`)
    if(phase.operationYears<1||phase.operationYears>30)missing.push(`${prefix}运营年限`)
    if(installedKw(phase)<=0)missing.push(`${prefix}机柜功率和数量`)
    if(phase.rack1.count&&phase.rack1.grossYuanKwMonth==null)missing.push(`${prefix}配置1含税单价`)
    if(phase.rack2.count&&phase.rack2.grossYuanKwMonth==null)missing.push(`${prefix}配置2含税单价`)
    if(phase.rack1.count&&phase.rack1.mechYuanKw==null)missing.push(`${prefix}配置1机电单价`)
    if(phase.rack2.count&&phase.rack2.mechYuanKw==null)missing.push(`${prefix}配置2机电单价`)
    const ramps=[phase.ramp12Pct,phase.ramp24Pct,phase.ramp36Pct,phase.ramp48Pct,phase.steadyPct]
    if(ramps.some(value=>value==null||value<0||value>100))missing.push(`${prefix}12/24/36/48个月与稳定上架率`)
    if(phase.capexTargetYuanKw==null||phase.capexTargetYuanKw<=0)missing.push(`${prefix}单位IT投资`)
    if(phase.opexMode==='ratio'&&(phase.opexRatioBeforePct===null||phase.opexRatioAfterPct===null||phase.opexRatioBeforePct<0||phase.opexRatioAfterPct<0||phase.opexRatioBeforePct>100||phase.opexRatioAfterPct>100))missing.push(`${prefix}稳定前后运营成本率`)
    if(phase.opexMode==='detailed'){
      if(phase.electricityGrossYuanKwh===null||phase.pueBefore===null||phase.pueAfter===null||phase.pueBefore<1||phase.pueAfter<1||(phase.rack1.count&&phase.rack1.itUsePct===null)||(phase.rack2.count&&phase.rack2.itUsePct===null))missing.push(`${prefix}电价、PUE与电力使用率`)
      const detailed=[phase.demandFeeBeforeYuanMonth,phase.demandFeeAfterYuanMonth,phase.waterTonRackMonth,phase.waterGrossYuanTon,phase.facilityStaffBefore,phase.facilityStaffAfter,phase.facilitySalaryYuanMonth,phase.roomStaffBefore,phase.roomStaffAfter,phase.roomSalaryYuanMonth,phase.securityStaff,phase.securitySalaryYuanMonth,phase.cleaningStaff,phase.cleaningSalaryYuanMonth,phase.rentAreaSqm,phase.rentYuanSqmDay,phase.propertyAreaSqm,phase.propertyYuanSqmDay]
      if(detailed.some(value=>value===null))missing.push(`${prefix}逐项成本明细（不适用填0）`)
      if(phase.bandwidthAttachPct&&phase.bandwidthGrossMarginPct===null)missing.push(`${prefix}带宽毛利率`)
    }
  })
  if(model.discountPct!==null&&(model.discountPct<0||model.discountPct>100))missing.push('折现率应在0至100%')
  if(model.loanPct!==null&&(model.loanPct<0||model.loanPct>100))missing.push('融资比例应在0至100%')
  return missing
}

function occupancy(phase:IdcPhase,age:number){if(age<=0)return 0;const points=[0,pct(phase.ramp12Pct),pct(phase.ramp24Pct),pct(phase.ramp36Pct),pct(phase.ramp48Pct),pct(phase.steadyPct)];if(age>=48)return points[5];const segment=Math.min(3,Math.floor((age-1)/12)),start=segment*12;return points[segment]+(points[segment+1]-points[segment])*(age-start)/12}
function npv(flows:number[],annualPct:number){return flows.reduce((sum,flow,index)=>sum+flow/Math.pow(1+annualPct/100,(index+1)/12),0)}
function irr(flows:number[]){if(!flows.some(x=>x<0)||!flows.some(x=>x>0))return null;let lo=-.99,hi=10;const value=(rate:number)=>flows.reduce((sum,flow,i)=>sum+flow/Math.pow(1+rate,(i+1)/12),0);if(value(lo)*value(hi)>0)return null;for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(value(lo)*value(mid)>0)lo=mid;else hi=mid}return (lo+hi)/2*100}
const due=(gross:number,ratePct:number)=>gross/(1+ratePct/100)

export function calculateIdc(model:IdcModel):IdcResult{
  const missing=idcMissing(model),empty:IdcResult={available:false,missing,months:[],years:[],totalCapexYuan:0,projectNpvYuan:0,equityNpvYuan:0,projectIrrPct:null,equityIrrPct:null,paybackMonths:null,steadyRackRevenueYuan:0,steadyEbitdaYuan:0,terminalDebtYuan:0}
  if(missing.length)return empty
  const phases=model.phases.filter(phase=>installedKw(phase)>0&&phase.deliveryMonth!==null)
  const horizon=Math.max(...phases.map(phase=>phase.deliveryMonth!+phase.operationYears*12))
  const months:IdcMonth[]=[],projectFlows:number[]=[],equityFlows:number[]=[],phaseCapex=phases.map(phase=>installedKw(phase)*nz(phase.capexTargetYuanKw)+phase.otherCapexYuan),revenueVat=model.vatRevenuePct
  let vatCredit=0,cumulative=0,paybackMonths:number|null=null,terminalDebtYuan=0
  for(let month=1;month<=horizon;month++){
    let rackRevenue=0,bandwidthRevenue=0,powerRecovery=0,opex=0,electricity=0,operatingRacks=0,weightedOccupancy=0,depreciation=0,capex=0,replacement=0,draw=0,service=0,interest=0,newVatCredit=0,electricityKnown=true
    for(let i=0;i<phases.length;i++){
      const p=phases[i],delivery=p.deliveryMonth!,kw=installedKw(p),racks=installedRacks(p),base=phaseCapex[i],start=Math.max(1,delivery-p.buildMonths+1),buildMonths=delivery-start+1,age=month-delivery
      if(month>=start&&month<=delivery){const spend=base/buildMonths;capex+=spend;draw+=spend*pct(model.loanPct);const mech=kw*(nz(p.rack1.mechYuanKw)*nz(p.rack1.kw)*nz(p.rack1.count)/Math.max(1,kw)+nz(p.rack2.mechYuanKw)*nz(p.rack2.kw)*nz(p.rack2.count)/Math.max(1,kw)),grid=kw*nz(p.gridYuanKw),land=kw*nz(p.landYuanKw),property=kw*nz(p.propertyPurchaseYuanKw),civil=Math.max(0,base-mech-grid-land-property-p.otherCapexYuan);newVatCredit+=(mech*(1-1/(1+pct(model.vatMechPct)))+(grid+civil+property)*(1-1/(1+pct(model.vatConstructionPct))))/buildMonths}
      const rentStart=p.rentStartMonth??delivery+1
      if(month>=rentStart&&month<=delivery&&p.rentAreaSqm!==null&&p.rentYuanSqmDay!==null){const leaseAge=month-rentStart+1;if(leaseAge>p.rentFreeMonths)opex+=due(nz(p.rentAreaSqm)*nz(p.rentYuanSqmDay)*365.25/12*Math.pow(1+p.rentRisePct/100,Math.floor((leaseAge-1)/(Math.max(1,p.rentRiseEveryYears)*12))),model.vatRentPct)}
      if(age<1||age>p.operationYears*12)continue
      const occ=occupancy(p,age),steady=age>p.steadyAfterMonth,actualRacks=racks*occ
      operatingRacks+=actualRacks;weightedOccupancy+=occ*racks
      const racksFor=[p.rack1,p.rack2]
      const grossRack=racksFor.reduce((sum,r)=>sum+occ*nz(r.count)*nz(r.kw)*nz(r.grossYuanKwMonth),0)
      rackRevenue+=due(grossRack,revenueVat)
      const grossBandwidth=actualRacks*pct(p.bandwidthAttachPct)*nz(p.bandwidthGrossYuanRackMonth)
      bandwidthRevenue+=due(grossBandwidth,revenueVat)
      const itKw=racksFor.reduce((sum,r)=>sum+occ*nz(r.count)*nz(r.kw)*pct(r.itUsePct??100),0)
      if(p.electricityGrossYuanKwh===null||(steady?p.pueAfter:p.pueBefore)===null)electricityKnown=false
      const energyKwh=itKw*nz(steady?p.pueAfter:p.pueBefore)*monthHours
      const electricGross=energyKwh*nz(p.electricityGrossYuanKwh)+nz(steady?p.demandFeeAfterYuanMonth:p.demandFeeBeforeYuanMonth)
      electricity+=due(electricGross,model.vatElectricityPct)
      powerRecovery+=due(energyKwh*nz(p.electricityRecoveryGrossYuanKwh),revenueVat)
      const staffRaise=Math.pow(1+p.staffAnnualRisePct/100,Math.floor((age-1)/12))
      const staff=(nz(steady?p.facilityStaffAfter:p.facilityStaffBefore)*nz(p.facilitySalaryYuanMonth)+nz(steady?p.roomStaffAfter:p.roomStaffBefore)*nz(p.roomSalaryYuanMonth)+nz(p.securityStaff)*nz(p.securitySalaryYuanMonth)+nz(p.cleaningStaff)*nz(p.cleaningSalaryYuanMonth))*staffRaise
      const leaseAge=month-rentStart+1,free=leaseAge<=p.rentFreeMonths,rateRise=Math.pow(1+p.rentRisePct/100,Math.floor(Math.max(0,leaseAge-1)/(Math.max(1,p.rentRiseEveryYears)*12)))
      const rent=month<rentStart||free?0:due(nz(p.rentAreaSqm)*nz(p.rentYuanSqmDay)*365.25/12*rateRise,model.vatRentPct)
      const propertyCost=due(nz(p.propertyAreaSqm)*nz(p.propertyYuanSqmDay)*365.25/12*Math.pow(1+p.propertyRisePct/100,Math.floor((age-1)/12)),model.vatPropertyPct)
      const water=actualRacks*nz(p.waterTonRackMonth)*nz(p.waterGrossYuanTon)/(1+pct(model.vatWaterPct))
      const phaseRevenue=due(grossRack+grossBandwidth,revenueVat)+due(energyKwh*nz(p.electricityRecoveryGrossYuanKwh),revenueVat)
      const bandwidthCost=due(grossBandwidth,revenueVat)*(1-pct(p.bandwidthGrossMarginPct))
      const ownedPropertyTax=kw*nz(p.propertyPurchaseYuanKw)*(1-pct(model.propertyTaxDeductionPct))*pct(model.propertyTaxPct)/12
      const landTax=nz(p.landAreaMu)*666.6667*model.landTaxYuanSqmYear/12
      opex+=p.opexMode==='ratio'?phaseRevenue*pct(steady?p.opexRatioAfterPct:p.opexRatioBeforePct):electricity+water+staff+rent+propertyCost+bandwidthCost+ownedPropertyTax+landTax
      const mech=kw*(nz(p.rack1.mechYuanKw)*nz(p.rack1.kw)*nz(p.rack1.count)/Math.max(1,kw)+nz(p.rack2.mechYuanKw)*nz(p.rack2.kw)*nz(p.rack2.count)/Math.max(1,kw)),grid=kw*nz(p.gridYuanKw),land=kw*nz(p.landYuanKw),property=kw*nz(p.propertyPurchaseYuanKw),civil=Math.max(0,base-mech-grid-land-property-p.otherCapexYuan)
      if(age<=120)depreciation+=due(mech,model.vatMechPct)/120
      if(age<=240)depreciation+=(due(grid+civil+property,model.vatConstructionPct)+p.otherCapexYuan)/240
      for(const [cycle,pctReplace,count] of [[p.batteryCycleYears,p.batteryReplacementPct,p.batteryReplacementCount],[p.upsCycleYears,p.upsReplacementPct,p.upsReplacementCount]] as const){if(cycle<=0||pctReplace<=0||count<=0)continue;const period=cycle*12,events=Math.floor((age-1)/period);if(age>period&&events<=count)depreciation+=due(mech*pctReplace/100*Math.pow(1+p.replacementRisePct/100,events-1),model.vatMechPct)/period;if(age%period===0&&age<p.operationYears*12&&age/period<=count){const gross=mech*pctReplace/100*Math.pow(1+p.replacementRisePct/100,age/period-1);replacement+=gross;newVatCredit+=gross-due(gross,model.vatMechPct)}}
      const loan=base*pct(model.loanPct),term=nz(model.loanYears)*12,rate=nz(model.loanRatePct)/1200
      if(loan>0&&age<=term){const payment=rate===0?loan/term:loan*rate/(1-Math.pow(1+rate,-term)),before=rate===0?loan-payment*(age-1):loan*Math.pow(1+rate,age-1)-payment*(Math.pow(1+rate,age-1)-1)/rate;service+=payment;interest+=Math.max(0,before)*rate;if(month===horizon)terminalDebtYuan+=Math.max(0,before*(1+rate)-payment)}
    }
    const revenue=rackRevenue+bandwidthRevenue+powerRecovery,ebitda=revenue-opex,projectTax=Math.max(0,ebitda-depreciation)*pct(model.incomeTaxPct),equityTax=Math.max(0,ebitda-depreciation-interest)*pct(model.incomeTaxPct)
    vatCredit+=newVatCredit;const outputVat=revenue*pct(revenueVat),creditUsed=Math.min(vatCredit,outputVat);vatCredit-=creditUsed
    const surcharge=(outputVat-creditUsed)*pct(model.vatSurchargePct),projectCash=ebitda-projectTax-capex-replacement+creditUsed-surcharge,equityCash=ebitda-equityTax-capex-replacement+creditUsed-surcharge+draw-service
    cumulative+=projectCash;if(paybackMonths===null&&cumulative>=0&&projectFlows.some(value=>value<0))paybackMonths=month
    projectFlows.push(projectCash);equityFlows.push(equityCash)
    const financingKnown=model.loanPct===0||model.loanPct!==null&&model.loanRatePct!==null&&model.loanYears!==null
    months.push({month,year:model.startYear+Math.floor((month-1)/12),operatingRacks,occupancyPct:weightedOccupancy/Math.max(1,phases.reduce((n,p)=>n+installedRacks(p),0))*100,revenueYuan:revenue,cashOpexYuan:opex,electricityYuan:electricityKnown?electricity:null,ebitdaYuan:ebitda,depreciationYuan:depreciation,interestYuan:financingKnown?interest:null,incomeTaxYuan:projectTax,equityIncomeTaxYuan:financingKnown?equityTax:null,capexYuan:capex,replacementYuan:replacement,vatCreditUsedYuan:creditUsed,debtDrawYuan:financingKnown?draw:null,debtServiceYuan:financingKnown?service:null,projectCashYuan:projectCash,equityCashYuan:financingKnown?equityCash:null,cumulativeCashYuan:cumulative})
  }
  const financingKnown=model.loanPct===0||model.loanPct!==null&&model.loanRatePct!==null&&model.loanYears!==null
  const years=[...new Set(months.map(row=>row.year))].map(year=>{const rows=months.filter(row=>row.year===year),sum=(key:keyof IdcMonth)=>rows.reduce((n,row)=>n+Number(row[key]??0),0);return {year,revenueYuan:sum('revenueYuan'),cashOpexYuan:sum('cashOpexYuan'),electricityYuan:rows.every(row=>row.electricityYuan!==null)?sum('electricityYuan'):null,ebitdaYuan:sum('ebitdaYuan'),depreciationYuan:sum('depreciationYuan'),interestYuan:financingKnown?sum('interestYuan'):null,incomeTaxYuan:sum('incomeTaxYuan'),equityIncomeTaxYuan:financingKnown?sum('equityIncomeTaxYuan'):null,capexYuan:sum('capexYuan'),replacementYuan:sum('replacementYuan'),projectCashYuan:sum('projectCashYuan'),equityCashYuan:financingKnown?sum('equityCashYuan'):null,occupancyPct:rows.reduce((n,row)=>n+row.occupancyPct,0)/rows.length}})
  const steadyRackRevenueYuan=phases.reduce((sum,p)=>sum+(nz(p.rack1.count)*nz(p.rack1.kw)*nz(p.rack1.grossYuanKwMonth)+nz(p.rack2.count)*nz(p.rack2.kw)*nz(p.rack2.grossYuanKwMonth))*12*pct(p.steadyPct)/(1+pct(revenueVat)),0)
  const steadyEbitdaYuan=phases.every(p=>p.opexMode==='ratio')?phases.reduce((sum,p)=>{const rack=(nz(p.rack1.count)*nz(p.rack1.kw)*nz(p.rack1.grossYuanKwMonth)+nz(p.rack2.count)*nz(p.rack2.kw)*nz(p.rack2.grossYuanKwMonth))*12*pct(p.steadyPct)/(1+pct(revenueVat));return sum+rack*(1-pct(p.opexRatioAfterPct))},0):years.find(row=>row.year>model.startYear+Math.ceil(Math.max(...phases.map(p=>p.deliveryMonth!+p.steadyAfterMonth))/12))?.ebitdaYuan??null
  return {available:true,missing:[],months,years,totalCapexYuan:phaseCapex.reduce((n,v)=>n+v,0),projectNpvYuan:model.discountPct===null?null:safe(npv(projectFlows,model.discountPct)),equityNpvYuan:model.discountPct===null||!financingKnown?null:safe(npv(equityFlows,model.discountPct)),projectIrrPct:irr(projectFlows),equityIrrPct:financingKnown?irr(equityFlows):null,paybackMonths,steadyRackRevenueYuan,steadyEbitdaYuan,terminalDebtYuan}
}
