param([switch]$Containers)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$runtime=Join-Path $projectRoot '.venv-sim\Scripts\python.exe'
if(-not(Test-Path -LiteralPath $runtime)){
  & py -3.12 -m venv (Join-Path $projectRoot '.venv-sim')
  if($LASTEXITCODE -ne 0){throw '需要 Python 3.12 或可用的 py 启动器'}
}
$requirements=Join-Path $projectRoot 'backend\requirements.lock.txt'
if(-not(Test-Path -LiteralPath $requirements)){$requirements=Join-Path $projectRoot 'backend\requirements.txt'}
& $runtime -m pip install -r $requirements
if($LASTEXITCODE -ne 0){throw '求解依赖安装失败'}
if($Containers){
  if(-not(Get-Command docker -ErrorAction SilentlyContinue)){throw '请先配置 Docker Linux 容器环境，再运行 -Containers'}
  & docker build -f backend/containers/openfoam.Dockerfile -t aidc-openfoam:2312 .
  if($LASTEXITCODE -ne 0){throw 'OpenFOAM 镜像构建失败'}
  & docker build -f backend/containers/fenicsx.Dockerfile -t aidc-fenicsx:0.9.0 .
  if($LASTEXITCODE -ne 0){throw 'FEniCSx 镜像构建失败'}
}
Write-Output '求解环境安装完成。运行 scripts/start-platform.ps1 启动平台。'
