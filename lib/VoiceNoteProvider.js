const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

class VoiceNoteProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (!element) {
      // Root: List files containing voice notes
      const files = await this.getFilesWithVoiceNotes();
      if (files.length === 0) {
        const emptyItem = new vscode.TreeItem(
          "No voice notes yet",
          vscode.TreeItemCollapsibleState.None
        );
        emptyItem.contextValue = "empty";
        return [emptyItem];
      }
      return files;
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
        // Regex to find the metadata line: // 🎙️ Voice Note (00:05) [filename.wav]
        // We just check if it exists
        if (/🎙️ Voice Note \([^)]+\) \[[^\]]+\]/.test(text)) {
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

    // Regex: // 🎙️ Voice Note (00:05) [filename.wav]
    const regex = /🎙️ Voice Note \(([^)]+)\) \[([^\]]+)\]/;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(regex);
      if (match) {
        const duration = match[1];
        const fileName = match[2];
        const lineNum = i + 1;
        notes.push(new VoiceNoteItem(uri, lineNum, duration, fileName));
      }
    }

    return notes;
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
  constructor(resourceUri, line, duration, fileName) {
    super(`Line ${line}: ${duration}`, vscode.TreeItemCollapsibleState.None);
    this.resourceUri = resourceUri;
    this.type = "note";
    this.tooltip = `Click to jump to line ${line}`;
    this.description = fileName;
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
