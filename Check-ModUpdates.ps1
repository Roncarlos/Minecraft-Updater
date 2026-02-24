<#
.SYNOPSIS
    Checks CurseForge Minecraft instance mods for available updates and generates an HTML report.

.DESCRIPTION
    Reads minecraftinstance.json, queries the CurseForge API v1 for each installed mod,
    detects available updates and breaking changes (major version bumps), scans config
    files for mod dependencies, and produces a dark-themed HTML report.

.PARAMETER InstancePath
    Path to the CurseForge Minecraft instance folder containing minecraftinstance.json.

.PARAMETER OutputPath
    Path for the generated HTML report.

.PARAMETER CheckChangelogs
    If set, fetches changelogs for updated mods and scans for breaking-change keywords.

.PARAMETER Limit
    If greater than 0, only check this many mods (useful for quick testing).

.PARAMETER CacheMaxAge
    Maximum age in hours for cached API results. Default 24.

.PARAMETER NoCache
    If set, ignore the cache and force fresh API calls for all mods.

.EXAMPLE
    .\Check-ModUpdates.ps1
    .\Check-ModUpdates.ps1 -Limit 20
    .\Check-ModUpdates.ps1 -NoCache
    .\Check-ModUpdates.ps1 -CheckChangelogs
    .\Check-ModUpdates.ps1 -InstancePath "C:\path\to\instance" -OutputPath "report.html"
#>

[CmdletBinding()]
param(
    [string]$InstancePath = "C:\Users\mailf\curseforge\minecraft\Instances\[MODIFIED] Cobblemon OVERCLOCKED",
    [string]$OutputPath = (Join-Path $PWD "ModUpdateReport.html"),
    [switch]$CheckChangelogs,
    [int]$Limit = 0,
    [int]$CacheMaxAge = 24,
    [switch]$NoCache
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# ── CurseForge API ──────────────────────────────────────────────────────────
$ApiKey   = '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm'
$ApiBase  = 'https://api.curseforge.com/v1'
$Headers  = @{ 'x-api-key' = $ApiKey; 'Content-Type' = 'application/json' }

# ── Mod loader type mapping (CurseForge enum) ──────────────────────────────
$LoaderMap = @{
    1 = 'Forge'
    4 = 'Fabric'
    5 = 'Quilt'
    6 = 'NeoForge'
}

# ── Helper: extract semver from a filename ──────────────────────────────────
function Get-SemverFromFileName {
    param([string]$FileName)
    # Try multiple patterns to extract mod version (not MC version)
    # Remove .jar extension
    $name = $FileName -replace '\.jar$', ''
    # Remove common MC version patterns first
    $stripped = $name -replace '[_\-+]mc?1\.\d+(\.\d+)?', '' -replace '_mc1\.\d+(\.\d+)?', ''
    # Remove loader tags
    $stripped = $stripped -replace '(?i)[\-_]?(neo)?forge[\-_]?', '-' -replace '(?i)[\-_]?fabric[\-_]?', '-' -replace '(?i)[\-_]?quilt[\-_]?', '-'
    # Find version-like patterns (digits.digits.digits)
    if ($stripped -match '(\d+\.\d+\.\d+)') {
        return $Matches[1]
    }
    if ($stripped -match '(\d+\.\d+)') {
        return "$($Matches[1]).0"
    }
    return $null
}

# ── Helper: detect significant version bumps (major or minor) ──────────────
function Test-SignificantVersionBump {
    param([string]$OldVersion, [string]$NewVersion)
    if (-not $OldVersion -or -not $NewVersion) { return @{ IsBump = $false; Type = $null } }
    $oldParts = $OldVersion -split '\.'
    $newParts = $NewVersion -split '\.'
    $oldMajor = $oldParts[0]; $newMajor = $newParts[0]
    $oldMinor = if ($oldParts.Count -gt 1) { $oldParts[1] } else { '0' }
    $newMinor = if ($newParts.Count -gt 1) { $newParts[1] } else { '0' }
    if ($oldMajor -match '^\d+$' -and $newMajor -match '^\d+$') {
        if ([int]$newMajor -gt [int]$oldMajor) {
            return @{ IsBump = $true; Type = 'Major' }
        }
    }
    if ($oldMajor -eq $newMajor -and $oldMinor -match '^\d+$' -and $newMinor -match '^\d+$') {
        if ([int]$newMinor -gt [int]$oldMinor) {
            return @{ IsBump = $true; Type = 'Minor' }
        }
    }
    return @{ IsBump = $false; Type = $null }
}

# ── Helper: check changelog text for breaking-change keywords ──────────────
function Test-BreakingKeywords {
    param([string]$Text)
    $keywords = @('breaking', 'removed', 'incompatible', 'migration', 'deprecated',
                   'breaking change', 'not compatible', 'requires migration')
    foreach ($kw in $keywords) {
        if ($Text -match "(?i)\b$([regex]::Escape($kw))\b") {
            return $true
        }
    }
    return $false
}

# ── Load instance data ──────────────────────────────────────────────────────
$instanceFile = Join-Path $InstancePath 'minecraftinstance.json'
if (-not (Test-Path -LiteralPath $instanceFile)) {
    Write-Error "Instance file not found: $instanceFile"
    exit 1
}

Write-Host "Loading instance data from $instanceFile ..." -ForegroundColor Cyan
$instance = Get-Content -LiteralPath $instanceFile -Raw -Encoding UTF8 | ConvertFrom-Json

$mcVersion   = $instance.gameVersion
$loaderType  = $instance.baseModLoader.type
$loaderName  = if ($LoaderMap.ContainsKey($loaderType)) { $LoaderMap[$loaderType] } else { "Unknown ($loaderType)" }
$instanceName = if ($instance.manifest -and $instance.manifest.name) { $instance.manifest.name } else { Split-Path $InstancePath -Leaf }
$allAddons   = $instance.installedAddons

Write-Host "Instance : $instanceName" -ForegroundColor Green
Write-Host "MC       : $mcVersion" -ForegroundColor Green
Write-Host "Loader   : $loaderName (type $loaderType)" -ForegroundColor Green
Write-Host "Mods     : $($allAddons.Count)" -ForegroundColor Green

# ── Apply -Limit ────────────────────────────────────────────────────────────
if ($Limit -gt 0) {
    $addons = @($allAddons | Select-Object -First $Limit)
    Write-Host "Limit    : checking first $Limit mods only" -ForegroundColor Yellow
} else {
    $addons = $allAddons
}

Write-Host ""

# ── Config dependency scanning ──────────────────────────────────────────────
Write-Host "Scanning config files for mod references..." -ForegroundColor Cyan

# Build modid -> addonID mapping (from ALL addons, not just limited set)
$modIdToAddon  = @{}
$addonToModIds = @{}

foreach ($a in $allAddons) {
    $candidates = [System.Collections.Generic.List[string]]::new()

    # 1. URL slug: last segment of webSiteURL
    if ($a.webSiteURL) {
        $rawSlug = ($a.webSiteURL -split '/')[-1]
        $candidates.Add($rawSlug.ToLower())
        $cleanSlug = ($rawSlug -replace '-', '').ToLower()
        if ($cleanSlug -ne $rawSlug.ToLower()) {
            $candidates.Add($cleanSlug)
        }
    }

    # 2. Filename prefix (before version/loader markers)
    if ($a.installedFile.fileName) {
        $fn = $a.installedFile.fileName -replace '\.jar$', ''
        if ($fn -match '^([A-Za-z][A-Za-z0-9_]*?)[\-_+]') {
            $candidates.Add($Matches[1].ToLower())
        }
    }

    # 3. Mod name lowercased, no spaces/special chars
    if ($a.name) {
        $candidates.Add(($a.name -replace '[^a-zA-Z0-9]', '').ToLower())
    }

    $addonToModIds[$a.addonID] = $candidates
    foreach ($mid in $candidates) {
        if (-not $modIdToAddon.ContainsKey($mid)) {
            $modIdToAddon[$mid] = $a.addonID
        }
    }
}

# Scan config directories for modid:itemname patterns
$configRefCounts = @{}  # addonID -> count of references from OTHER mods' configs
$configRefFiles  = @{}  # addonID -> list of source files referencing it

$excludedModIds = @(
    'minecraft', 'c', 'neoforge', 'forge', 'http', 'https', 'java', 'net', 'com', 'org',
    'data', 'type', 'id', 'tag', 'key', 'value', 'true', 'false', 'modid', 'default',
    'null', 'name', 'text', 'file', 'item', 'block', 'entity', 'sound', 'model', 'texture',
    'assets', 'recipes', 'loot', 'tags', 'en', 'us', 'the', 'and', 'not', 'for', 'this',
    'that', 'with', 'from', 'have', 'are', 'all', 'any', 'its', 'class', 'mixin', 'asm',
    'fabric', 'quilt'
)
$excludeSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$excludedModIds)

$configDirs = @(
    (Join-Path $InstancePath 'config'),
    (Join-Path $InstancePath 'kubejs'),
    (Join-Path $InstancePath 'defaultconfigs')
)
$configExtensions = @('*.toml', '*.json', '*.json5', '*.cfg', '*.js')
$modRefRegex = [regex]::new('([a-z][a-z0-9_]{1,30}):([a-z][a-z0-9_/]{1,60})')

$scannedFiles = 0
foreach ($dir in $configDirs) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    foreach ($ext in $configExtensions) {
        $foundFiles = Get-ChildItem -LiteralPath $dir -Filter $ext -Recurse -File -ErrorAction SilentlyContinue
        foreach ($f in $foundFiles) {
            $scannedFiles++
            $content = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }

            # Determine owner of this config file based on subdirectory name
            $relPath = $f.FullName.Substring($InstancePath.Length).TrimStart('\', '/')
            $pathParts = $relPath -split '[\\/]'
            $ownerAddonId = $null
            if ($pathParts.Count -ge 2) {
                $subDir = $pathParts[1].ToLower()
                if ($modIdToAddon.ContainsKey($subDir)) {
                    $ownerAddonId = $modIdToAddon[$subDir]
                }
            }

            $refMatches = $modRefRegex.Matches($content.ToLower())
            foreach ($m in $refMatches) {
                $foundModId = $m.Groups[1].Value
                if ($excludeSet.Contains($foundModId)) { continue }
                if (-not $modIdToAddon.ContainsKey($foundModId)) { continue }

                $referencedAddonId = $modIdToAddon[$foundModId]

                # Skip self-references
                if ($null -ne $ownerAddonId -and $referencedAddonId -eq $ownerAddonId) { continue }

                if (-not $configRefCounts.ContainsKey($referencedAddonId)) {
                    $configRefCounts[$referencedAddonId] = 0
                    $configRefFiles[$referencedAddonId] = [System.Collections.Generic.List[string]]::new()
                }
                $configRefCounts[$referencedAddonId]++
                if (-not $configRefFiles[$referencedAddonId].Contains($relPath)) {
                    $configRefFiles[$referencedAddonId].Add($relPath)
                }
            }
        }
    }
}

$modsWithRefs = ($configRefCounts.Keys | Measure-Object).Count
Write-Host "Scanned $scannedFiles config files, found references to $modsWithRefs mods" -ForegroundColor Green
Write-Host ""

# ── Load cache ──────────────────────────────────────────────────────────────
$cachePath = Join-Path $PSScriptRoot 'ModUpdateCache.json'
$cache = @{}
if (-not $NoCache -and (Test-Path -LiteralPath $cachePath)) {
    try {
        $cacheRaw = Get-Content -LiteralPath $cachePath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($prop in $cacheRaw.PSObject.Properties) {
            $cache[$prop.Name] = $prop.Value
        }
        Write-Host "Loaded cache with $($cache.Count) entries" -ForegroundColor Cyan
    } catch {
        Write-Host "Cache file corrupted, starting fresh" -ForegroundColor Yellow
        $cache = @{}
    }
}

# Count how many will use cache vs API
$now = Get-Date
$cacheHits = 0
$apiCalls = 0
foreach ($a in $addons) {
    $cKey = [string]$a.addonID
    if (-not $NoCache -and $cache.ContainsKey($cKey)) {
        try {
            $checkedAt = [datetime]$cache[$cKey].checkedAt
            if (($now - $checkedAt).TotalHours -lt $CacheMaxAge) {
                $cacheHits++
                continue
            }
        } catch { }
    }
    $apiCalls++
}
Write-Host "Cache: $cacheHits mods cached, $apiCalls API calls needed" -ForegroundColor Cyan
Write-Host ""

# ── Query API for each mod ──────────────────────────────────────────────────
$results = [System.Collections.Generic.List[PSObject]]::new()
$errors  = [System.Collections.Generic.List[PSObject]]::new()
$total   = ($addons | Measure-Object).Count
$i       = 0

foreach ($addon in $addons) {
    $i++
    $addonID       = $addon.addonID
    $installedFile = $addon.installedFile
    $installedId   = $installedFile.id
    $installedName = $installedFile.fileName
    $installedDate = $installedFile.fileDate
    $modName       = $addon.name
    $modUrl        = $addon.webSiteURL
    $configRefs    = if ($configRefCounts.ContainsKey($addonID)) { $configRefCounts[$addonID] } else { 0 }
    $configFilesList = if ($configRefFiles.ContainsKey($addonID)) { @($configRefFiles[$addonID]) } else { @() }

    # Check cache
    $cKey = [string]$addonID
    $useCache = $false
    if (-not $NoCache -and $cache.ContainsKey($cKey)) {
        try {
            $checkedAt = [datetime]$cache[$cKey].checkedAt
            if (($now - $checkedAt).TotalHours -lt $CacheMaxAge) {
                $useCache = $true
            }
        } catch { }
    }

    $pct = [math]::Floor(($i / $total) * 100)
    $source = if ($useCache) { "cached" } else { "API" }
    Write-Progress -Activity "Checking mod updates" -Status "$i / $total - $modName ($source)" -PercentComplete $pct

    if ($useCache) {
        $cached = $cache[$cKey]
        $latestFileName = $cached.latestFileName
        $latestFileDate = $cached.latestFileDate
        $latestFileId   = $cached.latestFileId
        $latestVer      = $cached.latestVersion
        $installedVer   = Get-SemverFromFileName $installedName

        $hasUpdate = $latestFileId -ne $installedId

        $isBreaking     = $false
        $breakingReason = $null

        if ($hasUpdate) {
            $vbump = Test-SignificantVersionBump $installedVer $latestVer
            if ($vbump.IsBump) {
                $isBreaking = $true
                $breakingReason = "$($vbump.Type) version bump: $installedVer -> $latestVer"
            }
        }

        $results.Add([PSObject]@{
            Name             = $modName
            AddonID          = $addonID
            InstalledFile    = $installedName
            InstalledDate    = $installedDate
            InstalledVersion = $installedVer
            LatestFile       = $latestFileName
            LatestDate       = $latestFileDate
            LatestVersion    = $latestVer
            HasUpdate        = $hasUpdate
            IsBreaking       = $isBreaking
            BreakingReason   = $breakingReason
            ChangelogHtml    = $null
            Url              = $modUrl
            ConfigRefs       = $configRefs
            ConfigFiles      = $configFilesList
        })
        continue
    }

    # Query API
    try {
        $uri = "$ApiBase/mods/$addonID/files?gameVersion=$mcVersion&modLoaderType=$loaderType&pageSize=50"
        $resp = Invoke-RestMethod -Uri $uri -Headers $Headers -TimeoutSec 15

        $files = $resp.data
        if (-not $files -or $files.Count -eq 0) {
            # No files found for this version/loader combo – mod is up to date or unlisted
            $results.Add([PSObject]@{
                Name           = $modName
                AddonID        = $addonID
                InstalledFile  = $installedName
                InstalledDate  = $installedDate
                InstalledVersion = Get-SemverFromFileName $installedName
                LatestFile     = $null
                LatestDate     = $null
                LatestVersion  = $null
                HasUpdate      = $false
                IsBreaking     = $false
                BreakingReason = $null
                ChangelogHtml  = $null
                Url            = $modUrl
                ConfigRefs     = $configRefs
                ConfigFiles    = $configFilesList
            })
            continue
        }

        # Find the most recent Release (releaseType=1) file by date
        $releases = $files | Where-Object { $_.releaseType -eq 1 } | Sort-Object fileDate -Descending
        $latest = if ($releases) { $releases[0] } else { $files | Sort-Object fileDate -Descending | Select-Object -First 1 }

        $hasUpdate = $latest.id -ne $installedId

        $installedVer = Get-SemverFromFileName $installedName
        $latestVer    = Get-SemverFromFileName $latest.fileName

        # Update cache
        $cache[$cKey] = @{
            latestFileId   = $latest.id
            latestFileName = $latest.fileName
            latestFileDate = [string]$latest.fileDate
            latestVersion  = $latestVer
            checkedAt      = $now.ToString('o')
        }

        # Determine breaking change
        $isBreaking     = $false
        $breakingReason = $null
        $changelogHtml  = $null

        if ($hasUpdate) {
            $vbump = Test-SignificantVersionBump $installedVer $latestVer
            if ($vbump.IsBump) {
                $isBreaking = $true
                $breakingReason = "$($vbump.Type) version bump: $installedVer -> $latestVer"
            }

            # Fetch changelog if requested
            if ($CheckChangelogs) {
                try {
                    $clUri = "$ApiBase/mods/$addonID/files/$($latest.id)/changelog"
                    $clResp = Invoke-RestMethod -Uri $clUri -Headers $Headers -TimeoutSec 15
                    $changelogHtml = $clResp.data
                    if ($changelogHtml -and (Test-BreakingKeywords $changelogHtml)) {
                        $isBreaking = $true
                        if ($breakingReason) {
                            $breakingReason += " + breaking keywords in changelog"
                        } else {
                            $breakingReason = "Breaking keywords found in changelog"
                        }
                    }
                    Start-Sleep -Milliseconds 50
                } catch {
                    # Changelog fetch failed, not critical
                }
            }
        }

        $results.Add([PSObject]@{
            Name             = $modName
            AddonID          = $addonID
            InstalledFile    = $installedName
            InstalledDate    = $installedDate
            InstalledVersion = $installedVer
            LatestFile       = $latest.fileName
            LatestDate       = $latest.fileDate
            LatestVersion    = $latestVer
            HasUpdate        = $hasUpdate
            IsBreaking       = $isBreaking
            BreakingReason   = $breakingReason
            ChangelogHtml    = $changelogHtml
            Url              = $modUrl
            ConfigRefs       = $configRefs
            ConfigFiles      = $configFilesList
        })
    } catch {
        $errors.Add([PSObject]@{
            Name    = $modName
            AddonID = $addonID
            Error   = $_.Exception.Message
        })
    }

    # Throttle API calls
    Start-Sleep -Milliseconds 100
}
Write-Progress -Activity "Checking mod updates" -Completed

# ── Save cache ──────────────────────────────────────────────────────────────
try {
    $cache | ConvertTo-Json -Depth 5 | Out-File -FilePath $cachePath -Encoding UTF8
    Write-Host "Cache saved ($($cache.Count) entries)" -ForegroundColor Cyan
} catch {
    Write-Host "Failed to save cache: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ── Classify results ────────────────────────────────────────────────────────
# Breaking = version bump + has config dependents (risky to update)
# Safe to Update = version bump + NO config dependents (safe despite bump)
# Updates = update available, no version bump
# Up to date = no update
$breaking    = @($results | Where-Object { $_.IsBreaking -and $_.ConfigRefs -gt 0 })
$safeToUpdate = @($results | Where-Object { $_.IsBreaking -and $_.ConfigRefs -eq 0 })
$updates     = @($results | Where-Object { $_.HasUpdate -and -not $_.IsBreaking })
$upToDate    = @($results | Where-Object { -not $_.HasUpdate })

Write-Host ""
Write-Host "Results:" -ForegroundColor Cyan
Write-Host "  Breaking changes : $($breaking.Count)" -ForegroundColor Red
Write-Host "  Safe to update   : $($safeToUpdate.Count)" -ForegroundColor Blue
Write-Host "  Updates available: $($updates.Count)" -ForegroundColor Yellow
Write-Host "  Up to date       : $($upToDate.Count)" -ForegroundColor Green
Write-Host "  API errors       : $($errors.Count)" -ForegroundColor DarkGray
Write-Host ""

# ── Generate HTML report ────────────────────────────────────────────────────
function ConvertTo-HtmlRow {
    param($Item, [string]$RowClass)
    $name = [System.Web.HttpUtility]::HtmlEncode($Item.Name)
    $link = if ($Item.Url) { "<a href=`"$($Item.Url)`" target=`"_blank`">$name</a>" } else { $name }
    $installed = [System.Web.HttpUtility]::HtmlEncode($Item.InstalledFile)
    $latest    = if ($Item.LatestFile) { [System.Web.HttpUtility]::HtmlEncode($Item.LatestFile) } else { "-" }
    $change    = if ($Item.BreakingReason) { [System.Web.HttpUtility]::HtmlEncode($Item.BreakingReason) }
                 elseif ($Item.HasUpdate) { "Update available" }
                 else { "Up to date" }

    # Config refs with tooltip
    $refs = $Item.ConfigRefs
    $cfgFiles = @($Item.ConfigFiles)
    $refsHtml = if ($refs -gt 0 -and $cfgFiles.Count -gt 0) {
        $tooltip = ($cfgFiles | Select-Object -First 20) -join "&#10;"
        if ($cfgFiles.Count -gt 20) { $tooltip += "&#10;... and $($cfgFiles.Count - 20) more" }
        "<span title=`"$([System.Web.HttpUtility]::HtmlAttributeEncode($tooltip))`" style=`"cursor:help;border-bottom:1px dotted var(--muted)`">$refs</span>"
    } else {
        "$refs"
    }

    return "<tr class=`"$RowClass`"><td>$link</td><td>$installed</td><td>$latest</td><td>$refsHtml</td><td>$change</td></tr>"
}

# Need System.Web for HTML encoding
Add-Type -AssemblyName System.Web

$scanDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$totalMods = $results.Count + $errors.Count

$html = @"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mod Update Report - $([System.Web.HttpUtility]::HtmlEncode($instanceName))</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #8b949e;
    --red: #f85149;
    --red-bg: #2d1215;
    --yellow: #d29922;
    --yellow-bg: #2d2a14;
    --green: #3fb950;
    --green-bg: #122117;
    --blue: #58a6ff;
    --blue-bg: #121d2f;
    --cyan: #39d2c0;
    --cyan-bg: #0f2d2a;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    padding: 2rem;
  }
  .header {
    text-align: center;
    margin-bottom: 2rem;
    padding: 2rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .header h1 {
    font-size: 1.8rem;
    margin-bottom: 0.5rem;
    background: linear-gradient(135deg, var(--blue), var(--green));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .header .meta { color: var(--muted); font-size: 0.9rem; }
  .stats {
    display: flex;
    justify-content: center;
    gap: 2rem;
    margin-top: 1.5rem;
    flex-wrap: wrap;
  }
  .stat {
    text-align: center;
    padding: 0.8rem 1.5rem;
    border-radius: 8px;
    min-width: 140px;
  }
  .stat .number { font-size: 2rem; font-weight: 700; }
  .stat .label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-breaking { background: var(--red-bg); border: 1px solid var(--red); }
  .stat-breaking .number { color: var(--red); }
  .stat-safe { background: var(--cyan-bg); border: 1px solid var(--cyan); }
  .stat-safe .number { color: var(--cyan); }
  .stat-update { background: var(--yellow-bg); border: 1px solid var(--yellow); }
  .stat-update .number { color: var(--yellow); }
  .stat-ok { background: var(--green-bg); border: 1px solid var(--green); }
  .stat-ok .number { color: var(--green); }

  .section { margin-bottom: 2rem; }
  .section h2 {
    font-size: 1.3rem;
    padding: 0.8rem 1rem;
    border-radius: 8px 8px 0 0;
    border: 1px solid var(--border);
    border-bottom: none;
  }
  .section-breaking h2 { background: var(--red-bg); color: var(--red); border-color: var(--red); }
  .section-safe h2     { background: var(--cyan-bg); color: var(--cyan); border-color: var(--cyan); }
  .section-update h2   { background: var(--yellow-bg); color: var(--yellow); border-color: var(--yellow); }
  .section-ok h2       { background: var(--green-bg); color: var(--green); border-color: var(--green); }

  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0 0 8px 8px;
    overflow: hidden;
  }
  th {
    background: #1c2128;
    text-align: left;
    padding: 0.6rem 1rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
    max-width: 350px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover { background: #1c2128; }
  tr.row-breaking td:first-child { border-left: 3px solid var(--red); }
  tr.row-safe td:first-child     { border-left: 3px solid var(--cyan); }
  tr.row-update td:first-child   { border-left: 3px solid var(--yellow); }
  tr.row-ok td:first-child       { border-left: 3px solid var(--green); }
  a { color: var(--blue); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .changelog-section {
    margin-top: 2rem;
    padding: 1.5rem;
    background: var(--surface);
    border: 1px solid var(--red);
    border-radius: 8px;
  }
  .changelog-section h2 { color: var(--red); margin-bottom: 1rem; }
  .changelog-entry {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .changelog-entry h3 { color: var(--yellow); margin-bottom: 0.5rem; font-size: 1rem; }
  .changelog-entry .cl-content {
    font-size: 0.85rem;
    color: var(--muted);
    max-height: 300px;
    overflow-y: auto;
    padding: 0.5rem;
  }
  .changelog-entry .cl-content ul { padding-left: 1.5rem; }
  .changelog-entry .cl-content a { color: var(--blue); }

  .errors {
    margin-top: 2rem;
    padding: 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .errors h3 { color: var(--muted); margin-bottom: 0.5rem; }
  .errors ul { padding-left: 1.5rem; color: var(--muted); font-size: 0.85rem; }

  .footer {
    text-align: center;
    margin-top: 2rem;
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
</head>
<body>

<div class="header">
  <h1>Mod Update Report</h1>
  <div class="meta">
    <strong>$([System.Web.HttpUtility]::HtmlEncode($instanceName))</strong><br>
    Minecraft $mcVersion &middot; $loaderName &middot; $totalMods mods scanned<br>
    $scanDate
  </div>
  <div class="stats">
    <div class="stat stat-breaking">
      <div class="number">$($breaking.Count)</div>
      <div class="label">Breaking Changes</div>
    </div>
    <div class="stat stat-safe">
      <div class="number">$($safeToUpdate.Count)</div>
      <div class="label">Safe to Update</div>
    </div>
    <div class="stat stat-update">
      <div class="number">$($updates.Count)</div>
      <div class="label">Updates Available</div>
    </div>
    <div class="stat stat-ok">
      <div class="number">$($upToDate.Count)</div>
      <div class="label">Up to Date</div>
    </div>
  </div>
</div>
"@

# ── Breaking changes section ────────────────────────────────────────────────
if ($breaking.Count -gt 0) {
    $html += @"

<div class="section section-breaking">
  <h2>Breaking Changes ($($breaking.Count))</h2>
  <table>
    <thead><tr><th>Mod</th><th>Installed</th><th>Available</th><th>Config Refs</th><th>Reason</th></tr></thead>
    <tbody>
"@
    foreach ($item in ($breaking | Sort-Object { $_.Name })) {
        $html += "      $(ConvertTo-HtmlRow $item 'row-breaking')`n"
    }
    $html += "    </tbody>`n  </table>`n</div>`n"
}

# ── Safe to Update section ──────────────────────────────────────────────────
if ($safeToUpdate.Count -gt 0) {
    $html += @"

<div class="section section-safe">
  <h2>Safe to Update ($($safeToUpdate.Count))</h2>
  <table>
    <thead><tr><th>Mod</th><th>Installed</th><th>Available</th><th>Config Refs</th><th>Reason</th></tr></thead>
    <tbody>
"@
    foreach ($item in ($safeToUpdate | Sort-Object { $_.Name })) {
        $html += "      $(ConvertTo-HtmlRow $item 'row-safe')`n"
    }
    $html += "    </tbody>`n  </table>`n</div>`n"
}

# ── Updates section ─────────────────────────────────────────────────────────
if ($updates.Count -gt 0) {
    $html += @"

<div class="section section-update">
  <h2>Updates Available ($($updates.Count))</h2>
  <table>
    <thead><tr><th>Mod</th><th>Installed</th><th>Available</th><th>Config Refs</th><th>Status</th></tr></thead>
    <tbody>
"@
    foreach ($item in ($updates | Sort-Object { $_.Name })) {
        $html += "      $(ConvertTo-HtmlRow $item 'row-update')`n"
    }
    $html += "    </tbody>`n  </table>`n</div>`n"
}

# ── Up to date section ──────────────────────────────────────────────────────
if ($upToDate.Count -gt 0) {
    $html += @"

<div class="section section-ok">
  <h2>Up to Date ($($upToDate.Count))</h2>
  <table>
    <thead><tr><th>Mod</th><th>Installed</th><th>Available</th><th>Config Refs</th><th>Status</th></tr></thead>
    <tbody>
"@
    foreach ($item in ($upToDate | Sort-Object { $_.Name })) {
        $html += "      $(ConvertTo-HtmlRow $item 'row-ok')`n"
    }
    $html += "    </tbody>`n  </table>`n</div>`n"
}

# ── Changelog details for breaking changes ──────────────────────────────────
$allBreakingMods = @($breaking) + @($safeToUpdate)
$breakingWithChangelogs = $allBreakingMods | Where-Object { $_.ChangelogHtml }
if ($breakingWithChangelogs) {
    $html += @"

<div class="changelog-section">
  <h2>Changelog Details - Breaking Changes</h2>
"@
    foreach ($item in ($breakingWithChangelogs | Sort-Object { $_.Name })) {
        $escapedName = [System.Web.HttpUtility]::HtmlEncode($item.Name)
        $html += @"
  <div class="changelog-entry">
    <h3>$escapedName ($($item.InstalledVersion) &rarr; $($item.LatestVersion))</h3>
    <div class="cl-content">$($item.ChangelogHtml)</div>
  </div>
"@
    }
    $html += "</div>`n"
}

# ── API errors section ──────────────────────────────────────────────────────
if ($errors.Count -gt 0) {
    $html += @"

<div class="errors">
  <h3>API Errors ($($errors.Count))</h3>
  <ul>
"@
    foreach ($err in ($errors | Sort-Object { $_.Name })) {
        $html += "    <li><strong>$([System.Web.HttpUtility]::HtmlEncode($err.Name))</strong> (ID $($err.AddonID)): $([System.Web.HttpUtility]::HtmlEncode($err.Error))</li>`n"
    }
    $html += "  </ul>`n</div>`n"
}

# ── Footer ──────────────────────────────────────────────────────────────────
$html += @"

<div class="footer">
  Generated by Check-ModUpdates.ps1 &middot; CurseForge API v1
</div>

</body>
</html>
"@

# ── Write report ────────────────────────────────────────────────────────────
$html | Out-File -FilePath $OutputPath -Encoding UTF8
Write-Host "Report saved to: $OutputPath" -ForegroundColor Cyan
Write-Host "Opening in browser..." -ForegroundColor Cyan
Start-Process $OutputPath
