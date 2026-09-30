$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$IconDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'public\icons'
function New-PTrackerIcon([int]$Size, [string]$Name, [bool]$Maskable) {
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    try {
        $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#111720'))
        $margin = if ($Maskable) { [int]($Size * .19) } else { [int]($Size * .12) }
        $accent = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#4ee0a1'), [Math]::Max(4, $Size * .035))
        $graphics.DrawEllipse($accent, $margin, $margin, $Size - 2 * $margin, $Size - 2 * $margin)
        $font = New-Object System.Drawing.Font('Arial', ($Size * .42), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f4f7fb'))
        $format = New-Object System.Drawing.StringFormat
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $format.LineAlignment = [System.Drawing.StringAlignment]::Center
        $graphics.DrawString('P', $font, $brush, (New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)), $format)
        $bitmap.Save((Join-Path $IconDirectory $Name), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
New-PTrackerIcon 192 'icon-192.png' $false
New-PTrackerIcon 512 'icon-512.png' $false
New-PTrackerIcon 512 'maskable-512.png' $true
