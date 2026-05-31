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

$result = [System.Windows.Forms.MessageBox]::Show(
    $form,
    "Claude Code task appears to be finished. Please return to the terminal.",
    "Claude Code Task Done",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
)

$form.Close()
$form.Dispose()

# 用户点击"确定"后，自动激活 CC 终端窗口
if ($result -eq "OK") {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public const int SW_RESTORE = 9;
}
"@

    # 方法一：按进程名 + MainWindowHandle 匹配（可靠，不依赖窗口标题）
    $target = $null
    $processPriority = @(
        @(Get-Process | Where-Object { $_.ProcessName -match '^claude' -and $_.MainWindowHandle -ne 0 }),
        @(Get-Process -Name 'WindowsTerminal' -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0),
        @(Get-Process | Where-Object { $_.ProcessName -match '^pwsh$|^powershell$' -and $_.MainWindowHandle -ne 0 }),
        @(Get-Process -Name 'cmd' -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0)
    )
    foreach ($group in $processPriority) {
        if ($group.Count -gt 0) { $target = $group[0].MainWindowHandle; break }
    }

    # 方法二：按窗口标题 EnumWindows 兜底
    if (-not $target) {
        $windows = [System.Collections.ArrayList]::new()
        $enumProc = [Win32+EnumWindowsProc]{
            param($hWnd, $lParam)
            if ([Win32]::IsWindowVisible($hWnd)) {
                $sb = [System.Text.StringBuilder]::new(256)
                $len = [Win32]::GetWindowText($hWnd, $sb, $sb.Capacity)
                if ($len -gt 0) {
                    [void]$windows.Add(@{ Handle = $hWnd; Title = $sb.ToString() })
                }
            }
            return $true
        }
        [void][Win32]::EnumWindows($enumProc, [IntPtr]::Zero)

        $titlePriority = @(
            @($windows | Where-Object { $_.Title -match 'Claude|claude' }),
            @($windows | Where-Object { $_.Title -match 'Windows Terminal' }),
            @($windows | Where-Object { $_.Title -match 'Windows PowerShell|PowerShell' }),
            @($windows | Where-Object { $_.Title -match 'Command Prompt' })
        )
        foreach ($group in $titlePriority) {
            if ($group.Count -gt 0) { $target = $group[0].Handle; break }
        }
    }

    if ($target) {
        Start-Sleep -Milliseconds 200
        [Win32]::ShowWindowAsync($target, [Win32]::SW_RESTORE) | Out-Null
        [Win32]::SwitchToThisWindow($target, $true) | Out-Null
    }
}

exit 0