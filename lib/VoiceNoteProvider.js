const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const VoiceNoteManager = require("./VoiceNoteManager");

class VoiceNoteProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.manager = new VoiceNoteManager();
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (!element) {
      // Root: Storage Status + Files
      const items = [];

      // 1. Storage Status Item
      const config = vscode.workspace.getConfiguration("voicenote");
      const storageMethod = config.get("storageMethod");
      const statusItem = new vscode.TreeItem(
        `Storage: ${storageMethod === "cloudinary" ? "Cloud ☁️" : "Local 💻"}`,
        vscode.TreeItemCollapsibleState.None
      );
      statusItem.contextValue = "storageStatus";
      statusItem.iconPath = new vscode.ThemeIcon("database");
      statusItem.tooltip = "Click to switch storage method";
      statusItem.command = {
        command: "voicenote.switchStorage",
        title: "Switch Storage",
      };
      items.push(statusItem);

      // 2. Files
      const files = await this.getFilesWithVoiceNotes();
      if (files.length === 0) {
        const emptyItem = new vscode.TreeItem(
          "No voice notes yet",
          vscode.TreeItemCollapsibleState.None
        );
        emptyItem.contextValue = "empty";
        items.push(emptyItem);
      } else {
        items.push(...files);
      }

      return items;
    } else if (element.type === "file") {
      // Children: List voice notes within the file
      return this.getVoiceNotesInFile(element.resourceUri);
    }
    return [];
  }

  async getFilesWithVoiceNotes() {
    // Find all files in workspace (excluding node_modules, .git, etc.)
    const files = await vscode.workspace.findFiles(
      "**/*",
      "{**/node_modules/**,**/.git/**,**/.voicenotes/**}"
    );
    const filesWithNotes = [];

    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();
        // Match both legacy and new formats
        // Legacy: [filename.wav] or [http...]
        // New: [id:xyz]
        const regex = /🎙️ Voice Note \(([^)]+)\) \[(?:id:)?([^\]]+)\]/g;

        let match;
        let hasValidNote = false;
        while ((match = regex.exec(text)) !== null) {
          const fileName = match[2];
          if (await this.audioFileExists(file, fileName)) {
            hasValidNote = true;
            break;
          }
        }

        if (hasValidNote) {
          filesWithNotes.push(new FileItem(file));
        }
      } catch (e) {
        console.error(`Error reading file ${file.fsPath}:`, e);
      }
    }

    return filesWithNotes.sort((a, b) => {
      const nameA = path.basename(a.resourceUri.fsPath);
      const nameB = path.basename(b.resourceUri.fsPath);
      return nameA.localeCompare(nameB);
    });
  }

  async getVoiceNotesInFile(uri) {
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    const lines = text.split("\n");
    const notes = [];

    // Regex: // 🎙️ Voice Note (00:05) [filename.wav] or [id:xyz]
    const regex = /🎙️ Voice Note \(([^)]+)\) \[(?:id:)?([^\]]+)\]/;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(regex);
      if (match) {
        const duration = match[1];
        const fileName = match[2];

        if (await this.audioFileExists(uri, fileName)) {
          let author = null;
          // Check if it's a Metadata ID (New)
          if (!fileName.startsWith("http") && !fileName.endsWith(".wav")) {
            const note = await this.manager.getNote(fileName);
            if (note) author = note.author;
          }

          const lineNum = i + 1;
          notes.push(
            new VoiceNoteItem(uri, lineNum, duration, fileName, author)
          );
        }
      }
    }

    return notes;
  }

  async audioFileExists(documentUri, fileNameOrId) {
    // Check if it's a URL (Legacy)
    if (fileNameOrId.startsWith("http")) {
      return true;
    }

    // Check if it's a Metadata ID (New)
    // We assume if it doesn't look like a file extension .wav, it might be an ID
    if (!fileNameOrId.endsWith(".wav")) {
      const note = await this.manager.getNote(fileNameOrId);
      return !!note;
    }

    // Check Local File (Legacy)
    const folder = vscode.workspace.getWorkspaceFolder(documentUri);
    if (!folder) return false;
    const fileUri = vscode.Uri.joinPath(
      folder.uri,
      ".voicenotes",
      fileNameOrId
    );
    try {
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch {
      return false;
    }
  }
}

class FileItem extends vscode.TreeItem {
  constructor(resourceUri) {
    super(resourceUri, vscode.TreeItemCollapsibleState.Expanded);
    this.type = "file";
    this.tooltip = resourceUri.fsPath;
    this.description = true; // Shows path relative to workspace
  }
}

class VoiceNoteItem extends vscode.TreeItem {
  constructor(resourceUri, line, duration, fileName, author) {
    const label = author
      ? `Line ${line}: ${duration} by ${author}`
      : `Line ${line}: ${duration}`;
    super(label, vscode.TreeItemCollapsibleState.None);
    this.resourceUri = resourceUri;
    this.type = "note";
    this.tooltip = author
      ? `ID: ${fileName}\nAuthor: ${author}\nClick to jump to line ${line}`
      : `ID: ${fileName}\nClick to jump to line ${line}`;
    this.description = author ? "" : fileName;
    this.iconPath = new vscode.ThemeIcon("mic");

    this.contextValue = "note";

    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [
        resourceUri,
        {
          selection: new vscode.Range(line - 1, 0, line - 1, 1000),
        },
      ],
    };
  }
}

module.exports = VoiceNoteProvider;
