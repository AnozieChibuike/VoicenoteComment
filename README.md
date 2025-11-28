# 🎙️ Voice Note Comment for VS Code

**Voice Note Comment** is a powerful VS Code extension that allows you to record, attach, and play voice notes directly within your code comments. It's perfect for explaining complex logic, leaving feedback for code reviews, or just leaving reminders for your future self.

## 🆕 What's New in Version 1.1.0

- **👤 Author Identity**: Set your unique author name (e.g., `@DevLead`) to tag every voice note you create.
- **📝 Text & Voice**: Add an optional text comment alongside your audio for better context.
- **🗑️ Smart Deletion**: Deleting a voice note now automatically cleans up its associated text comment.
- **👀 Enhanced Explorer**: The Voice Notes view now displays the author of each note.
- **⏯️ Better Playback**: Improved Play, Pause, and Stop controls for a smoother listening experience.

## ✨ Features

- **Record Audio**: Quickly record voice notes using a simple interface.
- **Cloud & Local Storage**: Choose to store your voice notes locally in your project or upload them to **Cloudinary** to keep your repo light.
- **Author Attribution**: Automatically tag your voice notes with your name (e.g., `@JohnDoe`).
- **Text & Voice**: Add an optional text comment alongside your voice note for extra context.
- **Inline Playback**: Play, Pause, and Stop audio directly from the code editor using CodeLens controls.
- **Smart Caching**: Online audio files are cached locally for instant playback.
- **Explorer View**: Manage all your voice notes in a dedicated "Voice Notes" explorer view.
- **Seamless Integration**: Inserts a clean comment with metadata directly into your code.

## 🚀 Getting Started

### Installation

1.  Install the extension from the VS Code Marketplace.
2.  (Optional) Configure Cloudinary if you want cloud storage.

### Usage

#### 1. Recording a Voice Note

1.  Open a file (JavaScript, Python, etc.).
2.  Place your cursor where you want the note.
3.  Press `Alt + V` (or run command `VoiceNote: Start Recording Comment`).
4.  If it's your first time, you'll be asked to set your **Author Name**.
5.  A recorder panel will open. Click **Record**.
6.  (Optional) Type a text comment in the input box.
7.  When finished, click **Stop & Insert**.
8.  The extension will insert a comment like:
    ```javascript
    // 🎙️ Voice Note (00:05) [id:a1b2c3d4] by @JohnDoe
    // This explains the complex logic below...
    ```

#### 2. Playing Audio

- Look above the comment line. You will see **Play**, **Delete**, and other controls.
- Click **Play** to listen.
- While playing, you can click **Pause** or **Stop**.

#### 3. Managing Notes

- Open the **Voice Notes** view in the Activity Bar (Mic icon) or Explorer.
- **Switch Storage**: Click the database icon in the title bar to toggle between **Local** and **Cloudinary**.
- **Delete**: Click the trash icon to remove a note and its audio file.

## ☁️ Cloudinary Configuration (Optional)

To save space in your repository, you can configure Cloudinary to host your voice notes.

1.  Get your Cloud Name, API Key, and API Secret from [Cloudinary](https://cloudinary.com/).
2.  In VS Code, open the Command Palette (`Ctrl+Shift+P`) and run `VoiceNote: Configure Cloudinary`.
3.  Enter your credentials in the settings.
4.  Switch your storage method to **Cloudinary** using the database icon in the Voice Notes view.

## 🤝 Collaboration

**Can this tool be used for collabs? YES!**

- **Local Storage**: Audio files are saved in `.voicenotes`. Commit this folder to Git to share notes.
- **Cloud Storage**: Audio files are hosted online. Just commit the code comments, and your teammates can play them instantly (cached locally on first play).

## 🛠️ Requirements

- **OS**: Windows (currently relies on PowerShell and Windows Audio APIs).
- **VS Code**: Version 1.84.0 or higher.

## 📝 License

MIT License. See [LICENSE](LICENSE) for details.
