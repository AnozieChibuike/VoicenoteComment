const { spawn } = require("child_process");
const path = require("path");
const EventEmitter = require("events");

class AudioPlayer extends EventEmitter {
  constructor(extensionPath) {
    super();
    this.scriptPath = path.join(extensionPath, "lib", "audio_player.ps1");
    this.process = null;
    this.isReady = false;
    this.currentFile = null;
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
        // console.log(`[AudioPlayer PS]: ${msg}`);
        if (msg === "READY") {
          this.isReady = true;
          resolve();
        } else if (msg === "FINISHED") {
          this.emit("finish");
        }
      });

      this.process.stderr.on("data", (data) => {
        console.error(`[AudioPlayer PS Error]: ${data.toString()}`);
      });

      this.process.on("close", (code) => {
        this.process = null;
        this.isReady = false;
      });
    });
  }

  play(filePath) {
    if (!this.process || !this.isReady) return;
    this.currentFile = filePath;
    this.process.stdin.write(`PLAY ${filePath}\n`);
  }

  pause() {
    if (!this.process) return;
    this.process.stdin.write("PAUSE\n");
  }

  resume() {
    if (!this.process) return;
    this.process.stdin.write("RESUME\n");
  }

  stop() {
    if (!this.process) return;
    this.process.stdin.write("STOP\n");
    this.currentFile = null;
  }

  dispose() {
    if (this.process) {
      this.process.stdin.write("EXIT\n");
      this.process.kill();
      this.process = null;
    }
  }
}

module.exports = AudioPlayer;
