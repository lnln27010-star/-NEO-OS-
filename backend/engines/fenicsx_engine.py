"""3D conduction with water/air Robin boundaries; FEniCSx 0.9 API."""
from pathlib import Path
from backend.models import JobRequest
from .common import write_json, metric

def solve(request:JobRequest,folder:Path):
    import dolfinx
    from dolfinx import mesh, fem, io
    from dolfinx.fem.petsc import LinearProblem
    from mpi4py import MPI
    from petsc4py import PETSc
    import numpy as np
    import ufl
    p=request.fem
    domain=mesh.create_box(MPI.COMM_WORLD,[np.array([0.,0.,0.]),np.array([p.length_m,p.width_m,p.thickness_m])],[p.cells,max(4,int(p.cells*p.width_m/p.length_m)),4],cell_type=mesh.CellType.tetrahedron)
    V=fem.functionspace(domain,('Lagrange',1))
    fdim=domain.topology.dim-1
    bottom=mesh.locate_entities_boundary(domain,fdim,lambda x:np.isclose(x[2],0))
    top=mesh.locate_entities_boundary(domain,fdim,lambda x:np.isclose(x[2],p.thickness_m))
    indices=np.concatenate([bottom,top]).astype(np.int32);values=np.concatenate([np.full(len(bottom),1),np.full(len(top),2)]).astype(np.int32);order=np.argsort(indices)
    tags=mesh.meshtags(domain,fdim,indices[order],values[order]);ds=ufl.Measure('ds',domain=domain,subdomain_data=tags)
    x=ufl.SpatialCoordinate(domain);half_x=p.length_m*p.chip_fraction/2;half_y=p.width_m*p.chip_fraction/2
    on_chip=ufl.And(ufl.le(abs(x[0]-p.length_m/2),half_x),ufl.le(abs(x[1]-p.width_m/2),half_y))
    patch=ufl.conditional(on_chip,1.,0.)
    area=domain.comm.allreduce(fem.assemble_scalar(fem.form(patch*ds(2))),op=MPI.SUM)
    if area<=0:raise ValueError('发热区域未被网格分辨，请细化网格或增大发热面积')
    u=ufl.TrialFunction(V);v=ufl.TestFunction(V)
    a=p.conductivity_w_mk*ufl.inner(ufl.grad(u),ufl.grad(v))*ufl.dx+p.water_h_w_m2k*u*v*ds(1)+p.air_h_w_m2k*u*v*ds(2)
    L=(p.heat_w/area)*patch*v*ds(2)+p.water_h_w_m2k*p.water_c*v*ds(1)+p.air_h_w_m2k*p.air_c*v*ds(2)
    options={'ksp_type':'preonly','pc_type':'lu'}
    kwargs={'petsc_options':options}
    # Newer DOLFINx requires an explicit options prefix; 0.9 uses the original constructor.
    import inspect
    if 'petsc_options_prefix' in inspect.signature(LinearProblem).parameters:kwargs['petsc_options_prefix']='aidc_thermal_'
    problem=LinearProblem(a,L,**kwargs);T=problem.solve();T.name='temperature_c'
    reason=int(problem.solver.getConvergedReason())
    if reason<=0:raise ValueError(f'PETSc 未收敛：{reason}')
    water=domain.comm.allreduce(fem.assemble_scalar(fem.form(p.water_h_w_m2k*(T-p.water_c)*ds(1))),op=MPI.SUM)
    air=domain.comm.allreduce(fem.assemble_scalar(fem.form(p.air_h_w_m2k*(T-p.air_c)*ds(2))),op=MPI.SUM)
    error=abs(water+air-p.heat_w)/p.heat_w
    points=V.tabulate_dof_coordinates();temps=T.x.array.real
    max_t=float(domain.comm.allreduce(np.max(temps),op=MPI.MAX));min_t=float(domain.comm.allreduce(np.min(temps),op=MPI.MIN))
    with io.XDMFFile(domain.comm,str(folder/'temperature.xdmf'),'w') as f:f.write_mesh(domain);f.write_function(T)
    import math
    stride=max(1,math.ceil(len(points)/12000))
    field={'kind':'local_temperature','coordinates':'local_xyz_m','target_device':p.target_device,'points':points[::stride].tolist(),'values':temps[::stride].tolist(),'unit':'°C','bounds':[0,p.length_m,0,p.width_m,0,p.thickness_m]}
    write_json(folder/'field.json',field)
    return {'engine_version':dolfinx.__version__,'converged':True,'metrics':[metric('max_temperature',max_t,'°C','最高温度'),metric('min_temperature',min_t,'°C','最低温度'),metric('water_heat',float(water),'W','水侧移热'),metric('air_heat',float(air),'W','空气侧移热'),metric('heat_balance_error',error*100,'%','热平衡误差'),metric('degrees_of_freedom',int(V.dofmap.index_map.size_global),'','自由度')], 'series':[],'assets':[],'field_file':'field.json','checks':[{'name':'PETSc 收敛','passed':reason>0},{'name':'热量守恒','passed':error<.01}],'assumptions':{'model':'三维稳态导热有限元，局部顶部面热源，底部水冷与顶部风冷 Robin 边界','parameters':p.model_dump(),'scope':'换热系数为用户输入；未解析微通道流动、接触热阻和辐射，不代表整机 CFD'},'artifacts':['field.json','temperature.xdmf','temperature.h5']}
