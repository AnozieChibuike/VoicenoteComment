
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class AudioRecorder {
    [DllImport("winmm.dll", EntryPoint = "mciSendStringA", CharSet = CharSet.Ansi)]
    public static extern int mciSendString(string lpstrCommand, StringBuilder lpstrReturnString, int uReturnLength, IntPtr hwndCallback);

    public static string LastError = "";

    public static bool Record() {
        // Close any existing session with the same alias just in case
        mciSendString("close recsound", null, 0, IntPtr.Zero);
        
        int result = mciSendString("open new type waveaudio alias recsound", null, 0, IntPtr.Zero);
        if (result != 0) return false;

        // Set higher quality (optional, defaults are usually low)
        // mciSendString("set recsound bitspersample 16", null, 0, IntPtr.Zero);
        // mciSendString("set recsound samplespersec 44100", null, 0, IntPtr.Zero);
        // mciSendString("set recsound channels 1", null, 0, IntPtr.Zero);

        result = mciSendString("record recsound", null, 0, IntPtr.Zero);
        return result == 0;
    }

    public static bool Save(string filePath) {
        int result = mciSendString("save recsound \"" + filePath + "\"", null, 0, IntPtr.Zero);
        mciSendString("close recsound", null, 0, IntPtr.Zero);
        return result == 0;
    }

    public static void Discard() {
        mciSendString("close recsound", null, 0, IntPtr.Zero);
    }
}
"@

Add-Type -TypeDefinition $code

Write-Host "READY"

while ($true) {
    $line = Read-Host
    if ($line -eq "START") {
        $success = [AudioRecorder]::Record()
        if ($success) { Write-Host "STARTED" } else { Write-Host "ERROR" }
    }
    elseif ($line -match "^STOP (.+)$") {
        $filePath = $matches[1]
        $success = [AudioRecorder]::Save($filePath)
        if ($success) { Write-Host "SAVED $filePath" } else { Write-Host "ERROR" }
    }
    elseif ($line -eq "CANCEL") {
        [AudioRecorder]::Discard()
        Write-Host "CANCELLED"
    }
    elseif ($line -eq "EXIT") {
        break
    }
}
