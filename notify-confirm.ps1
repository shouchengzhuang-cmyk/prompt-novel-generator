try {
    Add-Type -AssemblyName PresentationFramework

    [System.Windows.MessageBox]::Show(
        "CC is waiting for your confirmation. Please return to the terminal and manually type yes / y / approve if you agree.",
        "Confirmation required",
        "OK",
        "Warning"
    ) | Out-Null
}
catch {
    Write-Host ""
    Write-Host "=============================="
    Write-Host "Confirmation required"
    Write-Host "CC is waiting for your confirmation."
    Write-Host "Please return to the terminal and manually confirm."
    Write-Host "=============================="
    Write-Host ""
}
