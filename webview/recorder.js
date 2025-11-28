// @ts-check
const vscode = acquireVsCodeApi();

// UI elements
const recordButton = document.getElementById("recordButton");
const stopButton = document.getElementById("stopButton");
const cancelButton = document.getElementById("cancelButton");
const statusDiv = document.getElementById("status");
const timerDiv = document.getElementById("timer");
const body = document.body;

let timerInterval;
let startTime;

// --- Utility Functions ---

function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsedTime = Date.now() - startTime;
    const minutes = Math.floor(elapsedTime / 60000);
    const seconds = Math.floor((elapsedTime % 60000) / 1000);
    timerDiv.textContent = `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function resetUI() {
  body.classList.remove("recording");
  if (statusDiv) statusDiv.textContent = "Ready to Record";
  if (timerDiv) timerDiv.textContent = "00:00";
  if (recordButton) recordButton.disabled = false;
  if (stopButton) stopButton.disabled = true;
}

// --- Event Handlers ---

if (recordButton) {
  recordButton.onclick = () => {
    // Notify extension to start recording
    vscode.postMessage({ command: "startRecording" });

    // Update UI immediately
    startTimer();
    body.classList.add("recording");
    statusDiv.textContent = "🔴 Recording (System)...";
    recordButton.disabled = true;
    stopButton.disabled = false;
    cancelButton.disabled = false;
  };
}

if (stopButton) {
  stopButton.onclick = () => {
    stopTimer();
    statusDiv.textContent = "Processing...";
    stopButton.disabled = true;
    cancelButton.disabled = true;

    // Calculate duration string
    const durationMs = Date.now() - startTime;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    const durationText = `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;

    // Notify extension to stop and save
    vscode.postMessage({
      command: "stopRecording",
      duration: durationText,
    });
  };
}

if (cancelButton) {
  cancelButton.onclick = () => {
    stopTimer();
    vscode.postMessage({ command: "cancelRecording" });
    resetUI();
  };
}

// Handle messages from extension (e.g. errors)
window.addEventListener("message", (event) => {
  const message = event.data;
  switch (message.command) {
    case "error":
      statusDiv.innerHTML = `<span style="color:red">Error: ${message.message}</span>`;
      stopTimer();
      resetUI();
      break;
  }
});

resetUI();
