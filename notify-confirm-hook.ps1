$LogFile = "D:\Projects\prompt-novel-generator\notify-confirm-hook.log"

try {
    $Time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $InputText = $input | Out-String

    $ToolName = "unknown"
    $ToolInputText = ""

    try {
        $Payload = $InputText | ConvertFrom-Json

        if ($Payload.tool_name) {
            $ToolName = [string]$Payload.tool_name
        }

        if ($Payload.tool_input) {
            $ToolInputText = ($Payload.tool_input | ConvertTo-Json -Depth 20 -Compress)
        }
    }
    catch {
        $ToolInputText = $InputText
    }

    Add-Content -Path $LogFile -Value "=============================="
    Add-Content -Path $LogFile -Value "Hook fired at: $Time"
    Add-Content -Path $LogFile -Value "Tool: $ToolName"
    Add-Content -Path $LogFile -Value "Input: $ToolInputText"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Claude Code Permission Request"
$form.TopMost = $true
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(380, 210)
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ShowInTaskbar = $true

$label = New-Object System.Windows.Forms.Label
$label.AutoSize = $false
$label.Location = New-Object System.Drawing.Point(28, 24)
$label.Size = New-Object System.Drawing.Size(320, 95)
$label.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$label.Text = "Claude Code requests permission.`r`n`r`nTool: $ToolName`r`n`r`nAllow this action?"
$form.Controls.Add($label)

$yesButton = New-Object System.Windows.Forms.Button
$yesButton.Text = "Yes (&Y)"
$yesButton.Size = New-Object System.Drawing.Size(90, 30)
$yesButton.Location = New-Object System.Drawing.Point(85, 130)
$yesButton.DialogResult = [System.Windows.Forms.DialogResult]::Yes
$form.Controls.Add($yesButton)

$noButton = New-Object System.Windows.Forms.Button
$noButton.Text = "No (&N)"
$noButton.Size = New-Object System.Drawing.Size(90, 30)
$noButton.Location = New-Object System.Drawing.Point(205, 130)
$noButton.DialogResult = [System.Windows.Forms.DialogResult]::No
$form.Controls.Add($noButton)

$form.AcceptButton = $yesButton
$form.CancelButton = $noButton

$form.KeyPreview = $true

$form.Add_KeyDown({
    param($sender, $e)

    if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Enter -or $e.KeyCode -eq [System.Windows.Forms.Keys]::Y) {
        $form.DialogResult = [System.Windows.Forms.DialogResult]::Yes
        $form.Close()
    }

    if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape -or $e.KeyCode -eq [System.Windows.Forms.Keys]::N) {
        $form.DialogResult = [System.Windows.Forms.DialogResult]::No
        $form.Close()
    }
})

$form.Add_Shown({
    $form.Activate()
    $form.BringToFront()
    $form.Focus()
    $form.ActiveControl = $yesButton
    $yesButton.Select()
    $yesButton.Focus()
})

$Result = $form.ShowDialog()

$form.Dispose()
if ($Result -eq [System.Windows.Forms.DialogResult]::Yes) {
        Add-Content -Path $LogFile -Value "User decision: allow"

        $Response = @{
            hookSpecificOutput = @{
                hookEventName = "PermissionRequest"
                decision = @{
                    behavior = "allow"
                }
            }
        }

        $Response | ConvertTo-Json -Depth 20 -Compress
        exit 0
    }
    else {
        Add-Content -Path $LogFile -Value "User decision: deny"

        $Response = @{
            hookSpecificOutput = @{
                hookEventName = "PermissionRequest"
                decision = @{
                    behavior = "deny"
                    message = "User denied this action from the popup."
                    interrupt = $false
                }
            }
        }

        $Response | ConvertTo-Json -Depth 20 -Compress
        exit 0
    }
}
catch {
    Add-Content -Path $LogFile -Value "ERROR:"
    Add-Content -Path $LogFile -Value $_.Exception.Message

    $Response = @{
        hookSpecificOutput = @{
            hookEventName = "PermissionRequest"
            decision = @{
                behavior = "deny"
                message = "Permission popup script failed, so the action was denied."
                interrupt = $false
            }
        }
    }

    $Response | ConvertTo-Json -Depth 20 -Compress
    exit 0
}