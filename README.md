# 🎙️ Voice Note Comment for VS Code

**Voice Note Comment** is a powerful VS Code extension that allows you to record, attach, and play voice notes directly within your code comments. It's perfect for explaining complex logic, leaving feedback for code reviews, or just leaving reminders for your future self.

![Voice Note Demo](https://via.placeholder.com/800x400?text=Voice+Note+Demo+Image+Placeholder)

## ✨ Features

- **Record Audio**: Quickly record voice notes using a simple interface.
- **Inline Playback**: Play, Pause, and Stop audio directly from the code editor using CodeLens controls.
- **Explorer View**: Manage all your voice notes in a dedicated "Voice Notes" explorer view.
- **Seamless Integration**: Inserts a comment with metadata (duration, filename) directly into your code.
- **Collaboration Ready**: Share voice notes with your team by committing the audio files.
- **Dynamic Controls**: Smart controls that change based on playback state (Play -> Pause/Stop).

## 🚀 Getting Started

### Installation

Currently, this extension is available for local installation.

1.  **Download** the `.vsix` file (see "Deployment" below if you are building it yourself).
2.  Open VS Code.
3.  Go to the **Extensions** view (`Ctrl+Shift+X`).
4.  Click the `...` (Views and More Actions) menu at the top right of the Extensions view.
5.  Select **Install from VSIX...**.
6.  Select the `voicenote-comment-0.0.1.vsix` file.

### Usage

#### 1. Recording a Voice Note

1.  Open a file (JavaScript, Python, etc.).
2.  Place your cursor where you want the note.
3.  Press `Alt + V` (or run command `VoiceNote: Start Recording Comment`).
4.  A recorder panel will open. Click **Record**.
5.  When finished, click **Stop & Insert**.
6.  The extension will save the audio and insert a comment like:
    ```javascript
    // 🎙️ Voice Note (00:05) [a1b2c3d4.wav]
    ```

#### 2. Playing Audio

- Look above the comment line. You will see **Play**, **Delete**, and other controls.
- Click **Play** to listen.
- While playing, you can click **Pause** or **Stop**.

#### 3. Managing Notes

- Open the **Voice Notes** view in the Activity Bar (Mic icon) or Explorer.
- See a list of all files containing voice notes.
- Click a note to jump to its location.
- Click the **Trash** icon to delete the note and its audio file.

## 🤝 Collaboration

**Can this tool be used for collabs? YES!**

The extension saves all audio files in a hidden folder named `.voicenotes` at the root of your workspace.

To collaborate with teammates:

1.  **Commit the `.voicenotes` folder** to your version control system (e.g., Git).
    - _Note: Ensure your `.gitignore` does NOT exclude this folder._
2.  When your teammates pull the changes, they will have the audio files.
3.  If they have this extension installed, they can play your voice notes directly!

## 🛠️ Requirements

- **OS**: Windows (currently relies on PowerShell and Windows Audio APIs).
- **VS Code**: Version 1.84.0 or higher.

## 📦 Deployment (For Developers)

To package this extension for distribution:

1.  Install `vsce` (Visual Studio Code Extensions) globally:
    ```bash
    npm install -g @vscode/vsce
    ```
2.  Run the package command in the extension directory:
    ```bash
    vsce package
    ```
3.  This will create a `.vsix` file that can be shared and installed.

## 📝 License

MIT License. See [LICENSE](LICENSE) for details.
