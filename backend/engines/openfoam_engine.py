"""OpenCFD v2312: room Boussinesq CFD and a three-region air/plate/water CHT case."""
import json
import math
import os
import re
import subprocess
from pathlib import Path
from backend.models import JobRequest
from .common import write_json,metric

def foam(path:Path,body:str,cls='dictionary',object_name=None):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(f'FoamFile\n{{ version 2.0; format ascii; class {cls}; object {object_name or path.name}; }}\n'+body+'\n',encoding='utf-8')

def scalar(path,dimensions,initial,boundary):
    foam(path,f'dimensions {dimensions};\ninternalField uniform {initial};\nboundaryField\n{{\n{boundary}\n}}','volScalarField')

def vector(path,initial,boundary):
    foam(path,f'dimensions [0 1 -1 0 0 0 0];\ninternalField uniform {initial};\nboundaryField\n{{\n{boundary}\n}}','volVectorField')

def block_mesh(path,x,y,levels,nx,ny,nz,local=False):
    vertices=[]
    for z in levels:vertices.extend([(0,0,z),(x,0,z),(x,y,z),(0,y,z)])
    blocks=[]
    for i,cells in enumerate(nz):
        a=i*4;blocks.append(f'hex ({a} {a+1} {a+2} {a+3} {a+4} {a+5} {a+6} {a+7}) ({nx} {ny} {cells}) simpleGrading (1 1 1)')
    patches={}
    for i in range(len(nz)):
        a=i*4
        left='inlet' if not local else ['waterInlet','solidEnds','airInlet'][i]
        right='outlet' if not local else ['waterOutlet','solidEnds','airOutlet'][i]
        for name,face in [(left,(a,a+4,a+7,a+3)),(right,(a+1,a+2,a+6,a+5)),('walls',(a,a+1,a+5,a+4)),('walls',(a+3,a+7,a+6,a+2))]:patches.setdefault(name,[]).append(face)
    patches.setdefault('walls',[]).extend([(0,3,2,1),(len(vertices)-4,len(vertices)-3,len(vertices)-2,len(vertices)-1)])
    boundary='\n'.join(f'{name} {{ type {"patch" if "nlet" in name or "utlet" in name else "wall"}; faces ('+' '.join('('+' '.join(map(str,f))+')' for f in faces)+'); }' for name,faces in patches.items())
    foam(path,'scale 1;\nvertices ('+' '.join(f'({a} {b} {c})' for a,b,c in vertices)+');\nblocks ('+' '.join(blocks)+');\nedges ();\nboundary ('+boundary+');\nmergePatchPairs ();')

def zone_action(name,low,high):
    box=f'({low[0]} {low[1]} {low[2]}) ({high[0]} {high[1]} {high[2]})'
    return f'{{ name {name}; type cellSet; action new; source boxToCell; sourceInfo {{ box {box}; }} }}\n{{ name {name}; type cellZoneSet; action new; source setToCellZone; sourceInfo {{ set {name}; }} }}'

def common_control(case,application,iterations):
    foam(case/'system/controlDict',f'application {application}; startFrom startTime; startTime 0; stopAt endTime; endTime {iterations}; deltaT 1; writeControl timeStep; writeInterval {iterations}; purgeWrite 0; writeFormat ascii; writePrecision 10; writeCompression off; timeFormat general; timePrecision 8; runTimeModifiable false;')
    foam(case/'constant/g','dimensions [0 1 -2 0 0 0 0]; value (0 0 -9.81);','uniformDimensionedVectorField')

def prepare_room(request,case):
    p=request.thermal;nx,ny,nz=p.cells_x,p.cells_y,p.cells_z;L,W,H=96.,61.,8.5;dx,dy=L/nx,W/ny
    cracs=[d for d in request.snapshot.devices if d.kind=='crac' and d.installed]
    if cracs and not any(d.enabled and d.operating is not False and d.cooling_ready is not False for d in cracs) and sum(d.heat_air_kw for d in request.snapshot.devices if d.installed and d.enabled and d.operating is not False)>0:
        raise ValueError('当前没有有效冷却边界，稳态热平衡不成立；请恢复冷却条件，或使用快速推演观察停冷后的瞬态温升')
    common_control(case,'buoyantBoussinesqSimpleFoam',p.iterations)
    block_mesh(case/'system/blockMeshDict',L,W,[0,H],nx,ny,[nz])
    foam(case/'constant/transportProperties','transportModel Newtonian; nu [0 2 -1 0 0 0 0] 1.5e-5; beta [0 0 0 -1 0 0 0] 0.0033; TRef [0 0 0 1 0 0 0] 293.15; Pr [0 0 0 0 0 0 0] 0.71; Prt [0 0 0 0 0 0 0] 0.85;')
    foam(case/'constant/turbulenceProperties','simulationType RAS; RAS { RASModel kEpsilon; turbulence on; printCoeffs on; }')
    inlet=p.inlet_c+273.15
    scalar(case/'0/T','[0 0 0 1 0 0 0]',inlet,f'inlet {{ type fixedValue; value uniform {inlet}; }} outlet {{ type inletOutlet; inletValue uniform {inlet}; value uniform {inlet}; }} walls {{ type zeroGradient; }}')
    vector(case/'0/U',f'({p.air_speed_m_s} 0 0)',f'inlet {{ type fixedValue; value uniform ({p.air_speed_m_s} 0 0); }} outlet {{ type zeroGradient; }} walls {{ type noSlip; }}')
    scalar(case/'0/p_rgh','[0 2 -2 0 0 0 0]',0,'inlet { type fixedFluxPressure; value uniform 0; } outlet { type fixedValue; value uniform 0; } walls { type fixedFluxPressure; value uniform 0; }')
    k=max(.0001,1.5*(p.air_speed_m_s*.05)**2);epsilon=max(.00001,.09**.75*k**1.5/.1)
    for name,dim,val,wall in [('k','[0 2 -2 0 0 0 0]',k,'kqRWallFunction'),('epsilon','[0 2 -3 0 0 0 0]',epsilon,'epsilonWallFunction')]:
        scalar(case/f'0/{name}',dim,val,f'inlet {{ type fixedValue; value uniform {val}; }} outlet {{ type inletOutlet; inletValue uniform {val}; value uniform {val}; }} walls {{ type {wall}; value uniform {val}; }}')
    scalar(case/'0/nut','[0 2 -1 0 0 0 0]',0,'inlet { type calculated; value uniform 0; } outlet { type calculated; value uniform 0; } walls { type nutkWallFunction; value uniform 0; }')
    scalar(case/'0/alphat','[0 2 -1 0 0 0 0]',0,'inlet { type calculated; value uniform 0; } outlet { type calculated; value uniform 0; } walls { type alphatJayatillekeWallFunction; Prt 0.85; value uniform 0; }')
    foam(case/'system/fvSchemes','ddtSchemes { default steadyState; } gradSchemes { default Gauss linear; } divSchemes { default none; div(phi,U) bounded Gauss upwind; div(phi,T) bounded Gauss upwind; div(phi,k) bounded Gauss upwind; div(phi,epsilon) bounded Gauss upwind; div((nuEff*dev2(T(grad(U))))) Gauss linear; } laplacianSchemes { default Gauss linear corrected; } interpolationSchemes { default linear; } snGradSchemes { default corrected; } fluxRequired { default no; p_rgh; }')
    foam(case/'system/fvSolution','solvers { p_rgh { solver GAMG; tolerance 1e-7; relTol 0.01; smoother GaussSeidel; } "(U|T|k|epsilon)" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0.05; } } SIMPLE { nNonOrthogonalCorrectors 1; pRefCell 0; pRefValue 0; residualControl { p_rgh 1e-4; U 1e-5; T 1e-5; k 1e-4; epsilon 1e-4; } } relaxationFactors { fields { p_rgh 0.3; } equations { U 0.6; T 0.7; k 0.5; epsilon 0.5; } }')
    actions=[];sources=[];heat_air=0;heat_water=0
    for i,d in enumerate(request.snapshot.devices):
        if not d.installed or d.kind not in {'rack','crac'} or abs(d.x)>47 or abs(d.z)>29:continue
        if d.kind=='crac' and (not d.enabled or d.operating is False):continue
        name=f'zone{i}';x=d.x+48;y=d.z+30.5
        low=(max(0,x-max(.5,dx*.52)),max(0,y-max(.7,dy*.52)),0)
        high=(min(L,x+max(.5,dx*.52)),min(W,y+max(.7,dy*.52)),2.7)
        actions.append(zone_action(name,low,high))
        if d.kind=='rack':
            actual=d.heat_air_kw+d.heat_water_kw if d.enabled and d.operating is not False else 0
            q=(max(d.heat_air_kw,actual*(1-p.liquid_capture_fraction)) if d.cooling_mode=='liquid' and d.flow_lpm>0 else actual) if actual>0 else 0
            heat_air+=q;heat_water+=max(0,actual-q)
            sources.append(f'heat{i} {{ type scalarSemiImplicitSource; active true; selectionMode cellZone; cellZone {name}; volumeMode absolute; injectionRateSuSp {{ T ({q*1000/(1.2*1006)} 0); }} }}')
            sources.append(f'drag{i} {{ type vectorSemiImplicitSource; active true; selectionMode cellZone; cellZone {name}; volumeMode absolute; injectionRateSuSp {{ U ((0 0 0) -2); }} }}')
        else:
            if d.operating is False:continue
            volume=d.capacity*1000/(1.2*1006*12)
            ux=math.sin(d.yaw)*volume/5.94;uy=math.cos(d.yaw)*volume/5.94
            if d.cooling_ready is not False:sources.append(f'cool{i} {{ type scalarSemiImplicitSource; active true; selectionMode cellZone; cellZone {name}; volumeMode absolute; injectionRateSuSp {{ T ({volume*inlet} {-volume}); }} }}')
            sources.append(f'fan{i} {{ type vectorSemiImplicitSource; active true; selectionMode cellZone; cellZone {name}; volumeMode absolute; injectionRateSuSp {{ U (({volume*ux} {volume*uy} 0) {-volume}); }} }}')
    foam(case/'system/topoSetDict','actions (\n'+'\n'.join(actions)+'\n);')
    foam(case/'constant/fvOptions','\n'.join(sources))
    write_json(case/'model-mapping.json',{'air_heat_kw':heat_air,'water_removed_kw':heat_water,'cells':[nx,ny,nz],'room':[L,W,H],'world_mapping':'x=foam_x-48,y=foam_z,z=foam_y-30.5','method':'当前机柜位置的体热源与等效阻力；CRAC 位置的体积风机和换热源；粗网格不解析服务器内部几何'})

def prepare_cht(request,case):
    p=request.thermal
    common_control(case,'chtMultiRegionFoam',p.iterations)
    foam(case/'constant/g','dimensions [0 1 -2 0 0 0 0]; value (0 0 0);','uniformDimensionedVectorField')
    block_mesh(case/'system/blockMeshDict',.6,.2,[-.01,0,.01,.11],max(12,p.cells_x),max(6,p.cells_y//2),[3,3,8],local=True)
    foam(case/'constant/regionProperties','regions ( fluid (air water) solid (plate) );')
    actions=[zone_action('water',(0,0,-.011),(.6,.2,-1e-7)),zone_action('plate',(0,0,1e-7),(.6,.2,.0099999)),zone_action('air',(0,0,.0100001),(.6,.2,.111))]
    foam(case/'system/topoSetDict','actions ('+' '.join(actions)+');')
    foam(case/'system/fvSolution','PIMPLE { nOuterCorrectors 3; }')
    foam(case/'system/fvSchemes','ddtSchemes { default steadyState; }')
    for region in ['air','water','plate']:
        solid=region=='plate';fluid=not solid
        body='thermoType { type '+('heSolidThermo' if solid else 'heRhoThermo')+'; mixture pureMixture; transport '+('constIso' if solid else 'const')+'; thermo hConst; equationOfState '+('rhoConst' if solid else 'perfectGas' if region=='air' else 'perfectFluid')+'; specie specie; energy sensibleEnthalpy; }\n'
        if solid:body+='mixture { specie { molWeight 63.55; } equationOfState { rho 8960; } thermodynamics { Cp 385; Hf 0; } transport { kappa 380; } }'
        elif region=='air':body+='mixture { specie { molWeight 28.96; } thermodynamics { Cp 1006; Hf 0; } transport { mu 1.8e-5; Pr 0.71; } }'
        else:body+='mixture { specie { molWeight 18.0; } equationOfState { R 3000; rho0 997; } thermodynamics { Cp 4186; Hf 0; } transport { mu 0.001; Pr 6.97; } }'
        foam(case/f'constant/{region}/thermophysicalProperties',body)
        foam(case/f'constant/{region}/radiationProperties','radiationModel none;')
        temperature=(p.water_c if region=='water' else p.inlet_c)+273.15
        method='solidThermo' if solid else 'fluidThermo'
        coupled=f'"{region}_to_.*" {{ type compressible::turbulentTemperatureCoupledBaffleMixed; Tnbr T; kappaMethod {method}; value uniform {temperature}; }}'
        bf=f'".*" {{ type zeroGradient; }}\n{coupled}'
        if fluid:bf+=f'\n{region}Inlet {{ type fixedValue; value uniform {temperature}; }} {region}Outlet {{ type zeroGradient; }}'
        scalar(case/f'0/{region}/T','[0 0 0 1 0 0 0]',temperature,bf)
        schemes='ddtSchemes { default steadyState; } gradSchemes { default Gauss linear; } divSchemes { default none; div(phi,U) bounded Gauss upwind; div(phi,h) bounded Gauss upwind; div(phi,K) Gauss upwind; div(phi,k) bounded Gauss upwind; div(phi,omega) bounded Gauss upwind; div(phiv,p) Gauss upwind; div(((rho*nuEff)*dev2(T(grad(U))))) Gauss linear; } laplacianSchemes { default Gauss linear corrected; } interpolationSchemes { default linear; } snGradSchemes { default corrected; } fluxRequired { default no; p_rgh; }'
        foam(case/f'system/{region}/fvSchemes',schemes)
        foam(case/f'system/{region}/fvSolution','solvers { "(p_rgh|p_rghFinal)" { solver GAMG; tolerance 1e-8; relTol 0.01; smoother GaussSeidel; } "(U|h|hFinal|T|rho|rhoFinal|k|omega)" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0.01; } } PIMPLE { nCorrectors 2; nNonOrthogonalCorrectors 1; momentumPredictor yes; pRefCell 0; pRefValue 101325; } relaxationFactors { fields { p_rgh 0.3; } equations { U 0.5; h 0.7; k 0.5; omega 0.5; } }')
        if fluid:
            speed=p.air_speed_m_s if region=='air' else p.water_speed_m_s
            turbulent=speed*(.1 if region=='air' else .01)/(1.5e-5 if region=='air' else 1e-6)>2300
            foam(case/f'constant/{region}/turbulenceProperties','simulationType RAS; RAS { RASModel kOmegaSST; turbulence on; printCoeffs on; }' if turbulent else 'simulationType laminar;')
            if turbulent:
                k=max(.0001,1.5*(speed*.05)**2);omega=math.sqrt(k)/(.09**.25*.01)
                for field,dim,val,wall in [('k','[0 2 -2 0 0 0 0]',k,'kqRWallFunction'),('omega','[0 0 -1 0 0 0 0]',omega,'omegaWallFunction')]:
                    scalar(case/f'0/{region}/{field}',dim,val,f'".*" {{ type {wall}; value uniform {val}; }} {region}Inlet {{ type fixedValue; value uniform {val}; }} {region}Outlet {{ type zeroGradient; }}')
                scalar(case/f'0/{region}/nut','[0 2 -1 0 0 0 0]',0,f'".*" {{ type nutkWallFunction; value uniform 0; }} {region}Inlet {{ type calculated; value uniform 0; }} {region}Outlet {{ type calculated; value uniform 0; }}')
                scalar(case/f'0/{region}/alphat','[1 -1 -1 0 0 0 0]',0,f'".*" {{ type compressible::alphatWallFunction; Prt 0.85; value uniform 0; }} {region}Inlet {{ type calculated; value uniform 0; }} {region}Outlet {{ type calculated; value uniform 0; }}')
            vector(case/f'0/{region}/U',f'({speed} 0 0)',f'".*" {{ type noSlip; }} {region}Inlet {{ type fixedValue; value uniform ({speed} 0 0); }} {region}Outlet {{ type zeroGradient; }}')
            scalar(case/f'0/{region}/p','[1 -1 -2 0 0 0 0]',101325,'".*" { type calculated; value uniform 101325; }')
            scalar(case/f'0/{region}/p_rgh','[1 -1 -2 0 0 0 0]',101325,f'".*" {{ type fixedFluxPressure; value uniform 101325; }} {region}Outlet {{ type fixedValue; value uniform 101325; }}')
        else:
            foam(case/f'constant/{region}/fvOptions',f'chipHeat {{ type scalarSemiImplicitSource; active true; selectionMode all; volumeMode absolute; injectionRateSuSp {{ h ({p.local_heat_w} 0); }} }}')
    write_json(case/'model-mapping.json',{'method':'局部空气/铜板/水三域共轭换热；按入口 Reynolds 数选择层流或 kOmegaSST；稳态离散；0.6×0.2m 组件基准，非整机房 CAD','source_power_w':p.local_heat_w,'regions':['air','plate','water'],'cells':[max(12,p.cells_x),max(6,p.cells_y//2),14]})

def prepare_case(request:JobRequest,case:Path):
    case.mkdir(parents=True,exist_ok=True)
    if request.thermal.mode=='room_airflow':prepare_room(request,case)
    else:prepare_cht(request,case)
    (case/'case.foam').touch()

def command(args,case):
    bashrc=os.environ.get('AIDC_OPENFOAM_BASHRC')
    if bashrc:args=['bash','-c','source "$1" >/dev/null; shift; exec "$@"','aidc',bashrc,*args]
    process=subprocess.Popen(args,cwd=case,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
    output=[]
    for line in process.stdout:
        output.append(line);print(line,end='',flush=True)
    process.wait()
    if process.returncode:raise RuntimeError(f'{args[-1]}: OpenFOAM 命令失败，详见计算日志')
    return ''.join(output)

def field_values(path,vector=False,count=None):
    text=path.read_text(encoding='utf-8',errors='replace')
    match=re.search(r'internalField\s+nonuniform\s+List<[^>]+>\s+(\d+)\s*\((.*?)\)\s*;',text,re.S)
    if not match:
        uniform=re.search(r'internalField\s+uniform\s+([^;]+);',text)
        if uniform and count is not None:
            value=[float(v) for v in uniform[1].strip().strip('()').split()] if vector else float(uniform[1])
            return [value for _ in range(count)]
        raise ValueError(f'不支持的 OpenFOAM 输出场：{path.name}')
    if vector:values=[[float(v) for v in row.split()] for row in re.findall(r'\(([^()]+)\)',match[2])]
    else:values=[float(v) for v in match[2].split()]
    if len(values)!=int(match[1]):raise ValueError('OpenFOAM 场数量与声明不一致')
    return values

def solve(request:JobRequest,folder:Path):
    case=folder/'case';prepare_case(request,case)
    command(['blockMesh','-case',str(case)],case);command(['topoSet','-case',str(case)],case)
    local=request.thermal.mode=='local_cht'
    if local:command(['splitMeshRegions','-case',str(case),'-cellZones','-overwrite'],case)
    solver='chtMultiRegionFoam' if local else 'buoyantBoussinesqSimpleFoam'
    log=command([solver,'-case',str(case)],case)
    times=sorted([p for p in case.iterdir() if p.is_dir() and re.fullmatch(r'\d+(\.\d+)?',p.name)],key=lambda p:float(p.name))
    if not times or float(times[-1].name)==0:raise ValueError('没有生成有效的 OpenFOAM 计算时间步')
    latest=times[-1];region='plate' if local else None
    args=['postProcess','-case',str(case),'-func','writeCellCentres','-latestTime']
    if region:args+=['-region',region]
    command(args,case)
    target=latest/region if region else latest
    centres=field_values(target/'C',vector=True);temperatures=field_values(target/'T',count=len(centres))
    if len(centres)!=len(temperatures) or any(not math.isfinite(t) for t in temperatures):raise ValueError('温度场无效')
    values=[t-273.15 for t in temperatures]
    stride=max(1,math.ceil(len(values)/12000))
    points=centres[::stride] if local else [[x-48,z,y-30.5] for x,y,z in centres[::stride]]
    field={'kind':'local_temperature' if local else 'room_temperature','coordinates':'local_xyz_m' if local else 'world_xyz_m','points':points,'values':values[::stride],'unit':'°C','target_device':request.fem.target_device}
    if not local:
        U=field_values(target/'U',vector=True,count=len(centres))
        if any(not math.isfinite(v) for u in U for v in u):raise ValueError('速度场存在非有限值')
        field['velocity']=[[u[0],u[2],u[1]] for u in U[::stride]]
    residuals={};current_region=''
    for line in log.splitlines():
        region_match=re.search(r'Solving for (?:fluid|solid) region (\w+)',line)
        if region_match:current_region=region_match[1]+'/'
        residual_match=re.search(r'Solving for ([\w_]+), Initial residual = ([\deE.+-]+)',line)
        if residual_match:residuals[current_region+residual_match[1]]=float(residual_match[2])
    threshold=.01 if local else .001
    converged=bool(residuals) and all(v<threshold for k,v in residuals.items() if k.split('/')[-1]!='rho')
    write_json(folder/'field.json',field);write_json(folder/'residuals.json',residuals)
    import zipfile
    with zipfile.ZipFile(folder/'openfoam-case.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for path in case.rglob('*'):
            if path.is_file():archive.write(path,path.relative_to(case))
    return {'engine_version':'OpenCFD v2312','converged':converged,'metrics':[metric('max_temperature',max(values),'°C','最高温度'),metric('min_temperature',min(values),'°C','最低温度'),metric('cell_count',len(values),'','计算单元'),metric('max_residual',max(residuals.values()) if residuals else 1,'','末次初始残差')],'assets':[],'series':[],'field_file':'field.json','checks':[{'name':'残差收敛','passed':converged},{'name':'温度有限值','passed':all(math.isfinite(v) for v in values)}],'assumptions':{'parameters':request.thermal.model_dump(),'geometry':json.loads((case/'model-mapping.json').read_text(encoding='utf-8')),'scope':'现场边界、网格独立性与设备曲线尚需标定；房间模型使用体源而非服务器内部几何'},'artifacts':['field.json','residuals.json','openfoam-case.zip']}
