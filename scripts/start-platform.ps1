param([switch]$Build,[switch]$NoBrowser)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$runtime=Join-Path $projectRoot '.venv-sim\Scripts\python.exe'
if(-not(Test-Path -LiteralPath $runtime)){throw '先运行 scripts/setup-simulation.ps1 安装求解依赖'}
$logs=Join-Path $projectRoot '.solver-data'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$env:PYTHONUTF8='1'
$apiListener=Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue
if($Build -and $apiListener){
  $identity=Invoke-RestMethod 'http://127.0.0.1:8001/api/simulation/health'
  if($identity.service -ne 'aidc-simulation'){throw '8001 端口被其他服务使用'}
  $active=(Invoke-RestMethod 'http://127.0.0.1:8001/api/simulation/jobs').jobs | Where-Object { $_.status -in @('running','queued') }
  if(-not $active){
    $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($apiListener.OwningProcess)"
    $parent=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)" -ErrorAction SilentlyContinue
    $owned=($process.CommandLine -like "*$projectRoot*.venv-sim*") -or ($parent.CommandLine -like "*$projectRoot*.venv-sim*")
    if(-not $owned -or $process.CommandLine -notlike '*backend.api:app*'){throw '求解服务进程与当前项目不匹配，未停止该进程'}
    Stop-Process -Id $apiListener.OwningProcess
    $apiListener=$null
  }
}
if(-not $apiListener){
  Start-Process -FilePath $runtime -ArgumentList @('-m','uvicorn','backend.api:app','--host','127.0.0.1','--port','8001') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'api.stdout.log') -RedirectStandardError (Join-Path $logs 'api.stderr.log')
}else{
  $identity=Invoke-RestMethod 'http://127.0.0.1:8001/api/simulation/health'
  if($identity.service -ne 'aidc-simulation'){throw '8001 端口被其他服务使用'}
}
$ready=$false
for($attempt=0;$attempt -lt 20;$attempt++){
  try{$ready=(Invoke-RestMethod 'http://127.0.0.1:8001/api/simulation/health' -TimeoutSec 2).service -eq 'aidc-simulation';if($ready){break}}catch{}
  Start-Sleep -Milliseconds 250
}
if(-not $ready){throw '求解服务未就绪，请查看 .solver-data/api.stderr.log'}
if($Build -or -not(Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))){
  $env:RAYON_NUM_THREADS='2'
  & npm run build
  if($LASTEXITCODE -ne 0){throw '前端构建失败'}
}
$frontendListener=Get-NetTCPConnection -LocalPort 4186 -State Listen -ErrorAction SilentlyContinue
if($Build -and $frontendListener){
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($frontendListener.OwningProcess)"
  if($process.CommandLine -notlike "*$projectRoot*node_modules*" -or $process.CommandLine -notlike '*preview*'){throw '4186 端口进程与当前项目不匹配，未停止该进程'}
  Stop-Process -Id $frontendListener.OwningProcess
  $frontendListener=$null
}
if(-not $frontendListener){
  $node=(Get-Command node -ErrorAction Stop).Source
  $vite=Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
  Start-Process -FilePath $node -ArgumentList @(('"'+$vite+'"'),'preview','--host','127.0.0.1','--port','4186','--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'frontend.stdout.log') -RedirectStandardError (Join-Path $logs 'frontend.stderr.log')
}else{
  $identity=Invoke-RestMethod 'http://127.0.0.1:4186/__project'
  if($identity.project -ne 'compute-power-twin-copy'){throw '4186 端口被其他项目使用'}
}
if(-not $NoBrowser){Start-Process 'http://127.0.0.1:4186/?center=assets&scene=china'}
Write-Output '平台 http://127.0.0.1:4186/?center=assets&scene=china'
Write-Output '求解服务 http://127.0.0.1:8001/api/simulation/docs'
