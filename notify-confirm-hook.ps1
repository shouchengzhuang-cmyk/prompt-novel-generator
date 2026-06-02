$LogFile = "D:\Projects\prompt-novel-generator\notify-confirm-hook.log"

try {
    $Time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $InputText = $input | Out-String

    $ToolName = "unknown"
    $ToolInputText = ""
    $PermissionSuggestions = $null

    try {
        $Payload = $InputText | ConvertFrom-Json

        if ($Payload.tool_name) {
            $ToolName = [string]$Payload.tool_name
        }

        if ($Payload.tool_input) {
            $ToolInputText = ($Payload.tool_input | ConvertTo-Json -Depth 20 -Compress)
        }

        if ($Payload.permission_suggestions) {
            $PermissionSuggestions = $Payload.permission_suggestions
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
    Add-Type -AssemblyName Microsoft.VisualBasic

    # Determine if CC offers an "always allow" option via permission_suggestions
    # (e.g. setMode:acceptEdits for Write/Edit tools)
    $HasAlwaysAllow = $PermissionSuggestions -and $PermissionSuggestions.Count -gt 0

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Claude Code Permission Request"
    $form.TopMost = $true
    $form.StartPosition = "CenterScreen"
    $form.Size = New-Object System.Drawing.Size(440, 250)
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ShowInTaskbar = $true

    $label = New-Object System.Windows.Forms.Label
    $label.AutoSize = $false
    $label.Location = New-Object System.Drawing.Point(28, 20)
    $label.Size = New-Object System.Drawing.Size(380, 95)
    $label.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $label.Text = "Claude Code requests permission.`r`n`r`nTool: $ToolName`r`n`r`nAllow this action?"
    $form.Controls.Add($label)

    # Allow Once button
    $allowButton = New-Object System.Windows.Forms.Button
    $allowButton.Text = "Allow (&Y)"
    $allowButton.Size = New-Object System.Drawing.Size(90, 30)
    $allowButton.Location = New-Object System.Drawing.Point(30, 130)
    $allowButton.DialogResult = [System.Windows.Forms.DialogResult]::Yes
    $form.Controls.Add($allowButton)

    # Always Allow button (default when CC supports it)
    $alwaysButton = New-Object System.Windows.Forms.Button
    $alwaysButton.Text = "Always Allow (&A)"
    $alwaysButton.Size = New-Object System.Drawing.Size(120, 30)
    $alwaysButton.Location = New-Object System.Drawing.Point(150, 130)
    $alwaysButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($alwaysButton)

    # No button
    $noButton = New-Object System.Windows.Forms.Button
    $noButton.Text = "No (&N)"
    $noButton.Size = New-Object System.Drawing.Size(90, 30)
    $noButton.Location = New-Object System.Drawing.Point(300, 130)
    $noButton.DialogResult = [System.Windows.Forms.DialogResult]::No
    $form.Controls.Add($noButton)

    # AcceptButton defaults to Always Allow when CC offers it; otherwise Allow
    if ($HasAlwaysAllow) {
        $form.AcceptButton = $alwaysButton
    } else {
        $form.AcceptButton = $allowButton
    }
    $form.CancelButton = $noButton

    $form.KeyPreview = $true

    $form.Add_KeyDown({
        param($sender, $e)

        if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Y) {
            $form.DialogResult = [System.Windows.Forms.DialogResult]::Yes
            $form.Close()
        }

        if ($e.KeyCode -eq [System.Windows.Forms.Keys]::A) {
            $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
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
        if ($HasAlwaysAllow) {
            $alwaysButton.Select()
            $alwaysButton.Focus()
        } else {
            $allowButton.Select()
            $allowButton.Focus()
        }
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

    if ($Result -eq [System.Windows.Forms.DialogResult]::OK) {
        Add-Content -Path $LogFile -Value "User decision: always_allow"

        $Response = @{
            hookSpecificOutput = @{
                hookEventName = "PermissionRequest"
                decision = @{
                    behavior = "allow"
                }
            }
        }

        # If CC offered permission suggestions (e.g. setMode: acceptEdits),
        # pass them back inside decision.updatedPermissions
        if ($HasAlwaysAllow) {
            $Response.hookSpecificOutput.decision["updatedPermissions"] = $PermissionSuggestions
        }

        $Response | ConvertTo-Json -Depth 20 -Compress
        exit 0
    }

    if ($Result -eq [System.Windows.Forms.DialogResult]::No) {
        Add-Content -Path $LogFile -Value "User decision: deny"

        $alternative = ""
        try {
            $inputResult = [Microsoft.VisualBasic.Interaction]::InputBox(
                "User denied the action. What should Claude Code do instead?`r`n`r`nEnter an alternative instruction, e.g.: don't edit this file, use a different approach.",
                "Alternative for Claude Code",
                ""
            )
            if ($inputResult) {
                $trimmed = $inputResult.Trim()
                if ($trimmed) {
                    $alternative = $trimmed
                }
            }
        }
        catch {
            # InputBox failed — fall through to plain deny
        }

        if ($alternative) {
            $denyMessage = "User denied this action from the popup. Instead: $alternative"
            Add-Content -Path $LogFile -Value "Alternative: $alternative"

            $Response = @{
                hookSpecificOutput = @{
                    hookEventName = "PermissionRequest"
                    decision = @{
                        behavior = "deny"
                        message = $denyMessage
                    }
                }
            }
        } else {
            $Response = @{
                hookSpecificOutput = @{
                    hookEventName = "PermissionRequest"
                    decision = @{
                        behavior = "deny"
                    }
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