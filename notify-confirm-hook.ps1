$LogFile = "D:\Projects\prompt-novel-generator\notify-confirm-hook.log"
$ConfigFile = "D:\Projects\prompt-novel-generator\ask-before-allow-list.json"
$PermissionLogFile = "D:\Projects\prompt-novel-generator\permission-hook.log"

function Write-PermissionLog {
    param([string]$Message)
    try {
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path $PermissionLogFile -Encoding UTF8 -Value "$ts | $Message"
    } catch {
        # Silently ignore log errors
    }
}

function Load-AskBeforeAllowConfig {
    param([string]$ConfigPath)

    if (-not (Test-Path $ConfigPath)) {
        Write-PermissionLog "config_not_found | $ConfigPath"
        return $null
    }

    try {
        $config = Get-Content -Path $ConfigPath -Encoding UTF8 -Raw | ConvertFrom-Json
        return $config
    } catch {
        Write-PermissionLog "config_load_failed | $($_.Exception.Message)"
        return $null
    }
}

function Test-CommandMatch {
    param([string]$Command, [array]$Patterns)

    foreach ($pattern in $Patterns) {
        if ($Command -like "*$pattern*") {
            return $true
        }
    }
    return $false
}

function Test-FilePathMatch {
    param([string]$FilePath, [array]$Patterns)

    $normalized = $FilePath.Replace('\', '/')
    $projectRoot = "D:/Projects/prompt-novel-generator"

    # Make relative to project root if possible
    $relative = $normalized
    if ($relative.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) {
        $relative = $relative.Substring($projectRoot.Length).TrimStart('/')
    }

    $fileName = $relative.Split('/')[-1]

    foreach ($pattern in $Patterns) {
        $p = $pattern.Replace('\', '/')

        # Pattern with **/ prefix — match filename/suffix anywhere in tree
        if ($p.StartsWith('**/')) {
            $rest = $p.Substring(3)
            if ($relative -eq $rest -or $relative.EndsWith('/' + $rest)) {
                return $true
            }
            if (-not $rest.Contains('/') -and $fileName -like $rest) {
                return $true
            }
            continue
        }

        # Pattern with ** in middle or end — prefix/suffix match
        if ($p.Contains('**')) {
            $parts = $p -split '\*\*', 2
            $prefix = $parts[0]
            $suffix = $parts[1]
            if ($relative.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                if ([string]::IsNullOrEmpty($suffix) -or $relative.EndsWith($suffix, [StringComparison]::OrdinalIgnoreCase)) {
                    return $true
                }
            }
            continue
        }

        # Simple wildcard pattern (no **)
        if ($relative -like $p) {
            return $true
        }

        # For patterns without directory separators, also match against filename
        if (-not $p.Contains('/')) {
            if ($relative.EndsWith('/' + $p)) {
                return $true
            }
            if ($fileName -like $p) {
                return $true
            }
        }
    }

    return $false
}

function Test-ShouldAskBeforeAllow {
    param(
        [string]$ToolName,
        [string]$Command,
        [string]$FilePath
    )

    $config = Load-AskBeforeAllowConfig -ConfigPath $ConfigFile
    if (-not $config) {
        # Config missing or broken — fail-safe: ask
        return $true
    }

    foreach ($rule in $config.rules) {
        $toolNames = @($rule.tool_names)
        $matchType = $rule.match_type
        $patterns = @($rule.patterns)
        $ruleName = $rule.name

        if ($ToolName -notin $toolNames) {
            continue
        }

        $matched = $false
        switch ($matchType) {
            "command_contains" {
                if ($Command -and (Test-CommandMatch -Command $Command -Patterns $patterns)) {
                    $matched = $true
                }
            }
            "file_path_glob" {
                if ($FilePath -and (Test-FilePathMatch -FilePath $FilePath -Patterns $patterns)) {
                    $matched = $true
                }
            }
        }

        if ($matched) {
            $logTarget = if ([string]::IsNullOrEmpty($Command)) { $FilePath } else { $Command }
            Write-PermissionLog "popup_required | $ToolName | $logTarget | rule=$ruleName"
            return $true
        }
    }

    return $false
}

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

    # === Auto-allow pre-check ===
    # If the request doesn't match the ask-before-allow list, auto-allow without popup
    $shouldAsk = $true
    if ($Payload) {
        $cmd = ""
        $fpath = ""
        if ($Payload.tool_input) {
            if ($Payload.tool_input.command) { $cmd = [string]$Payload.tool_input.command }
            if ($Payload.tool_input.file_path) { $fpath = [string]$Payload.tool_input.file_path }
        }
        $shouldAsk = Test-ShouldAskBeforeAllow -ToolName $ToolName -Command $cmd -FilePath $fpath
    }

    if (-not $shouldAsk) {
        $logTarget = if ([string]::IsNullOrEmpty($cmd)) { $fpath } else { $cmd }
        Write-PermissionLog "auto_allow | $ToolName | $logTarget | rule=none"
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

    Add-Content -Path $LogFile -Encoding UTF8 -Value "=============================="
    Add-Content -Path $LogFile -Encoding UTF8 -Value "Hook fired at: $Time"
    Add-Content -Path $LogFile -Encoding UTF8 -Value "Tool: $ToolName"
    Add-Content -Path $LogFile -Encoding UTF8 -Value "Input: $ToolInputText"

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
        Add-Content -Path $LogFile -Encoding UTF8 -Value "User decision: allow"

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
        Add-Content -Path $LogFile -Encoding UTF8 -Value "User decision: always_allow"

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
        Add-Content -Path $LogFile -Encoding UTF8 -Value "User decision: deny"

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
            Add-Content -Path $LogFile -Encoding UTF8 -Value "Alternative: $alternative"

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
    Add-Content -Path $LogFile -Encoding UTF8 -Value "ERROR:"
    Add-Content -Path $LogFile -Encoding UTF8 -Value $_.Exception.Message

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