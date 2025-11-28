const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

class VoiceNoteManager {
  constructor() {
    this.metadataFile = "metadata.json";
  }

  getStorageDir() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return null;
    return vscode.Uri.joinPath(workspaceFolders[0].uri, ".vomment-data");
  }

  async getMetadataUri() {
    const dir = this.getStorageDir();
    if (!dir) return null;

    // Ensure dir exists and add README
    try {
      await vscode.workspace.fs.createDirectory(dir);

      const readmeUri = vscode.Uri.joinPath(dir, "README.md");
      try {
        await vscode.workspace.fs.stat(readmeUri);
      } catch {
        const readmeContent =
          "# Voice Note Data\n\nThis folder contains metadata and configuration for the Voice Note Comment extension.\n\n**Please do not delete or modify these files manually** as it may corrupt your voice note linkages.";
        await vscode.workspace.fs.writeFile(
          readmeUri,
          new TextEncoder().encode(readmeContent)
        );
      }
    } catch (e) {}

    return vscode.Uri.joinPath(dir, this.metadataFile);
  }

  async loadMetadata() {
    const uri = await this.getMetadataUri();
    if (!uri) return {};

    try {
      const data = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(new TextDecoder().decode(data));
    } catch (e) {
      return {};
    }
  }

  async saveMetadata(metadata) {
    const uri = await this.getMetadataUri();
    if (!uri) return;

    const content = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
    await vscode.workspace.fs.writeFile(uri, content);
  }

  async addNote(id, data) {
    const metadata = await this.loadMetadata();
    metadata[id] = {
      ...data,
      timestamp: Date.now(),
    };
    await this.saveMetadata(metadata);
  }

  async getNote(id) {
    const metadata = await this.loadMetadata();
    return metadata[id];
  }

  async deleteNote(id) {
    const metadata = await this.loadMetadata();
    if (metadata[id]) {
      delete metadata[id];
      await this.saveMetadata(metadata);
    }
  }
}

module.exports = VoiceNoteManager;
