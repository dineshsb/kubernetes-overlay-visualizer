# Quick Start Guide - Testing the Extension

## Step 1: Open the Extension Project in VS Code

```bash
code .
```

Or manually:
- Open VS Code
- File → Open Folder
- Select: `C:\Users\Dinesh Bhaniga\agent-testing`

## Step 2: Launch the Extension Development Host

**Option A: Press F5**
- Simply press `F5` key
- This will compile and launch a new VS Code window with the extension loaded

**Option B: Use the Debug Menu**
1. Click the Run/Debug icon in the sidebar (or press `Ctrl+Shift+D`)
2. Select "Run Extension" from the dropdown at the top
3. Click the green play button

**Option C: Command Palette**
1. Press `Ctrl+Shift+P`
2. Type "Debug: Start Debugging"
3. Press Enter

## Step 3: Open Demo Project in the Extension Development Host

A new VS Code window will open (titled "[Extension Development Host]")

In this new window:
1. File → Open Folder
2. Navigate to: `C:\Users\Dinesh Bhaniga\agent-testing\demo-kustomize`
3. Click "Select Folder"

## Step 4: View the Kustomize Overlay Visualization

Once the demo-kustomize folder is open, you should see:

### In the Explorer Sidebar:
- Look for "**Kustomize Overlays**" view (below the file explorer)
- You should see the 3-tier hierarchy:
  ```
  📁 agent-testing
    📦 base (base)
      📄 Resources (3)
    📁 Overlays
      📦 client-a (overlay)
        📄 Resources (1)
      📦 client-b (overlay)
        📄 Resources (1)
  ```

### Try the Commands:
1. Press `Ctrl+Shift+P`
2. Type "Kustomize"
3. Try these commands:
   - **Kustomize: Visualize Kustomize Overlays** - Opens webview
   - **Kustomize: Refresh Visualization** - Refreshes tree view

## Step 5: Explore the Features

### Click to Navigate
- Click on any item in the tree view to open its kustomization.yaml file

### Expand/Collapse
- Click arrows to expand/collapse sections
- See resources and patches for each configuration

### Webview Visualization
- Use the "Visualize Kustomize Overlays" command
- See a graphical representation of your overlay structure

## Troubleshooting

### Extension doesn't activate
- **Check**: Output panel → Select "Kubernetes Overlay Visualizer"
- **Fix**: Make sure kustomization.yaml files exist

### Tree view is empty
- **Check**: You opened the demo-kustomize folder (not the parent folder)
- **Fix**: Click the refresh icon in the tree view header

### Compilation errors before F5
```bash
# Run this in the terminal:
npm run compile
```

### No "Kustomize Overlays" view visible
- **Check**: Extension Host window has the demo folder open
- **Check**: Look in the Explorer sidebar (left panel)
- **Fix**: Try closing and reopening the folder

## What to Test

- [ ] Tree view appears in Explorer sidebar
- [ ] Base configuration shows
- [ ] Client-specific bases show (client-a, client-b)
- [ ] Environment overlays show (dev, prod)
- [ ] Clicking items opens files
- [ ] Resources show under each config
- [ ] Refresh button works
- [ ] Webview visualization opens
- [ ] Extension activates automatically

## Making Changes to the Extension

If you want to modify the extension code:

1. Make changes in the original window (not Extension Host)
2. Save your changes
3. In the Extension Host window: Press `Ctrl+Shift+F5` to reload
4. Or stop debugging and press `F5` again

## Next Steps

- Try with your own Kustomize projects
- Explore the 3-tier inheritance in the tree view
- Check how overlays inherit from client bases
- Test with different Kustomize structures
