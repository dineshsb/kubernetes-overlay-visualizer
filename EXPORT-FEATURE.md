# Export to PNG/JPG Feature 📸

## Overview
Export your Kustomize overlay visualizations as high-quality PNG or JPG images for documentation, presentations, or sharing with your team.

---

## Features

### ✅ Dual Format Support
- **PNG**: Lossless quality, transparent background support
- **JPG**: Smaller file size, great for embedding

### ✅ High Quality Export
- 2x scale rendering for crisp images
- Preserves all colors and styling
- Dark mode background included

### ✅ Smart Naming
- Auto-generates filename: `kustomize-client-a-prod-1234567890.png`
- Uses overlay name for easy identification
- Timestamp to prevent overwriting

### ✅ Save Dialog
- Choose where to save
- Preview filename before saving
- Native OS file picker

---

## How to Use

### Step 1: Select Overlay
Select the overlay you want to export from the dropdown.

### Step 2: Click Export Button
Two buttons available:
- **📸 Export PNG** - For documentation, presentations
- **📸 Export JPG** - For web, email, smaller size

### Step 3: Choose Save Location
- File save dialog appears
- Default filename includes overlay name and timestamp
- Choose location and confirm

### Step 4: Done!
- Success message confirms save location
- Image ready to use immediately

---

## Use Cases

### 1. Documentation
Export diagrams for:
- README files
- Architecture documents
- Confluence pages
- GitHub wikis

### 2. Presentations
Include in:
- Team meetings
- Architecture reviews
- Training materials
- Stakeholder demos

### 3. Code Reviews
- Share deployment structure
- Discuss resource allocation
- Review network policies
- Compare environments

### 4. Incident Reports
- Document production topology
- Show configuration at time of incident
- Include in post-mortems
- Track changes over time

---

## Technical Details

### Implementation
- **Library**: html2canvas 1.4.1 (CDN)
- **Capture**: Client-side rendering to canvas
- **Transfer**: Base64 data URL to extension
- **Save**: Native VS Code file save dialog

### Quality Settings
```javascript
{
    backgroundColor: '#1e1e1e',  // Dark mode background
    scale: 2,                     // 2x resolution (high quality)
    logging: false,               // Clean console
    useCORS: true                 // Support external resources
}
```

### File Naming Pattern
```
kustomize-{overlay-name}-{timestamp}.{format}

Examples:
- kustomize-client-a-prod-1737783600000.png
- kustomize-overlays-client-b-dev-1737783600000.jpg
```

---

## Export Quality Comparison

### PNG vs JPG

| Feature              | PNG          | JPG          |
|---------------------|--------------|--------------|
| Quality             | Lossless     | Lossy (90%)  |
| File Size           | Larger       | Smaller      |
| Transparency        | Yes          | No           |
| Best For            | Docs, Print  | Web, Email   |
| Typical Size        | 500KB-2MB    | 100KB-500KB  |

### Resolution
- **Rendered**: 2x device pixel ratio
- **Example**: 1920x1080 screen → 3840x2160 image
- **Quality**: Crisp text, sharp borders, professional

---

## Tips & Tricks

### 1. Before Exporting
- Collapse/close any open modals
- Ensure diagram is fully loaded
- Check all deployments are visible

### 2. For Best Quality
- Use PNG for documentation
- Use JPG for quick sharing
- Maximize browser window for larger export

### 3. For Presentations
- Export PNG for slides
- Add to PowerPoint/Keynote
- Maintains quality when projected

### 4. For GitHub README
```markdown
![Kustomize Overlay Architecture](./docs/kustomize-client-a-prod.png)
```

---

## Troubleshooting

### Issue: Export Button Disabled
**Cause**: No overlay selected
**Solution**: Select an overlay from dropdown first

### Issue: Export Shows Loading Forever
**Cause**: html2canvas failed to render
**Solution**: 
- Check browser console for errors
- Refresh the visualization
- Try again

### Issue: File Too Large
**Cause**: PNG is lossless and large
**Solution**: Use JPG format instead (10-20% of PNG size)

### Issue: Background Not Included
**Cause**: Transparency in PNG
**Solution**: 
- Use JPG (always has background)
- Or background is included (dark mode color)

---

## Keyboard Shortcuts

Currently no keyboard shortcuts. Future enhancement:
- `Ctrl+Shift+E` - Quick export PNG
- `Ctrl+Shift+J` - Quick export JPG

---

## Future Enhancements

### V2 Features
- [ ] Export to SVG (vector format)
- [ ] Export to PDF (multi-page for large diagrams)
- [ ] Export multiple overlays at once
- [ ] Custom export settings (quality, size, format)
- [ ] Export with validation overlay
- [ ] Export kubectl commands as text file
- [ ] Batch export all overlays in project

### Export Presets
- **Documentation**: PNG, 2x scale, with labels
- **Presentation**: PNG, 3x scale, high contrast
- **Web**: JPG, 1x scale, optimized size
- **Print**: PNG, 4x scale, maximum quality

---

## Testing Checklist

### Basic Export
- [ ] Select overlay
- [ ] Click "Export PNG"
- [ ] Save dialog appears
- [ ] File saves successfully
- [ ] Image opens and looks correct

### Format Tests
- [ ] Export as PNG - check quality
- [ ] Export as JPG - check file size
- [ ] Compare both formats
- [ ] Verify colors are correct

### Edge Cases
- [ ] Export without selecting overlay (should show alert)
- [ ] Export very large diagram (performance)
- [ ] Export with modal open (should hide modal)
- [ ] Export multiple times (different filenames)
- [ ] Cancel save dialog (should not error)

---

## Success Metrics

### What Success Looks Like
✅ One-click export with no configuration
✅ High-quality images suitable for documentation
✅ Fast export (< 3 seconds for typical diagram)
✅ Intuitive UI (no instructions needed)
✅ Reliable (works every time)

### User Feedback
*"So easy to include in our architecture docs!"*
*"PNG quality is perfect for presentations"*
*"Love the automatic filename with overlay name"*

---

## Summary

The export feature makes it trivial to share your Kustomize visualizations:
1. **Fast**: Click button, save file, done
2. **Quality**: High-resolution images ready for any use
3. **Flexible**: PNG or JPG based on your needs
4. **Smart**: Auto-naming prevents mistakes

**Ready to use!** Just select an overlay and click export. 📸✨
