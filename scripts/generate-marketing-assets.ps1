Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $projectRoot 'public\assets\generated'
$visualRoot = 'C:\Users\DUONG\.codex\visualizations\2026\09\02\01a05fdc-6d37-7f53-879d-2af55fa232f7'

function New-Font([float]$size, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
  try { return [System.Drawing.Font]::new('Bahnschrift SemiCondensed', $size, $style, [System.Drawing.GraphicsUnit]::Pixel) }
  catch { return [System.Drawing.Font]::new('Segoe UI', $size, $style, [System.Drawing.GraphicsUnit]::Pixel) }
}

function Draw-ImageCover($graphics, $image, [System.Drawing.RectangleF]$target) {
  $scale = [Math]::Max($target.Width / $image.Width, $target.Height / $image.Height)
  $sourceWidth = $target.Width / $scale
  $sourceHeight = $target.Height / $scale
  $sourceX = ($image.Width - $sourceWidth) / 2
  $sourceY = ($image.Height - $sourceHeight) / 2
  $source = [System.Drawing.RectangleF]::new($sourceX, $sourceY, $sourceWidth, $sourceHeight)
  $graphics.DrawImage($image, $target, $source, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Panel($graphics, [System.Drawing.RectangleF]$rect, [System.Drawing.Color]$fill, [System.Drawing.Color]$line) {
  $brush = [System.Drawing.SolidBrush]::new($fill)
  $pen = [System.Drawing.Pen]::new($line, 2)
  $graphics.FillRectangle($brush, $rect)
  $graphics.DrawRectangle($pen, $rect.X, $rect.Y, $rect.Width, $rect.Height)
  $brush.Dispose()
  $pen.Dispose()
}

function Draw-Label($graphics, [string]$text, $font, $brush, [float]$x, [float]$y) {
  $graphics.DrawString($text, $font, $brush, $x, $y)
}

$cyan = [System.Drawing.Color]::FromArgb(255, 48, 221, 233)
$cyanDim = [System.Drawing.Color]::FromArgb(255, 22, 104, 119)
$amber = [System.Drawing.Color]::FromArgb(255, 244, 181, 55)
$white = [System.Drawing.Color]::FromArgb(255, 235, 245, 248)
$muted = [System.Drawing.Color]::FromArgb(255, 164, 185, 192)
$panel = [System.Drawing.Color]::FromArgb(235, 5, 23, 34)
$panel2 = [System.Drawing.Color]::FromArgb(245, 8, 31, 44)

# Feature poster: all typography is drawn here so names and Vietnamese copy stay exact.
$poster = [System.Drawing.Bitmap]::new(1536, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($poster)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.Clear([System.Drawing.Color]::FromArgb(255, 1, 10, 17))

$gridPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(28, 48, 221, 233), 1)
for ($x = 0; $x -lt 1536; $x += 64) { $g.DrawLine($gridPen, $x, 0, $x, 1024) }
for ($y = 0; $y -lt 1024; $y += 64) { $g.DrawLine($gridPen, 0, $y, 1536, $y) }
$gridPen.Dispose()

$keyArt = [System.Drawing.Image]::FromFile((Join-Path $assetRoot 'key-art.png'))
$gameplay = [System.Drawing.Image]::FromFile((Join-Path $visualRoot 'gpu-gameplay-desktop.png'))

$heroRect = [System.Drawing.RectangleF]::new(24, 24, 956, 430)
Draw-Panel $g $heroRect $panel $cyanDim
Draw-ImageCover $g $keyArt $heroRect

$shade = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.PointF]::new(24, 240),
  [System.Drawing.PointF]::new(24, 454),
  [System.Drawing.Color]::FromArgb(0, 1, 10, 17),
  [System.Drawing.Color]::FromArgb(245, 1, 10, 17)
)
$g.FillRectangle($shade, $heroRect)
$shade.Dispose()

$titleFont = New-Font 76 ([System.Drawing.FontStyle]::Bold)
$subtitleFont = New-Font 25 ([System.Drawing.FontStyle]::Bold)
$sectionFont = New-Font 25 ([System.Drawing.FontStyle]::Bold)
$bodyFont = New-Font 18
$smallFont = New-Font 14 ([System.Drawing.FontStyle]::Bold)
$metricFont = New-Font 28 ([System.Drawing.FontStyle]::Bold)
$whiteBrush = [System.Drawing.SolidBrush]::new($white)
$cyanBrush = [System.Drawing.SolidBrush]::new($cyan)
$amberBrush = [System.Drawing.SolidBrush]::new($amber)
$mutedBrush = [System.Drawing.SolidBrush]::new($muted)

Draw-Label $g 'RIFTWARDEN' $titleFont $whiteBrush 58 275
Draw-Label $g 'E C H O   S I E G E' $subtitleFont $cyanBrush 62 365
Draw-Label $g 'GIỮ VỮNG KHE NỨT. XÂY DỰNG HỘ VỆ CỦA RIÊNG BẠN.' $smallFont $amberBrush 62 412

$featureRect = [System.Drawing.RectangleF]::new(1002, 24, 510, 430)
Draw-Panel $g $featureRect $panel2 $cyanDim
Draw-Label $g 'SINH TỒN QUA KHE NỨT' $smallFont $cyanBrush 1030 52
Draw-Label $g 'MỖI TRẬN LÀ MỘT' $sectionFont $whiteBrush 1030 91
Draw-Label $g 'BẢN XÂY DỰNG MỚI' $sectionFont $whiteBrush 1030 122
Draw-Label $g 'Chọn Hộ Vệ, phối hợp vũ khí tự động và' $bodyFont $mutedBrush 1030 175
Draw-Label $g 'kích hoạt kỹ năng đúng lúc để giữ tuyến.' $bodyFont $mutedBrush 1030 202

$metrics = @(
  @{ X = 1030; Y = 255; Value = '2,5–4 PHÚT'; Label = 'MỖI TRẬN' },
  @{ X = 1268; Y = 255; Value = '20'; Label = 'BẢN ĐỒ' },
  @{ X = 1030; Y = 340; Value = '8'; Label = 'HỘ VỆ' },
  @{ X = 1268; Y = 340; Value = '14'; Label = 'VŨ KHÍ' }
)
foreach ($metric in $metrics) {
  Draw-Label $g $metric.Value $metricFont $amberBrush $metric.X $metric.Y
  Draw-Label $g $metric.Label $smallFont $mutedBrush $metric.X ($metric.Y + 39)
}

$gameRect = [System.Drawing.RectangleF]::new(24, 478, 956, 440)
Draw-Panel $g $gameRect $panel $cyanDim
Draw-ImageCover $g $gameplay ([System.Drawing.RectangleF]::new(34, 488, 936, 420))
$gameTagBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(225, 1, 10, 17))
$g.FillRectangle($gameTagBrush, 46, 500, 330, 64)
Draw-Label $g 'CHIẾN ĐẤU THỜI GIAN THỰC' $smallFont $cyanBrush 62 513
Draw-Label $g 'GPU WEBGL2 · ĐẠN ĐẠO ĐA HƯỚNG' $smallFont $whiteBrush 62 538
$gameTagBrush.Dispose()

$weaponRect = [System.Drawing.RectangleF]::new(1002, 478, 510, 220)
Draw-Panel $g $weaponRect $panel2 $cyanDim
Draw-Label $g '14 VŨ KHÍ · TỰ ĐỘNG PHỐI HỢP' $sectionFont $whiteBrush 1028 500
$weaponFiles = Get-ChildItem -LiteralPath (Join-Path $assetRoot 'weapons') -Filter '*-v2.png' | Sort-Object Name
for ($i = 0; $i -lt $weaponFiles.Count; $i++) {
  $img = [System.Drawing.Image]::FromFile($weaponFiles[$i].FullName)
  $col = $i % 7
  $row = [Math]::Floor($i / 7)
  $cell = [System.Drawing.RectangleF]::new(1030 + ($col * 66), 548 + ($row * 68), 54, 54)
  $g.DrawImage($img, $cell)
  $img.Dispose()
}

$bossRect = [System.Drawing.RectangleF]::new(1002, 718, 510, 200)
Draw-Panel $g $bossRect $panel2 $cyanDim
Draw-Label $g 'BOSS ĐA GIAI ĐOẠN' $sectionFont $whiteBrush 1028 740
$bossFiles = Get-ChildItem -LiteralPath (Join-Path $assetRoot 'bosses') -Filter '*.png' | Sort-Object Name
for ($i = 0; $i -lt $bossFiles.Count; $i++) {
  $img = [System.Drawing.Image]::FromFile($bossFiles[$i].FullName)
  $cellX = 1028 + ($i * 118)
  $cell = [System.Drawing.RectangleF]::new($cellX, 786, 94, 94)
  $g.DrawImage($img, $cell)
  $bossPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(180, 244, 181, 55), 1)
  $g.DrawRectangle($bossPen, $cell.X, $cell.Y, $cell.Width, $cell.Height)
  $bossPen.Dispose()
  $img.Dispose()
}

$footerRect = [System.Drawing.RectangleF]::new(24, 942, 1488, 58)
Draw-Panel $g $footerRect ([System.Drawing.Color]::FromArgb(248, 4, 20, 30)) $amber
Draw-Label $g 'NÂNG CẤP VÔ HẠN' $smallFont $amberBrush 62 962
Draw-Label $g '·' $smallFont $cyanBrush 265 962
Draw-Label $g 'Q KỸ NĂNG · E NỘ · R TUYỆT KỸ' $smallFont $whiteBrush 291 962
Draw-Label $g '·' $smallFont $cyanBrush 635 962
Draw-Label $g 'CÀNG CHƠI CÀNG MẠNH' $smallFont $amberBrush 661 962
Draw-Label $g 'RIFTWARDEN: ECHO SIEGE' $smallFont $cyanBrush 1251 962

$posterPath = Join-Path $assetRoot 'genimage2-feature-poster.png'
$poster.Save($posterPath, [System.Drawing.Imaging.ImageFormat]::Png)

$keyArt.Dispose(); $gameplay.Dispose(); $g.Dispose(); $poster.Dispose()

# Labeled gameplay-sprite reference sheet. Every preview is cropped from exactly one 128x128 atlas cell.
$sheet = [System.Drawing.Bitmap]::new(1200, 660, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$sg = [System.Drawing.Graphics]::FromImage($sheet)
$sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$sg.Clear([System.Drawing.Color]::FromArgb(255, 1, 12, 19))

$sheetTitle = New-Font 30 ([System.Drawing.FontStyle]::Bold)
$sheetLabel = New-Font 18 ([System.Drawing.FontStyle]::Bold)
Draw-Label $sg 'HỘ VỆ · GAMEPLAY SPRITES' $sheetTitle $whiteBrush 34 22
Draw-Label $sg 'Khung xem trước lấy từ đúng một ô atlas 128 × 128' $bodyFont $mutedBrush 34 60

$heroes = @(
  @{ Name = 'ELARA'; File = 'elara-gameplay-v2.png' },
  @{ Name = 'KAEL ORIN'; File = 'kael-orin-gameplay-v2.png' },
  @{ Name = 'MIRA VOSS'; File = 'mira-voss-gameplay-v2.png' },
  @{ Name = 'NOVA'; File = 'nova-gameplay-v2.png' },
  @{ Name = 'NYRA SOL'; File = 'nyra-sol-gameplay-v2.png' },
  @{ Name = 'TITAN'; File = 'titan-gameplay-v2.png' },
  @{ Name = 'TOREN VALE'; File = 'toren-vale-gameplay-v2.png' },
  @{ Name = 'ZAREK'; File = 'zarek-gameplay-v2.png' }
)

for ($i = 0; $i -lt $heroes.Count; $i++) {
  $col = $i % 4
  $row = [Math]::Floor($i / 4)
  $x = 28 + ($col * 292)
  $y = 100 + ($row * 272)
  $card = [System.Drawing.RectangleF]::new($x, $y, 268, 246)
  Draw-Panel $sg $card $panel2 $cyanDim
  $atlas = [System.Drawing.Image]::FromFile((Join-Path (Join-Path $assetRoot 'characters') $heroes[$i].File))
  $source = [System.Drawing.RectangleF]::new(0, 0, 128, 128)
  $target = [System.Drawing.RectangleF]::new($x + 37, $y + 10, 194, 194)
  $sg.DrawImage($atlas, $target, $source, [System.Drawing.GraphicsUnit]::Pixel)
  $atlas.Dispose()
  Draw-Label $sg $heroes[$i].Name $sheetLabel $whiteBrush ($x + 18) ($y + 211)
}

$sheetPath = Join-Path $visualRoot 'character-sprites-labeled.png'
$sheet.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$sheetTitle.Dispose(); $sheetLabel.Dispose(); $sg.Dispose(); $sheet.Dispose()
$titleFont.Dispose(); $subtitleFont.Dispose(); $sectionFont.Dispose(); $bodyFont.Dispose(); $smallFont.Dispose(); $metricFont.Dispose()
$whiteBrush.Dispose(); $cyanBrush.Dispose(); $amberBrush.Dispose(); $mutedBrush.Dispose()

Write-Output $posterPath
Write-Output $sheetPath
