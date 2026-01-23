# Testing the Extension

## Quick Start

### 1. Install Dependencies
Already done! But if you need to:
```bash
npm install
```

### 2. Compile the Extension
```bash
npm run compile
```

### 3. Run the Extension in Development Mode

**Option A: Using VS Code UI**
1. Open this folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. A new VS Code window will open with the extension loaded

**Option B: Using Command Palette**
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Debug: Start Debugging"
3. Select "Run Extension"

### 4. Test with Demo Project

In the Extension Development Host window:
1. Open the `demo-kustomize` folder from this project
2. You should see "Kustomize Overlays" in the Explorer sidebar
3. Expand it to see the project structure:
   - **agent-testing** (project)
     - **base** (base configuration)
       - Resources (2): deployment.yaml, service.yaml
     - **Overlays** (folder)
       - **dev** (overlay)
       - **prod** (overlay)

### 5. Try Commands

**Visualize Overlays:**
1. Press `Ctrl+Shift+P`
2. Type "Kustomize: Visualize"
3. Select "Kustomize: Visualize Kustomize Overlays"
4. A webview panel will open showing the visualization

**Refresh View:**
1. Click the refresh icon in the tree view header
2. Or use command palette: "Kustomize: Refresh Visualization"

## Features to Test

- [ ] Tree view displays in Explorer sidebar
- [ ] Base configuration shows with package icon
- [ ] Overlays show under "Overlays" folder with layers icon
- [ ] Click on base/overlay opens the kustomization.yaml file
- [ ] Resources and patches are listed under each config
- [ ] Webview visualization opens with command
- [ ] Refresh button works

## Troubleshooting

**Extension doesn't activate:**
- Check Output panel: View > Output > Select "Kubernetes Overlay Visualizer"
- Verify kustomization.yaml files exist in workspace

**Tree view is empty:**
- Ensure you opened the demo-kustomize folder as a workspace
- Try the refresh command
- Check that kustomization.yaml files are present

**Compilation errors:**
- Run `npm install` to ensure all dependencies are installed
- Check for TypeScript errors: `npm run compile`

## Next Steps

1. Try with your own Kustomize projects
2. Report issues or suggest features
3. Contribute improvements!
