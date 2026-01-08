# Repomix Runner Plus <img valign="middle" alt="Repomix logo" width="40" src="assets/repomix-logo.png" />

You can support this project by giving a star on GitHub ! ⭐️ 🔭 🙏

[![GitHub](https://img.shields.io/github/stars/bramburn/repomix-runner?style=social)](https://github.com/bramburn/repomix-runner)
[![Version](https://img.shields.io/visual-studio-marketplace/v/bramburn.repomix-runner-plus)](https://marketplace.visualstudio.com/items?itemName=bramburn.repomix-runner-plus)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/bramburn.repomix-runner-plus)](https://marketplace.visualstudio.com/items?itemName=bramburn.repomix-runner-plus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<!-- [![Twitter](https://img.shields.io/twitter/follow/DorianMass49637
)](https://twitter.com/DorianMass49637) -->

Repomix Runner is a VSCode extension that allows you to easily bundle files into a single output for AI processing. It uses the great [Repomix](https://github.com/yamadashy/repomix) tool.

## ✨ Features

- 📁 Pack your selection of files into a single output for AI processing.
- 📦 Create reusable bundles for parts of your project you frequently package.
- 🎛️ **New Control Panel** for managing bundles and settings.
- 📎 **Cross-platform Copy Modes**: copy content text or file object (paste directly into other apps). Works on Windows, macOS, and Linux!
- 🗑️ Optional output file cleanup. -> But you still have it in clipboard! 😀
- 🛠️ Easy settings in vscode and/or support a repomix.config.json file.

## 📖 Usage

### 🎛️ Repomix Control Panel

Access the **Repomix Control Panel** from the Activity Bar (Repomix icon). It provides a comprehensive view of your bundles and allows you to run, edit, or delete them easily.

### 📂 Explorer View

With the **_REPOMIX_** custom view in the Explorer, all is in one place 🎉 :

(keep in mind the output-file is also in your clipboard).

#### ⬇️ - Run Repomix on selection

https://github.com/user-attachments/assets/21272ff9-0bf1-48dc-a583-34355bb35ced

<div align="center">
  <video src="https://massdo.github.io/repomix-runner/assets/run-on-selection.mp4" type="video/mp4" controls controlsList="nodownload" allowfullscreen>
    Your browser does not support the video tag.
  </video>
</div>

#### ⬇️ - Create a bundle with custom config

https://github.com/user-attachments/assets/134e7fdf-1e98-429f-b16c-a76e99dc761f

<div align="center">
  <video src="https://massdo.github.io/repomix-runner/assets/create-bundle.mp4" type="video/mp4" controls controlsList="nodownload" allowfullscreen>
    Your browser does not support the video tag.
  </video>
</div>

## ⚙️ Commands

Open the palette with `Cmd+Shift+P` or `Ctrl+Shift+P` then:

- `Repomix Run` to run repomix on the root folder of your project
- `Repomix Run On Open Files` to run repomix on the open files in the workspace
- `Repomix Create New Bundle` to create a new bundle
- `Repomix Run Bundle` to select a bundle to run
- `Repomix Edit Bundle` to edit bundle name, config file, description and tags
- `Repomix Refresh Bundles` to refresh the bundles list if you mannually change the .repomix/bundles.json file
- `Repomix Settings` for a quick access to the settings
- `Repomix Output` to open the repomix output channel

## 🚀 Installation

1. Open VS Code
2. Press `Cmd+P` (macOS) or `Ctrl+P` (Windows/Linux)
3. Type `ext install bramburn.repomix-runner-plus`
4. Press Enter

## 🛠️ Configuration

- The extension support the repomix.config.json file in your project root folder, it will **_override_** the settings in the extension. Except for the runner settings.

## 📋 Clipboard Workflows

The extension supports clipboard operations in both **local** and **remote** development environments.

### Local Development

When working locally, the extension uses two clipboard modes (configurable in Settings):

| Mode         | Description                                                  |
|--------------|-------------------------------------------------------------|
| **File Object** | Copies the actual file to clipboard for drag-drop paste    |
| **Text Content** | Copies raw text content to clipboard                        |

- **File mode**: Uses OS-specific clipboard APIs (Windows binary, macOS AppleScript, Linux xclip)
- **Content mode**: Uses VS Code's clipboard API for text

### Remote Development (SSH)

When connected to a remote repository via SSH from a Windows client, the extension uses a **hybrid workflow**:

1. **Automatic Detection**: Extension detects SSH connection and Windows client
2. **File Transfer**:
   - Files are read from the remote server
   - Content is transferred to your Windows machine as base64-encoded data
   - Local `repomix-clipboard` binary copies files to clipboard
3. **Result**: File objects available for drag-drop paste on Windows

**Requirements for Remote Clipboard:**
- SSH connection to remote server
- Windows client (macOS/Linux support in development)
- `repomix-clipboard-win32-x64.exe` binary (included with extension)

#### Debugging Remote Clipboard

The **Debug tab** in the Control Panel displays environment information to verify remote detection:
- Local OS and architecture
- Remote connection type (ssh, wsl, dev-container)
- Whether local binary execution is active
- Binary path and availability status

## 📋 Requirements

- VS Code 1.93.0 or higher
- Node.js and npm installed (for `npx`)
- **Windows**: Built-in support for file copy mode
- **macOS**: Built-in support for file copy mode
- **Linux**: Requires `xclip` installed for file copy mode

## ⚠️ Known Issues

- File copy mode on Linux requires `xclip` to be installed.
- MAC and Linux support only content copy mode for now. 

## 🤝 Contributing

Any feedback, issue or feature request is much appreciated !

## 📝 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

---
