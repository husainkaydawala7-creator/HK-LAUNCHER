# Contributing to HK Launcher

Thank you for your interest in contributing to **HK Launcher**! We welcome bug reports, feature requests, documentation improvements, and pull requests from the community.

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone. Please be respectful and constructive in all interactions.

## How to Contribute

### Reporting Bugs
Before creating an issue, please check whether the issue has already been reported:
1. Search the [GitHub Issues](https://github.com/husainkaydawala7-creator/HK-Launcher/issues) tab.
2. If not found, open a new issue detailing:
   - Your operating system and version.
   - Installed Java versions (`java -version`).
   - Steps to reproduce the problem.
   - Expected vs. actual behavior.
   - Relevant error logs (with sensitive personal information removed).

### Suggesting Enhancements
Feature requests are welcomed! Open an issue describing:
- The problem you want solved or the feature you envision.
- Why this would benefit HK Launcher users.
- Potential implementation ideas or alternatives considered.

### Pull Requests

1. **Fork the Repository**:
   Click the "Fork" button on GitHub to create your own copy of the repository.

2. **Clone Your Fork**:
   ```bash
   git clone https://github.com/<your-username>/HK-Launcher.git
   cd HK-Launcher
   ```

3. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Install Dependencies**:
   ```bash
   npm install
   ```

5. **Make Your Changes**:
   - Follow the existing project structure and coding style.
   - Adhere to Electron security best practices:
     - Keep filesystem and child process operations in the Electron main process.
     - Never expose Node.js APIs directly to renderer scripts.
     - Communicate strictly via typed IPC channels defined in `launcher-app/preload.js`.
     - Validate input on both ends of IPC channels.

6. **Verify and Test**:
   ```bash
   npm run check
   npm start
   ```

7. **Commit Your Changes**:
   Write clear, concise commit messages:
   ```bash
   git commit -m "Add feature: dynamic Java runtime scanner"
   ```

8. **Push to Your Fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

9. **Submit a Pull Request**:
   Open a PR against the `main` branch of the official HK Launcher repository. Include a clear description of the problem solved and changes made.

## Development Guidelines

- **License**: All contributions are accepted under the Apache License 2.0.
- **Security**: Never commit personal account tokens, client secrets, or private keys.
- **Modularity**: Place new services and logic in `launcher-app/services/` with clean exports in `index.js`.
