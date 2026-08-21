# obfuscate.ps1
# assets/js/*.js (원본, 계속 이 폴더에서 편집) 를 난독화해서 assets/js-min/*.js 로 출력합니다.
# index.html과 sw.js는 assets/js-min을 로드하므로, 이 스크립트를 돌리지 않으면
# 실제 배포본(GitHub Pages)에는 반영되지 않습니다.
#
# 이 프로젝트는 각 JS 파일을 <script defer> 로 개별 로드하고(모듈/번들 없음),
# esc()/SB_URL/TYPES 같은 전역 함수·변수를 파일 간에 그대로 공유합니다.
# 그래서 전역 스코프의 이름은 절대 바꾸면 안 됩니다(다른 파일에서 그 이름으로 호출하므로) —
# javascript-obfuscator의 기본값(rename-globals=false)이 정확히 이 요구사항과 맞아떨어져서
# "함수/변수 안쪽 지역 로직·문자열만 흐려지고, 전역 API 이름은 그대로 유지"됩니다.
# 같은 이유로 콘솔 출력 차단(disable-console-output)도 켜지 않습니다 — 이 앱 자체가
# 에러 토스트에서 "콘솔(F12) 확인"을 안내하므로 그 경로를 막으면 안 됩니다.
#
# 사용: 프로젝트 루트(risk_dashboard/)에서 실행
#   powershell -ExecutionPolicy Bypass -File .\tools\obfuscate.ps1
# (update-cache-buster.ps1이 커밋 직전에 자동으로 이 스크립트를 호출합니다 — 보통 따로 실행할 필요 없음)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcDir = Resolve-Path (Join-Path $scriptDir '..\assets\js')
$outDir = Join-Path $scriptDir '..\assets\js-min'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$jsFiles = Get-ChildItem -Path $srcDir -Filter '*.js'
$count = 0
foreach ($f in $jsFiles) {
    $outPath = Join-Path $outDir $f.Name
    Write-Host "난독화: $($f.Name)"
    & npx --yes javascript-obfuscator $f.FullName --output $outPath `
        --compact true `
        --control-flow-flattening false `
        --dead-code-injection false `
        --debug-protection false `
        --disable-console-output false `
        --identifier-names-generator hexadecimal `
        --rename-globals false `
        --self-defending false `
        --string-array true `
        --string-array-encoding base64 `
        --string-array-threshold 0.75 `
        --simplify true `
        --split-strings false `
        --transform-object-keys false `
        --unicode-escape-sequence false
    if ($LASTEXITCODE -ne 0) { Write-Error "난독화 실패: $($f.Name)"; exit 1 }
    $count++
}
Write-Host "완료 — $count 개 파일을 assets/js-min/ 에 생성했습니다."
