# Run this ONCE from PowerShell to remove the two remnant folders
# that Cowork couldn't delete due to Windows file permissions.

$root = "D:\Development\Anemal"

Write-Host "`n=== Anemal Cleanup Remnants ===" -ForegroundColor Cyan

# 1. Remove old 'claude\' folder (superseded by '.claude\')
$oldClaude = "$root\claude"
if (Test-Path $oldClaude) {
    Remove-Item -Path $oldClaude -Recurse -Force
    Write-Host "  Removed: claude\" -ForegroundColor Green
} else {
    Write-Host "  Already gone: claude\" -ForegroundColor Yellow
}

# 2. Remove leftover inner 'AnimalClinic\' subfolder
$inner = "$root\AnimalClinic"
if (Test-Path $inner) {
    Remove-Item -Path $inner -Recurse -Force
    Write-Host "  Removed: AnimalClinic\" -ForegroundColor Green
} else {
    Write-Host "  Already gone: AnimalClinic\" -ForegroundColor Yellow
}

Write-Host "`nDone! Your project root is clean at: $root" -ForegroundColor Cyan
Write-Host "Remember to reconnect Cowork to: $root" -ForegroundColor White
