# How to Open Webview Developer Tools 🔧

## Quick Steps

### Method 1: Command Palette (Recommended)
1. **Press F5** - Extension Development Host opens
2. **Open the visualization** - Click "Visualize Kustomize Overlay" in tree view
3. **Select an overlay** - Choose client-a/prod for example
4. **Open Dev Tools**:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type: `Developer: Open Webview Developer Tools`
   - Press Enter
5. A Chrome DevTools window opens showing the webview console

### Method 2: Right-Click (Alternative)
1. Open the visualization
2. **Right-click anywhere on the webview panel**
3. Select **"Inspect Element"** from context menu
4. DevTools opens

---

## What You Should See

### In the DevTools Console:
When you click "Export PNG", you'll see:
```
Capturing diagram: { width: 1200, height: 3456, scrollWidth: 1200, scrollHeight: 3456 }
Canvas created: { width: 2400, height: 6912 }
```

This tells us:
- **width/height**: Visible size of diagram
- **scrollWidth/scrollHeight**: Full size including scrollable area
- **Canvas dimensions**: 2x scale for high quality

---

## Troubleshooting

### Issue: "Open Webview Developer Tools" not found
**Solution**: Make sure you're in the Extension Development Host window, not the original VS Code window

### Issue: Console is empty
**Solution**: 
1. Make sure an overlay is selected
2. Click the "Export PNG" button
3. Logs only appear when export is triggered

### Issue: Can't right-click on webview
**Solution**: Try the Command Palette method instead (Method 1)

---

## What to Look For

### If Export is Working:
```javascript
Capturing diagram: { width: 1200, height: 3456 }
Canvas created: { width: 2400, height: 6912 }
// No errors
```

### If Export Fails:
```javascript
Capturing diagram: { width: 1200, height: 800 }  // Height too small!
Canvas created: { width: 2400, height: 1600 }
// OR error messages
```

### Common Errors:
- `html2canvas is not defined` - CDN didn't load
- `Cannot read property of undefined` - Element selection issue
- Height is much smaller than expected - Layout issue

---

## After Opening DevTools

1. **Click "Export PNG"** button in the visualization
2. **Watch the Console tab** in DevTools
3. **Look for the log messages** I added
4. **Check for any red errors**
5. **Take a screenshot** if you see something unexpected

Then let me know what you see! 📸
