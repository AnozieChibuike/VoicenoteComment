// @ts-check

const vscode = require("vscode");
const path = require("path");
const crypto = require("crypto");
const AudioRecorder = require("./lib/AudioRecorder");
const AudioPlayer = require("./lib/AudioPlayer");
const VoiceNoteProvider = require("./lib/VoiceNoteProvider");

let globalRecorder = null;
let globalPlayer = null;
let playbackStatusBarItem = null;

/**
 * Creates the special comment marker to insert into the code.
 * @param {string} audioFileName
 * @param {string} audioDuration
 * @param {vscode.TextEditor} editor
 * @returns {string} The formatted comment block.
 */
function createCommentMarker(audioFileName, audioDuration, editor) {
  let commentPrefix = "//";
  let commentSuffix = "";

  if (editor) {
    const languageId = editor.document.languageId;
    console.log(`[VoiceNote] Detected languageId: ${languageId}`);

    switch (languageId) {
      // Hash-style comments (#)
      case "python":
      case "yaml":
      case "shellscript":
      case "makefile":
      case "dockerfile":
      case "perl":
      case "ruby":
      case "powershell":
      case "r":
      case "elixir":
      case "julia":
      case "tcl":
      case "coffeescript":
      case "graphql":
        commentPrefix = "#";
        break;

      // XML-style comments (<!-- -->)
      case "html":
      case "xml":
      case "markdown":
      case "vue":
      case "svg":
        commentPrefix = "<!-- ";
        commentSuffix = " -->";
        break;

      // CSS-style comments (/* */)
      case "css":
      case "less":
      case "sass":
      case "scss":
        commentPrefix = "/* ";
        commentSuffix = " */";
        break;

      // Percent-style comments (%)
      case "latex":
      case "erlang":
      case "matlab":
        commentPrefix = "%";
        break;

      // Dash-style comments (--)
      case "sql":
      case "lua":
      case "haskell":
      case "ada":
      case "vhdl":
      case "applescript":
        commentPrefix = "--";
        break;

      // Semicolon-style comments (;)
      case "clojure":
      case "lisp":
      case "scheme":
      case "ini":
        commentPrefix = ";";
        break;

      // Bat-style
      case "bat":
        commentPrefix = "REM ";
        break;

      // VB-style (')
      case "vb":
        commentPrefix = "'";
        break;

      // Vimscript (")
      case "vim":
      case "vimscript":
        commentPrefix = '"';
        break;
    }
  }

  const commentPrefixLine = commentPrefix.trim();

  // Clean single-line marker
  // Format: // 🎙️ Voice Note (00:05) [filename.wav]
  let marker = `${commentPrefixLine} 🎙️ Voice Note (${audioDuration}) [${audioFileName}]`;

  if (commentSuffix) {
    marker += ` ${commentSuffix}`;
  }

  marker += "\n";

  return marker;
}

/**
 * CodeLens Provider to show "Play" button over voice notes.
 */
class VoiceNoteCodeLensProvider {
  constructor() {
    this._onDidChangeCodeLenses = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    this.playingFile = null;
    this.playbackState = "stopped"; // 'playing', 'paused', 'stopped'
  }

  refresh() {
    this._onDidChangeCodeLenses.fire();
  }

  updateState(fileName, state) {
    this.playingFile = fileName;
    this.playbackState = state;
    this.refresh();
  }

  provideCodeLenses(document, token) {
    const codeLenses = [];
    const text = document.getText();
    // Regex to find the metadata line: // 🎙️ Voice Note (00:05) [filename.wav]
    const regex = /🎙️ Voice Note \(([^)]+)\) \[([^\]]+)\]/g;

    let match;
    while ((match = regex.exec(text)) !== null) {
      const position = document.positionAt(match.index);
      const line = document.lineAt(position.line);
      const duration = match[1];
      const fileName = match[2];

      const range = line.range;

      const isCurrentFile = this.playingFile === fileName;
      const state = isCurrentFile ? this.playbackState : "stopped";

      // Always show Delete
      const commandDelete = {
        title: `$(trash) Delete`,
        tooltip: "Click to delete voice note",
        command: "voicenote.deleteNote",
        arguments: [fileName, document.uri],
      };

      if (state === "playing") {
        // Show Pause and Stop
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(debug-pause) Pause`,
            tooltip: "Click to pause audio",
            command: "voicenote.togglePause",
            arguments: [],
          })
        );
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(debug-stop) Stop`,
            tooltip: "Click to stop audio",
            command: "voicenote.stopPlayback",
            arguments: [],
          })
        );
      } else if (state === "paused") {
        // Show Play (Resume) and Stop
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(play) Play`,
            tooltip: "Click to resume audio",
            command: "voicenote.togglePause",
            arguments: [],
          })
        );
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(debug-stop) Stop`,
            tooltip: "Click to stop audio",
            command: "voicenote.stopPlayback",
            arguments: [],
          })
        );
      } else {
        // Stopped: Show Play
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(play) Play`,
            tooltip: "Click to play audio",
            command: "voicenote.playback",
            arguments: [fileName],
          })
        );
      }

      codeLenses.push(new vscode.CodeLens(range, commandDelete));
    }
    return codeLenses;
  }
}

/**
 * Core function called when the extension is activated.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('"Voice Note Comment" is now active!');

  // --- Error Handling Wrapper ---
  const safeExecute = async (fn, errorMessage) => {
    try {
      await fn();
    } catch (error) {
      console.error(errorMessage, error);
      vscode.window.showErrorMessage(`${errorMessage}: ${error.message}`);
    }
  };

  const recorder = new AudioRecorder(context.extensionPath);
  globalRecorder = recorder;

  const player = new AudioPlayer(context.extensionPath);
  globalPlayer = player;

  safeExecute(() => player.initialize(), "Failed to initialize audio player");

  // --- Status Bar Items ---
  playbackStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    101
  );
  playbackStatusBarItem.command = "voicenote.togglePause";
  context.subscriptions.push(playbackStatusBarItem);

  const stopStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  stopStatusBarItem.command = "voicenote.stopPlayback";
  stopStatusBarItem.text = "$(debug-stop) Stop";
  context.subscriptions.push(stopStatusBarItem);

  let isPaused = false;

  // --- Voice Note Tree View Provider ---
  const voiceNoteProvider = new VoiceNoteProvider();
  vscode.window.registerTreeDataProvider("voicenoteList", voiceNoteProvider);

  let refreshDisposable = vscode.commands.registerCommand(
    "voicenote.refreshList",
    () => {
      voiceNoteProvider.refresh();
    }
  );
  context.subscriptions.push(refreshDisposable);

  // --- Register CodeLens Provider ---
  const codeLensProvider = new VoiceNoteCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      codeLensProvider
    )
  );

  let currentPlayingFileName = null;

  // --- 1. Register the Command for Starting Recording (Alt+V) ---
  let disposable = vscode.commands.registerCommand(
    "voicenote.startRecording",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found.");
        return;
      }

      // Initialize recorder process if needed
      try {
        await recorder.initialize();
      } catch (err) {
        vscode.window.showErrorMessage(
          "Failed to initialize audio recorder: " + err.message
        );
        return;
      }

      // Create and show the Webview panel for recording
      const panel = vscode.window.createWebviewPanel(
        "voicenoteRecorder", // Identifies the type of the webview
        "Voice Note Recorder", // Title of the panel
        vscode.ViewColumn.Beside, // Shows up beside the active editor
        {
          enableScripts: true, // Essential to run the recorder JavaScript
          retainContextWhenHidden: true, // Keep the recorder alive if the user switches tabs
        }
      );

      // Get the HTML content for the webview
      panel.webview.html = getWebviewContent(
        panel.webview,
        context.extensionUri
      );

      // --- Handle messages from the Webview ---
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case "startRecording":
              try {
                recorder.start();
              } catch (err) {
                panel.webview.postMessage({
                  command: "error",
                  message: err.message,
                });
              }
              break;

            case "stopRecording":
              // Message: { command: 'stopRecording', duration: '0:05' }
              const duration = message.duration;

              // --- File Saving Logic ---
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (!workspaceFolders) {
                vscode.window.showErrorMessage(
                  "Voice Note requires an open workspace folder."
                );
                panel.dispose();
                return;
              }

              const workspaceRoot = workspaceFolders[0].uri;
              const storageUri = vscode.Uri.joinPath(
                workspaceRoot,
                ".voicenotes"
              );

              // Ensure the directory exists
              try {
                await vscode.workspace.fs.createDirectory(storageUri);
              } catch (e) {
                // Directory likely already exists
              }

              // Generate a unique file name (using .wav for Windows Recorder)
              const audioFileName = `${crypto
                .randomBytes(8)
                .toString("hex")}.wav`;
              const fileUri = vscode.Uri.joinPath(storageUri, audioFileName);

              // We need the fsPath for the PowerShell script
              const fsPath = fileUri.fsPath;

              try {
                await recorder.stop(fsPath);

                // --- Insert Comment into Code ---
                const marker = createCommentMarker(
                  audioFileName,
                  duration,
                  editor
                );

                // Determine insertion position:
                const currentLine = editor.document.lineAt(
                  editor.selection.active.line
                );
                let position = currentLine.range.start;

                if (currentLine.isEmptyOrWhitespace) {
                  position = editor.selection.active;
                }

                editor
                  .edit((editBuilder) => {
                    editBuilder.insert(position, marker);
                  })
                  .then((success) => {
                    if (success) {
                      vscode.window.showInformationMessage(
                        `🎙️ Voice Note comment added! (${duration})`
                      );
                      // Refresh the tree view
                      voiceNoteProvider.refresh();
                    } else {
                      vscode.window.showErrorMessage(
                        "Failed to insert comment into the editor."
                      );
                    }
                  });

                panel.dispose(); // Close the recorder panel
              } catch (error) {
                vscode.window.showErrorMessage(
                  `Failed to save voice note: ${error.message}`
                );
                panel.webview.postMessage({
                  command: "error",
                  message: error.message,
                });
              }
              break;

            case "cancelRecording":
              recorder.cancel();
              vscode.window.showInformationMessage(
                "Voice Note recording cancelled."
              );
              panel.dispose();
              break;
          }
        },
        undefined,
        context.subscriptions
      );

      panel.onDidDispose(() => {
        // Ensure we don't leave a recording running if the user closes the panel manually
        recorder.cancel();
      });
    }
  );

  // --- 2. Register the Playback Command ---
  let playbackDisposable = vscode.commands.registerCommand(
    "voicenote.playback",
    async (fileName) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      const workspaceRoot = workspaceFolders[0].uri;
      const fileUri = vscode.Uri.joinPath(
        workspaceRoot,
        ".voicenotes",
        fileName
      );

      // Check if file exists
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch (e) {
        vscode.window.showErrorMessage(`Audio file not found: ${fileName}`);
        return;
      }

      // Use native player
      try {
        await player.initialize(); // Ensure ready
        player.play(fileUri.fsPath);

        // Update State
        currentPlayingFileName = fileName;
        isPaused = false;
        codeLensProvider.updateState(fileName, "playing");

        // Show status bar
        playbackStatusBarItem.text = `$(debug-pause) Pause`;
        playbackStatusBarItem.show();
        stopStatusBarItem.show();
      } catch (err) {
        vscode.window.showErrorMessage("Failed to play audio: " + err.message);
      }
    }
  );

  // --- 3. Register Stop Playback Command ---
  let stopPlaybackDisposable = vscode.commands.registerCommand(
    "voicenote.stopPlayback",
    () => {
      if (globalPlayer) {
        globalPlayer.stop();
        playbackStatusBarItem.hide();
        stopStatusBarItem.hide();
        isPaused = false;
        currentPlayingFileName = null;
        codeLensProvider.updateState(null, "stopped");
      }
    }
  );

  // --- 3.5 Register Toggle Pause Command ---
  let togglePauseDisposable = vscode.commands.registerCommand(
    "voicenote.togglePause",
    () => {
      if (globalPlayer) {
        if (isPaused) {
          globalPlayer.resume();
          isPaused = false;
          playbackStatusBarItem.text = "$(debug-pause) Pause";
          if (currentPlayingFileName) {
            codeLensProvider.updateState(currentPlayingFileName, "playing");
          }
        } else {
          globalPlayer.pause();
          isPaused = true;
          playbackStatusBarItem.text = "$(debug-start) Resume";
          if (currentPlayingFileName) {
            codeLensProvider.updateState(currentPlayingFileName, "paused");
          }
        }
      }
    }
  );

  context.subscriptions.push(
    disposable,
    playbackDisposable,
    stopPlaybackDisposable,
    togglePauseDisposable
  );

  // --- 4. Register Delete Voice Note Command ---
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "voicenote.deleteNote",
      async (arg1, arg2) => {
        let fileName, resourceUri;

        // Check if called from Explorer (TreeItem) or CodeLens (arguments)
        if (arg1 && arg1.contextValue === "note") {
          fileName = arg1.description;
          resourceUri = arg1.resourceUri;
        } else {
          fileName = arg1;
          resourceUri = arg2;
        }

        if (!fileName || !resourceUri) return;

        const confirm = await vscode.window.showWarningMessage(
          `Are you sure you want to delete this voice note?`,
          { modal: true },
          "Delete"
        );
        if (confirm !== "Delete") return;

        try {
          // 1. Delete the audio file
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders) {
            const workspaceRoot = workspaceFolders[0].uri;
            const audioFileUri = vscode.Uri.joinPath(
              workspaceRoot,
              ".voicenotes",
              /** @type {string} */ (fileName)
            );
            try {
              await vscode.workspace.fs.delete(audioFileUri);
            } catch (e) {
              console.warn("Audio file not found or already deleted");
            }
          }

          // 2. Remove the comment from the file
          const document = await vscode.workspace.openTextDocument(resourceUri);
          const editor = await vscode.window.showTextDocument(document);

          const text = document.getText();
          const lines = text.split("\n");
          // Escape the filename for regex
          const escapedFileName = fileName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );
          const regex = new RegExp(`\\[${escapedFileName}\\]`);

          let lineToDelete = -1;
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              lineToDelete = i;
              break;
            }
          }

          if (lineToDelete !== -1) {
            await editor.edit((editBuilder) => {
              const range =
                document.lineAt(lineToDelete).rangeIncludingLineBreak;
              editBuilder.delete(range);
            });
          }

          voiceNoteProvider.refresh();
          vscode.window.showInformationMessage("Voice note deleted.");
        } catch (err) {
          vscode.window.showErrorMessage(
            "Failed to delete voice note: " + err.message
          );
        }
      }
    )
  );

  // --- 5. Register Delete All Voice Notes Command ---
  context.subscriptions.push(
    vscode.commands.registerCommand("voicenote.deleteAllNotes", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Are you sure you want to DELETE ALL voice notes? This cannot be undone.",
        { modal: true },
        "Delete All"
      );
      if (confirm !== "Delete All") return;

      try {
        // 1. Get all files with voice notes
        const files = await voiceNoteProvider.getFilesWithVoiceNotes();

        for (const fileItem of files) {
          try {
            const document = await vscode.workspace.openTextDocument(
              fileItem.resourceUri
            );
            const text = document.getText();
            const lines = text.split("\n");
            const regex = /🎙️ Voice Note \(([^)]+)\) \[([^\]]+)\]/;

            const edit = new vscode.WorkspaceEdit();
            let hasEdits = false;

            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                const range = document.lineAt(i).rangeIncludingLineBreak;
                edit.delete(fileItem.resourceUri, range);
                hasEdits = true;
              }
            }

            if (hasEdits) {
              await vscode.workspace.applyEdit(edit);
            }
          } catch (e) {
            console.error(
              `Error processing file ${fileItem.resourceUri.fsPath}:`,
              e
            );
          }
        }

        // 2. Delete .voicenotes directory content
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
          const workspaceRoot = workspaceFolders[0].uri;
          const storageUri = vscode.Uri.joinPath(workspaceRoot, ".voicenotes");
          try {
            await vscode.workspace.fs.delete(storageUri, {
              recursive: true,
              useTrash: false,
            });
            // Recreate empty dir
            await vscode.workspace.fs.createDirectory(storageUri);
          } catch (e) {
            // Ignore if doesn't exist
          }
        }

        voiceNoteProvider.refresh();
        vscode.window.showInformationMessage("All voice notes deleted.");
      } catch (err) {
        vscode.window.showErrorMessage(
          "Failed to delete all voice notes: " + err.message
        );
      }
    })
  );
}

// This utility function generates the Webview HTML content.
function getWebviewContent(webview, extensionUri) {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "webview", "recorder.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "webview", "style.css")
  );
  const cspSource = webview.cspSource;

  return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; media-src * blob: data:;">
            <title>Recorder</title>
            <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
            <div class="container">
                <div id="status">Ready to Record</div>
                <div id="timer">00:00</div>
                <div class="controls">
                    <button id="recordButton">🎙️ Record</button>
                    <button id="stopButton" disabled>🛑 Stop & Insert</button>
                    <button id="cancelButton">❌ Cancel</button>
                </div>
            </div>
            <script src="${scriptUri}"></script>
        </body>
        </html>
    `;
}

module.exports = {
  activate,
  deactivate: () => {
    if (globalRecorder) {
      globalRecorder.dispose();
    }
    if (globalPlayer) {
      globalPlayer.dispose();
    }
  },
};
