# update-cache-buster.ps1
# 1) assets/js/*.js(원본)를 난독화해 assets/js-min/*.js로 재생성하고(obfuscate.ps1),
# 2) index.html의 __ASSET_V 와 모든 ?v= 값을 오늘 날짜 기준 새 버전으로 일괄 갱신합니다.
# 형식: YYYYMMDD<letter>  (같은 날 두 번째 배포 시 a -> b -> c ...)
#
# CSS·JS를 수정했다면 커밋 직전 이 스크립트 하나만 돌리면 됩니다 — 난독화 재생성과
# 캐시 버스터 갱신이 함께 처리됩니다.
#
# 사용: 프로젝트 루트(risk_dashboard/)에서 실행
#   pwsh ./tools/update-cache-buster.ps1
#   또는
#   powershell -File .\tools\update-cache-buster.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$indexPath = Resolve-Path (Join-Path $scriptDir '..\index.html')
$swPath    = Resolve-Path (Join-Path $scriptDir '..\sw.js')

# 1) 난독화 재생성 — assets/js/*.js가 바뀌었을 수 있으므로 매번 다시 만든다.
# 별도 powershell.exe 프로세스로 분리 실행 — 중첩 스크립트 호출 시 $MyInvocation이
# 꼬여 obfuscate.ps1이 자기 경로를 못 찾고 조용히 실패(그러면서 $LASTEXITCODE가 $null로
# 남아 "$null -ne 0"이 $true가 되는 바람에 오탐되는) 문제를 피하기 위함.
powershell -ExecutionPolicy Bypass -File (Join-Path $scriptDir 'obfuscate.ps1')
if ($LASTEXITCODE -ne 0) { Write-Error 'obfuscate.ps1 실패 — 캐시 버스터 갱신을 중단합니다.'; exit 1 }

$content = [System.IO.File]::ReadAllText($indexPath, [System.Text.UTF8Encoding]::new($false))

if ($content -notmatch "__ASSET_V\s*=\s*'(\d{8})([a-z]+)'") {
    Write-Error "Could not find __ASSET_V in index.html"
    exit 1
}

$oldDate   = $matches[1]
$oldLetter = $matches[2]
$oldValue  = "$oldDate$oldLetter"

$today = (Get-Date).ToString('yyyyMMdd')

if ($oldDate -eq $today) {
    # 같은 날이면 접미사 한 칸 증가 (a -> b -> ... -> z -> aa -> ab ...)
    $chars = $oldLetter.ToCharArray()
    $i = $chars.Length - 1
    while ($i -ge 0 -and $chars[$i] -eq 'z') {
        $chars[$i] = 'a'
        $i--
    }
    if ($i -lt 0) {
        $newLetter = 'a' + (-join $chars)
    } else {
        $chars[$i] = [char]([int][char]$chars[$i] + 1)
        $newLetter = -join $chars
    }
    $newValue = "$today$newLetter"
} else {
    # 새 날짜는 a 부터 시작
    $newValue = "${today}a"
}

if ($oldValue -eq $newValue) {
    Write-Host "Already up to date: $newValue"
    exit 0
}

# 전체 치환 (정확히 같은 옛 값만 바꾸도록 escape 적용)
$updated = [regex]::Replace($content, [regex]::Escape($oldValue), $newValue)
[System.IO.File]::WriteAllText($indexPath, $updated, [System.Text.UTF8Encoding]::new($false))

$swContent = [System.IO.File]::ReadAllText($swPath, [System.Text.UTF8Encoding]::new($false))
$swUpdated = [regex]::Replace($swContent, [regex]::Escape($oldValue), $newValue)
[System.IO.File]::WriteAllText($swPath, $swUpdated, [System.Text.UTF8Encoding]::new($false))

Write-Host "Cache buster updated: $oldValue -> $newValue"
