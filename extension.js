// @ts-check

const vscode = require("vscode");
const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const AudioRecorder = require("./lib/AudioRecorder");
const AudioPlayer = require("./lib/AudioPlayer");
const VoiceNoteProvider = require("./lib/VoiceNoteProvider");
const CloudinaryService = require("./lib/CloudinaryService");
const VoiceNoteManager = require("./lib/VoiceNoteManager");

let globalRecorder = null;
let globalPlayer = null;
let playbackStatusBarItem = null;

function createCommentMarker(
  audioFileName,
  audioDuration,
  editor,
  author,
  textComment
) {
  const languageId = editor.document.languageId;
  const config = vscode.workspace.getConfiguration(
    "voicenote",
    editor.document.uri
  );

  let commentPrefix = "//";
  let commentSuffix = "";

  // Check for block comment preference
  const useBlockComments = config.get("useBlockComments", false);

  if (useBlockComments) {
    switch (languageId) {
      case "javascript":
      case "typescript":
      case "javascriptreact":
      case "typescriptreact":
      case "c":
      case "cpp":
      case "csharp":
      case "java":
      case "css":
      case "less":
      case "scss":
      case "go":
      case "rust":
      case "php":
      case "swift":
      case "kotlin":
      case "scala":
      case "dart":
        commentPrefix = "/*";
        commentSuffix = "*/";
        break;
      case "html":
      case "xml":
      case "markdown":
        commentPrefix = "<!--";
        commentSuffix = "-->";
        break;
      case "python":
      case "ruby":
      case "perl":
      case "yaml":
      case "dockerfile":
      case "shellscript":
      case "makefile":
        // No standard block comments, fallback to line
        commentPrefix = "#";
        break;
      case "lua":
        commentPrefix = "--[[";
        commentSuffix = "]]";
        break;
    }
  } else {
    // Line comments
    switch (languageId) {
      case "python":
      case "ruby":
      case "perl":
      case "yaml":
      case "dockerfile":
      case "shellscript":
      case "makefile":
        commentPrefix = "#";
        break;
      case "html":
      case "xml":
      case "markdown":
        commentPrefix = "<!--";
        commentSuffix = "-->";
        break;
      case "css":
      case "less":
      case "scss":
        commentPrefix = "/*";
        commentSuffix = "*/";
        break;
      case "lua":
      case "haskell":
      case "ada":
      case "vhdl":
      case "applescript":
        commentPrefix = "--";
        break;
      case "clojure":
      case "lisp":
      case "scheme":
      case "ini":
        commentPrefix = ";";
        break;
      case "bat":
        commentPrefix = "REM ";
        break;
      case "vb":
        commentPrefix = "'";
        break;
      case "vim":
      case "vimscript":
        commentPrefix = '"';
        break;
    }
  }

  const commentPrefixLine = commentPrefix.trim();

  // Format: // 🎙️ Voice Note (00:05) [id:xyz]
  let marker = `${commentPrefixLine} 🎙️ Voice Note (${audioDuration}) [id:${audioFileName}]`;

  if (author) {
    marker += ` by ${author}`;
  }

  if (commentSuffix) {
    marker += ` ${commentSuffix}`;
  }

  marker += "\n";

  if (textComment) {
    marker += `${commentPrefixLine} ${textComment}`;
    if (commentSuffix) {
      marker += ` ${commentSuffix}`;
    }
    marker += "\n";
  }

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

  async provideCodeLenses(document, token) {
    const codeLenses = [];
    const text = document.getText();
    // Regex to find the metadata line: // 🎙️ Voice Note (00:05) [id:xyz] or [filename]
    const regex = /🎙️ Voice Note \(([^)]+)\) \[(?:id:)?([^\]]+)\]/g;

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

      // Check if audio file exists
      let audioExists = false;

      // Check if it's a URL (Legacy)
      if (fileName.startsWith("http")) {
        audioExists = true;
      }
      // Check if it's a Metadata ID (New)
      else if (!fileName.endsWith(".wav")) {
        // We can't easily check async in provideCodeLenses without slowing it down,
        // so we assume it exists if it looks like an ID.
        audioExists = true;
      }
      // Check Local File (Legacy)
      else {
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (folder) {
          const fileUri = vscode.Uri.joinPath(
            folder.uri,
            ".voicenotes",
            fileName
          );
          try {
            await vscode.workspace.fs.stat(fileUri);
            audioExists = true;
          } catch {
            audioExists = false;
          }
        }
      }

      if (audioExists) {
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
      } else {
        // Audio missing: Show warning or just Delete
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(warning) Audio Missing`,
            tooltip: "Audio file not found",
            command: "",
            arguments: [],
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

  const cloudinaryService = new CloudinaryService();
  const voiceNoteManager = new VoiceNoteManager();

  safeExecute(() => player.initialize(), "Failed to initialize audio player");
  safeExecute(
    () => recorder.initialize(),
    "Failed to initialize audio recorder"
  );

  // Listen for playback finish
  player.on("finish", () => {
    if (currentPlayingFileName) {
      codeLensProvider.updateState(currentPlayingFileName, "stopped");
    }
    playbackStatusBarItem.hide();
    stopStatusBarItem.hide();
    isPaused = false;
    currentPlayingFileName = null;
  });

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

      // Check for Author
      const config = vscode.workspace.getConfiguration("voicenote");
      let author = config.get("author");
      if (!author) {
        author = await vscode.window.showInputBox({
          placeHolder: "Enter your name (e.g., @JohnDoe)",
          prompt: "Please set your author name for voice notes.",
          ignoreFocusOut: true,
        });
        if (author) {
          await config.update(
            "author",
            author,
            vscode.ConfigurationTarget.Global
          );
        } else {
          // User cancelled, maybe warn or proceed without author?
          // Let's proceed but warn
          vscode.window.showWarningMessage(
            "Voice note will be created without an author."
          );
        }
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
              // Message: { command: 'stopRecording', duration: '0:05', textComment: '...' }
              const duration = message.duration;
              const textComment = message.textComment;

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

                // --- Storage Logic ---
                const config = vscode.workspace.getConfiguration("voicenote");
                const storageMethod = config.get("storageMethod");
                const author = config.get("author");
                let noteId = crypto.randomBytes(4).toString("hex"); // Generate short ID
                let storageUrl = "";
                let originalName = audioFileName;

                if (storageMethod === "cloudinary") {
                  if (cloudinaryService.isConfigured()) {
                    try {
                      vscode.window.showInformationMessage(
                        "Uploading voice note to Cloudinary..."
                      );
                      const url = await cloudinaryService.uploadFile(fsPath);
                      storageUrl = url;

                      // Delete local file after successful upload
                      try {
                        await vscode.workspace.fs.delete(fileUri);
                      } catch (e) {
                        console.warn(
                          "Failed to delete local file after upload",
                          e
                        );
                      }
                    } catch (uploadError) {
                      vscode.window.showErrorMessage(
                        "Upload failed, saving locally instead: " +
                          uploadError.message
                      );
                      // Fallback: Keep local file
                      storageUrl = audioFileName;
                    }
                  } else {
                    // Not configured, fallback to local
                    vscode.window.showWarningMessage(
                      "Cloudinary not configured. Saved locally."
                    );
                    storageUrl = audioFileName;
                  }
                } else {
                  // Local
                  storageUrl = audioFileName;
                }

                // Save Metadata
                await voiceNoteManager.addNote(noteId, {
                  url: storageUrl,
                  duration: duration,
                  originalName: originalName,
                  author: author,
                  textComment: textComment,
                });

                // --- Insert Comment into Code ---
                const marker = createCommentMarker(
                  noteId,
                  duration,
                  editor,
                  author,
                  textComment
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
    async (fileNameOrId) => {
      let playPath = "";
      let targetSource = fileNameOrId;

      // Resolve ID if needed
      if (!fileNameOrId.startsWith("http") && !fileNameOrId.endsWith(".wav")) {
        const note = await voiceNoteManager.getNote(fileNameOrId);
        if (note) {
          targetSource = note.url;
        } else {
          vscode.window.showErrorMessage(
            `Voice note ID not found: ${fileNameOrId}`
          );
          return;
        }
      }

      if (targetSource.startsWith("http")) {
        // Handle URL
        const config = vscode.workspace.getConfiguration("voicenote");
        const useCache = config.get("cacheOnlineAudio");

        let cachePath = null;
        if (useCache) {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders) {
            const workspaceRoot = workspaceFolders[0].uri;
            const cacheDir = vscode.Uri.joinPath(
              workspaceRoot,
              ".voicenotes",
              "cache"
            );
            // Create cache dir if needed
            try {
              await vscode.workspace.fs.createDirectory(cacheDir);
            } catch (e) {}

            // Hash the URL to get a safe filename
            const hash = crypto
              .createHash("md5")
              .update(targetSource)
              .digest("hex");
            cachePath = vscode.Uri.joinPath(cacheDir, `${hash}.wav`).fsPath;

            // Check if exists
            if (fs.existsSync(cachePath)) {
              console.log("Using cached audio:", cachePath);
              playPath = cachePath;
            }
          }
        }

        if (!playPath) {
          // Download to temp or cache
          const targetPath =
            cachePath || path.join(os.tmpdir(), `voicenote_${Date.now()}.wav`);

          try {
            if (!cachePath)
              vscode.window.showInformationMessage("Downloading voice note...");
            const https = require("https");
            const file = fs.createWriteStream(targetPath);

            await new Promise((resolve, reject) => {
              https
                .get(targetSource, function (response) {
                  if (response.statusCode !== 200) {
                    reject(new Error(`Status Code: ${response.statusCode}`));
                    return;
                  }
                  response.pipe(file);
                  file.on("finish", function () {
                    file.close(resolve);
                  });
                })
                .on("error", function (err) {
                  fs.unlink(targetPath, () => {});
                  reject(err);
                });
            });

            playPath = targetPath;
          } catch (err) {
            vscode.window.showErrorMessage(
              "Failed to download audio: " + err.message
            );
            return;
          }
        }
      } else {
        // Handle Local File
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const workspaceRoot = workspaceFolders[0].uri;
        const fileUri = vscode.Uri.joinPath(
          workspaceRoot,
          ".voicenotes",
          targetSource
        );

        // Check if file exists
        try {
          await vscode.workspace.fs.stat(fileUri);
          playPath = fileUri.fsPath;
        } catch (e) {
          vscode.window.showErrorMessage(
            `Audio file not found: ${targetSource}`
          );
          return;
        }
      }

      // Use native player
      try {
        await player.initialize(); // Ensure ready
        player.play(playPath);

        // Update State
        currentPlayingFileName = fileNameOrId;
        isPaused = false;
        codeLensProvider.updateState(fileNameOrId, "playing");

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
          // 1. Delete the audio file (if local)
          // Resolve ID first
          let targetSource = fileName;
          let note = null;
          if (!fileName.startsWith("http") && !fileName.endsWith(".wav")) {
            note = await voiceNoteManager.getNote(fileName);
            if (note) {
              targetSource = note.url;
              // Also delete metadata
              await voiceNoteManager.deleteNote(fileName);
            }
          }

          if (targetSource && !targetSource.startsWith("http")) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
              const workspaceRoot = workspaceFolders[0].uri;
              const audioFileUri = vscode.Uri.joinPath(
                workspaceRoot,
                ".voicenotes",
                /** @type {string} */ (targetSource)
              );
              try {
                await vscode.workspace.fs.delete(audioFileUri);
              } catch (e) {
                console.warn("Audio file not found or already deleted");
              }
            }
          } else {
            console.log("Skipping local file deletion for remote URL");
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
          // Match [id:xyz] or [filename]
          const regex = new RegExp(`\\[(?:id:)?${escapedFileName}\\]`);

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

              // Check for optional comment on next line
              if (note && note.textComment && note.textComment.trim()) {
                const nextLineIndex = lineToDelete + 1;
                if (nextLineIndex < document.lineCount) {
                  const nextLine = document.lineAt(nextLineIndex).text;
                  if (nextLine.includes(note.textComment)) {
                    const range2 =
                      document.lineAt(nextLineIndex).rangeIncludingLineBreak;
                    editBuilder.delete(range2);
                  }
                }
              }
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
            // Regex: // 🎙️ Voice Note (00:05) [filename.wav] or [id:xyz]
            const regex = /🎙️ Voice Note \(([^)]+)\) \[(?:id:)?([^\]]+)\]/;

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

  // --- 6. Switch Storage Command ---
  context.subscriptions.push(
    vscode.commands.registerCommand("voicenote.switchStorage", async () => {
      const config = vscode.workspace.getConfiguration("voicenote");
      const current = config.get("storageMethod");

      const items = [
        {
          label: "Local",
          description: "Save audio files in .voicenotes folder",
          picked: current === "local",
        },
        {
          label: "Cloudinary",
          description: "Upload to Cloudinary (requires config)",
          picked: current === "cloudinary",
        },
      ];

      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: "Select where to store voice notes",
      });

      if (selection) {
        const newValue = selection.label.toLowerCase();
        await config.update(
          "storageMethod",
          newValue,
          vscode.ConfigurationTarget.Global
        );

        // Refresh the tree view immediately
        voiceNoteProvider.refresh();

        vscode.window.showInformationMessage(
          `Voice Note storage set to: ${selection.label}`
        );

        // If Cloudinary selected but not configured, prompt
        if (newValue === "cloudinary" && !cloudinaryService.isConfigured()) {
          vscode.commands.executeCommand("voicenote.configureCloudinary");
        }
      }
    })
  );

  // --- 7. Configure Cloudinary Command ---
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "voicenote.configureCloudinary",
      async () => {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "voicenote.cloudinary"
        );
      }
    )
  );

  // --- 8. Set Author Command ---
  context.subscriptions.push(
    vscode.commands.registerCommand("voicenote.setAuthor", async () => {
      const config = vscode.workspace.getConfiguration("voicenote");
      const currentAuthor = config.get("author") || "";

      const newAuthor = await vscode.window.showInputBox({
        placeHolder: "Enter your name (e.g., @JohnDoe)",
        prompt: "Set your author name for voice notes.",
        value: currentAuthor,
        ignoreFocusOut: true,
      });

      if (newAuthor !== undefined) {
        // Allow empty string to clear it if they want
        await config.update(
          "author",
          newAuthor,
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(
          `Voice Note Author set to: ${newAuthor}`
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
                <div class="input-group">
                    <input type="text" id="commentInput" placeholder="Optional text comment..." />
                </div>
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
