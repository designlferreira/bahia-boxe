# Gera os ícones do app e a logo reduzida a partir de brand/logo-bahia-boxe-original.png.
# Rodar no Windows PowerShell, na raiz do projeto:  powershell -ExecutionPolicy Bypass -File brand\gerar-icones.ps1
# Sobrescreve os arquivos em public/. Se a logo mudar, ajuste o recorte ($crop) para o novo desenho.
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path -Parent $PSScriptRoot
$src = Join-Path $PSScriptRoot "logo-bahia-boxe-original.png"
$pub = Join-Path $raiz "public"
$img = [System.Drawing.Bitmap]::FromFile($src)
$bg = [System.Drawing.Color]::FromArgb(255, 18, 18, 18)   # #121212, fundo do app
# Recorte do boxeador no original de 1536x1024 (sem a faixa com o nome, ilegível em ícone)
$crop = New-Object System.Drawing.Rectangle 455, 0, 610, 610

function Novo($w, $h) {
  $b = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
  return @($b, $g)
}
function Arredondado($s, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc(0, 0, $d, $d, 180, 90); $p.AddArc($s - $d, 0, $d, $d, 270, 90)
  $p.AddArc($s - $d, $s - $d, $d, $d, 0, 90); $p.AddArc(0, $s - $d, $d, $d, 90, 90); $p.CloseFigure()
  return $p
}
# $arred = cantos arredondados (ícones "any"); maskable e apple-touch ocupam o quadrado inteiro
function Icone($s, $arred, $nome) {
  $r = Novo $s $s; $b = $r[0]; $g = $r[1]
  if ($arred) { $g.SetClip((Arredondado $s ([int]($s * 0.22)))) }
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $bg), 0, 0, $s, $s)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $s, $s), $crop, 'Pixel')
  $b.Save((Join-Path $pub $nome), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()
}
Icone 192 $true "icon-192.png"
Icone 512 $true "icon-512.png"
Icone 512 $false "icon-maskable-512.png"
Icone 180 $false "apple-touch-icon.png"
Icone 48 $true "favicon-48.png"

# Logo completa, fundo transparente, 600x400 (exibida a ~300px de largura no Login)
$r = Novo 600 400; $b = $r[0]; $g = $r[1]
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, 600, 400), (New-Object System.Drawing.Rectangle 0, 0, $img.Width, $img.Height), 'Pixel')
$b.Save((Join-Path $pub "logo-bahia-boxe.png"), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()
$img.Dispose()
Write-Host "Pronto: icones e logo reduzida gerados em public/."
