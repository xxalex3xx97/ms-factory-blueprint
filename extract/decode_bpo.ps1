# Decode BPO default objects (block / machine blueprints) to JSON with CUE4Parse. Static, game not launched.
# usage: powershell -NoProfile -ExecutionPolicy Bypass -File extract\decode_bpo.ps1 -Names BPO_Dock_2,BPO_CommandModule [-Dir BuildingBlocks] [-Out F:\ms-tools\json2]
# Then:  python -I extract\bpo_props.py F:\ms-tools\json2
# Output is temp (outside the repo): delete -Out when done.
param(
  [Parameter(Mandatory = $true)][string[]]$Names,
  [string]$Dir = 'BuildingBlocks',
  [string]$Out = 'F:\ms-tools\json2'
)
$ErrorActionPreference = 'Stop'
$env:DOTNET_ROOT = 'F:\ms-tools\dotnet'
$env:DOTNET_CLI_HOME = 'F:\ms-tools\home'
$env:NUGET_PACKAGES = 'F:\ms-tools\nuget'
$cli = 'F:\ms-tools\cue4parse-bin\CUE4Parse.CLI.exe'
$paks = 'F:\SteamLibrary\steamapps\common\Main Sequence Demo\Windows\MainSequence\Content\Paks'
$usmap = 'F:\ms-tools\Mappings.usmap'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$pk = @()
foreach ($n in $Names) { $pk += '-p'; $pk += "MainSequence/Content/Blueprints/$Dir/$n.uasset" }
& $cli -i $paks -g GAME_UE5_7 -m $usmap @pk -f json -o $Out -y
if ($LASTEXITCODE -ne 0) { throw "CUE4Parse.CLI failed (exit $LASTEXITCODE)" }
Write-Output "decoded $($Names.Count) BPO(s) to $Out"
