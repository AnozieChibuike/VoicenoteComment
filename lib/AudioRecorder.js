const { spawn } = require("child_process");
const path = require("path");
const vscode = require("vscode");

class AudioRecorder {
  constructor(extensionPath) {
    this.scriptPath = path.join(extensionPath, "lib", "audio_recorder.ps1");
    this.process = null;
    this.isReady = false;
    this.onReady = null;
  }

  initialize() {
    return new Promise((resolve, reject) => {
      if (this.process) {
        resolve();
        return;
      }

      this.process = spawn("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        this.scriptPath,
      ]);

      this.process.stdout.on("data", (data) => {
        const msg = data.toString().trim();
        console.log(`[AudioRecorder PS]: ${msg}`);
        if (msg === "READY") {
          this.isReady = true;
          if (this.onReady) this.onReady();
          resolve();
        }
      });

      this.process.stderr.on("data", (data) => {
        console.error(`[AudioRecorder PS Error]: ${data.toString()}`);
      });

      this.process.on("close", (code) => {
        console.log(`AudioRecorder process exited with code ${code}`);
        this.process = null;
        this.isReady = false;
      });
    });
  }

  start() {
    if (!this.process || !this.isReady) {
      throw new Error("Recorder not initialized");
    }
    this.process.stdin.write("START\n");
  }

  stop(filePath) {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error("Recorder not running"));
        return;
      }

      const handler = (data) => {
        const msg = data.toString().trim();
        if (msg.startsWith("SAVED")) {
          this.process.stdout.removeListener("data", handler);
          resolve(filePath);
        } else if (msg === "ERROR") {
          this.process.stdout.removeListener("data", handler);
          reject(new Error("Failed to save recording"));
        }
      };

      this.process.stdout.on("data", handler);
      this.process.stdin.write(`STOP ${filePath}\n`);
    });
  }

  cancel() {
    if (this.process) {
      this.process.stdin.write("CANCEL\n");
    }
  }

  dispose() {
    if (this.process) {
      this.process.stdin.write("EXIT\n");
      this.process.kill();
      this.process = null;
    }
  }
}

module.exports = AudioRecorder;
