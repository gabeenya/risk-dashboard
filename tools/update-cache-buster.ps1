# update-cache-buster.ps1
# index.html의 __ASSET_V 와 모든 ?v= 값을 오늘 날짜 기준 새 버전으로 일괄 갱신합니다.
# 형식: YYYYMMDD<letter>  (같은 날 두 번째 배포 시 a -> b -> c ...)
#
# 사용: 프로젝트 루트(risk_dashboard/)에서 실행
#   pwsh ./tools/update-cache-buster.ps1
#   또는
#   powershell -File .\tools\update-cache-buster.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$indexPath = Resolve-Path (Join-Path $scriptDir '..\index.html')

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

Write-Host "Cache buster updated: $oldValue -> $newValue"
