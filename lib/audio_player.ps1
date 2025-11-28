
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Timers;

public class AudioPlayer {
    [DllImport("winmm.dll", EntryPoint = "mciSendStringA", CharSet = CharSet.Ansi)]
    public static extern int mciSendString(string lpstrCommand, StringBuilder lpstrReturnString, int uReturnLength, IntPtr hwndCallback);

    private static Timer _timer;
    private static bool _isPlaying = false;

    public static void StartMonitoring() {
        if (_timer == null) {
            _timer = new Timer(500);
            _timer.Elapsed += CheckStatus;
            _timer.Start();
        }
    }

    private static void CheckStatus(object sender, ElapsedEventArgs e) {
        string status = GetStatus();
        if (status.StartsWith("stopped") && _isPlaying) {
            _isPlaying = false;
            Console.WriteLine("FINISHED");
        } else if (status.StartsWith("playing")) {
            _isPlaying = true;
        }
    }

    public static void Play(string filePath) {
        mciSendString("close media", null, 0, IntPtr.Zero);
        mciSendString("open \"" + filePath + "\" type waveaudio alias media", null, 0, IntPtr.Zero);
        mciSendString("play media", null, 0, IntPtr.Zero);
        StartMonitoring();
    }

    public static void Pause() {
        mciSendString("pause media", null, 0, IntPtr.Zero);
    }

    public static void Resume() {
        mciSendString("resume media", null, 0, IntPtr.Zero);
    }

    public static void Stop() {
        mciSendString("stop media", null, 0, IntPtr.Zero);
        mciSendString("close media", null, 0, IntPtr.Zero);
        _isPlaying = false;
    }
    
    public static string GetStatus() {
        StringBuilder sb = new StringBuilder(128);
        mciSendString("status media mode", sb, 128, IntPtr.Zero);
        return sb.ToString();
    }
}
"@

Add-Type -TypeDefinition $code

Write-Host "READY"

while ($true) {
    $line = Read-Host
    if ($line -match "^PLAY (.+)$") {
        $filePath = $matches[1]
        [AudioPlayer]::Play($filePath)
        Write-Host "PLAYING"
    }
    elseif ($line -eq "PAUSE") {
        [AudioPlayer]::Pause()
        Write-Host "PAUSED"
    }
    elseif ($line -eq "RESUME") {
        [AudioPlayer]::Resume()
        Write-Host "RESUMED"
    }
    elseif ($line -eq "STOP") {
        [AudioPlayer]::Stop()
        Write-Host "STOPPED"
    }
    elseif ($line -eq "EXIT") {
        [AudioPlayer]::Stop()
        break
    }
}
