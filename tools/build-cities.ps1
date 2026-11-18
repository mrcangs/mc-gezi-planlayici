param([string]$Raw, [string]$Out)
# GeoNames cities1000 + admin1 + countryInfo -> data/countries.json + data/cities/<CC>.json
# Şehir dosyası: {"a":[eyalet adları],"c":[[ad, eyaletIdx, "türkçe ad"?], ...]} nüfusa göre azalan
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function J([string]$s) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('"')
  foreach ($ch in $s.ToCharArray()) {
    $c = [int]$ch
    if ($ch -eq '"') { [void]$sb.Append('\"') }
    elseif ($ch -eq '\') { [void]$sb.Append('\\') }
    elseif ($c -lt 32) { [void]$sb.Append(('\u{0:x4}' -f $c)) }
    else { [void]$sb.Append($ch) }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}

# Türkçede yerleşik farklı adı olan şehirler (CC|GeoNames adı -> Türkçe ad)
$TR = @{
  'GB|London'='Londra'; 'GB|Edinburgh'='Edinburg'; 'DE|Munich'='Münih'; 'DE|Nuremberg'='Nürnberg';
  'AT|Vienna'='Viyana'; 'IT|Rome'='Roma'; 'IT|Milan'='Milano'; 'IT|Naples'='Napoli'; 'IT|Florence'='Floransa';
  'IT|Venice'='Venedik'; 'IT|Turin'='Torino'; 'IT|Genoa'='Cenova'; 'GR|Athens'='Atina'; 'GR|Thessaloniki'='Selanik';
  'GR|Rhodes'='Rodos'; 'CZ|Prague'='Prag'; 'PL|Warsaw'='Varşova'; 'PL|Krakow'='Krakov'; 'PT|Lisbon'='Lizbon';
  'DK|Copenhagen'='Kopenhag'; 'RU|Moscow'='Moskova'; 'BE|Brussels'='Brüksel'; 'BE|Antwerp'='Anvers';
  'CH|Geneva'='Cenevre'; 'CH|Zurich'='Zürih'; 'NL|The Hague'='Lahey'; 'EG|Cairo'='Kahire';
  'EG|Alexandria'='İskenderiye'; 'MA|Marrakesh'='Marakeş'; 'CN|Beijing'='Pekin'; 'LB|Beirut'='Beyrut'; 'SY|Damascus'='Şam';
  'SY|Aleppo'='Halep'; 'IQ|Baghdad'='Bağdat'; 'IR|Tehran'='Tahran'; 'GE|Tbilisi'='Tiflis'; 'GE|Batumi'='Batum';
  'AZ|Baku'='Bakü'; 'UA|Kyiv'='Kiev'; 'BG|Sofia'='Sofya'; 'BG|Plovdiv'='Filibe'; 'RS|Belgrade'='Belgrad';
  'RO|Bucharest'='Bükreş'; 'BA|Sarajevo'='Saraybosna'; 'MK|Skopje'='Üsküp'; 'CY|Nicosia'='Lefkoşa'; 'AL|Tirana'='Tiran';
  'SA|Makkah'='Mekke'; 'SA|Madinah'='Medine'; 'IL|Jerusalem'='Kudüs'; 'IN|New Delhi'='Yeni Delhi'; 'MX|Mexico City'='Meksiko';
  'GR|Corfu'='Korfu'; 'HU|Budapest'='Budapeşte'; 'KZ|Almaty'='Almatı'; 'UZ|Samarkand'='Semerkant';
  'UZ|Bukhara'='Buhara'; 'UZ|Tashkent'='Taşkent'; 'TM|Ashgabat'='Aşkabat'; 'KG|Bishkek'='Bişkek'; 'TN|Tunis'='Tunus';
  'DZ|Algiers'='Cezayir'; 'LY|Tripoli'='Trablus'; 'MT|Valletta'='Valletta'; 'QA|Doha'='Doha';
  'AE|Abu Dhabi'='Abu Dabi'; 'JO|Amman'='Amman'; 'KR|Seoul'='Seul'; 'BE|Liège'='Liej'; 'FR|Strasbourg'='Strazburg';
  'FR|Marseille'='Marsilya'; 'IT|Padua'='Padova'; 'IT|Verona'='Verona'; 'CY|Famagusta'='Gazimağusa'; 'CY|Kyrenia'='Girne'; 'TR|Istanbul'='İstanbul'
}
$found = @{}

$admin = @{}
foreach ($l in [IO.File]::ReadLines((Join-Path $Raw 'admin1CodesASCII.txt'), $utf8)) {
  $p = $l.Split("`t"); if ($p.Length -ge 2) { $admin[$p[0]] = $p[1] }
}

$skip = @{ 'PPLX'=1; 'PPLH'=1; 'PPLQ'=1; 'PPLW'=1; 'PPLCH'=1 }
$by = @{}
foreach ($l in [IO.File]::ReadLines((Join-Path $Raw 'cities1000.txt'), $utf8)) {
  $p = $l.Split("`t")
  if ($p.Length -lt 15) { continue }
  if ($skip.ContainsKey($p[7])) { continue }
  $cc = $p[8]; if ($cc -notmatch '^[A-Z]{2}$') { continue }
  $pop = 0L; [void][long]::TryParse($p[14], [ref]$pop)
  if (-not $by.ContainsKey($cc)) { $by[$cc] = New-Object System.Collections.ArrayList }
  [void]$by[$cc].Add([pscustomobject]@{ n = $p[1]; a = $p[2]; adm = $p[10]; pop = $pop })
}

$dir = Join-Path $Out 'cities'
if (-not (Test-Path $dir)) { [void](New-Item -ItemType Directory -Path $dir) }
$counts = @{}
foreach ($cc in $by.Keys) {
  $list = $by[$cc] | Sort-Object -Property @{Expression='pop';Descending=$true}, @{Expression='n';Descending=$false}
  $adm = New-Object System.Collections.ArrayList; $admIdx = @{}
  $seen = @{}; $rows = New-Object System.Collections.ArrayList
  foreach ($c in $list) {
    $an = $admin["$cc.$($c.adm)"]
    $ai = -1
    if ($an) {
      if (-not $admIdx.ContainsKey($an)) { $admIdx[$an] = $adm.Count; [void]$adm.Add($an) }
      $ai = $admIdx[$an]
    }
    $key = $c.n.ToLowerInvariant() + '|' + $ai
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = 1
    $exo = $TR["$cc|$($c.n)"]; if (-not $exo) { $exo = $TR["$cc|$($c.a)"] }
    if ($exo -and -not $found.ContainsKey("$cc|$exo")) { $found["$cc|$exo"] = 1 } else { $exo = $null }
    $row = '[' + (J $c.n) + ',' + $ai + $(if ($exo) { ',' + (J $exo) } else { '' }) + ']'
    [void]$rows.Add($row)
  }
  $json = '{"a":[' + (($adm | ForEach-Object { J $_ }) -join ',') + '],"c":[' + ($rows -join ',') + ']}'
  [IO.File]::WriteAllText((Join-Path $dir "$cc.json"), $json, $utf8)
  $counts[$cc] = $rows.Count
}

# Ülkeler: ISO kodu + İngilizce ad (tarayıcı Intl.DisplayNames ile Türkçe/İspanyolca gösterir) + şehir sayısı
$cs = New-Object System.Collections.ArrayList
foreach ($l in [IO.File]::ReadLines((Join-Path $Raw 'countryInfo.txt'), $utf8)) {
  if ($l.StartsWith('#')) { continue }
  $p = $l.Split("`t"); if ($p.Length -lt 5 -or $p[0] -notmatch '^[A-Z]{2}$') { continue }
  $n = 0; if ($counts.ContainsKey($p[0])) { $n = $counts[$p[0]] }
  [void]$cs.Add('[' + (J $p[0]) + ',' + (J $p[4]) + ',' + $n + ']')
}
[IO.File]::WriteAllText((Join-Path $Out 'countries.json'), '[' + ($cs -join ',') + ']', $utf8)

$missing = $TR.Keys | Where-Object { -not $found.ContainsKey(($_.Split('|')[0]) + '|' + $TR[$_]) }
"countries: $($cs.Count)  city files: $($counts.Count)  cities: $(($counts.Values | Measure-Object -Sum).Sum)"
"TR names not matched: " + ($missing -join ', ')
