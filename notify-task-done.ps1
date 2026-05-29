Add-Type -AssemblyName System.Windows.Forms

$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.StartPosition = "CenterScreen"
$form.Width = 1
$form.Height = 1
$form.ShowInTaskbar = $false
$form.WindowState = "Minimized"
$form.Show()
$form.Activate()
$form.BringToFront()

[System.Windows.Forms.MessageBox]::Show(
    $form,
    "Claude Code task appears to be finished. Please return to the terminal.",
    "Claude Code Task Done",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
) | Out-Null

$form.Close()
$form.Dispose()
exit 0