# Kubernetes Overlay Visualizer

A VS Code extension that visualizes Kustomize overlay structures, making it easy to understand how your base configurations and overlays are organized.

## Key Features

**Multi-View Scalability**
 - Toggle between "Compact Grid" and "List + Detail" views
 - Show how it handles 10+ deployments elegantly
 - Expand/collapse cards in Compact view
 - Select deployments in List view

<img width="824" height="468" alt="image" src="https://github.com/user-attachments/assets/5e8b1f9d-f1b1-494f-bd9b-adc1f10e96e6" />
<img width="806" height="354" alt="image" src="https://github.com/user-attachments/assets/145360a0-f144-4bfe-a274-0a1e91d50db5" />
<img width="800" height="448" alt="image" src="https://github.com/user-attachments/assets/6cadd66e-8f48-4572-8402-30f1efb32c0a" />


**Validation Layer**
 - Show error/warning badges on deployments
 - Click "View All Issues" to see validation report
 - Demonstrate "Fix" button opening YAML file in editor

<img width="832" height="394" alt="image" src="https://github.com/user-attachments/assets/288d4e79-476b-43e6-a64d-ff2b238ecbb2" />

**Interactive Features**
 - Click deployment to view full YAML content
 - Click "Edit Deployment" to jump to source file
 - Copy kubectl commands with one click
 - File watcher: Edit YAML → auto-refresh diagram

<img width="864" height="440" alt="image" src="https://github.com/user-attachments/assets/55ebe67f-2d06-4ce8-94fd-fecd606f39fa" />
<img width="810" height="502" alt="image" src="https://github.com/user-attachments/assets/37865f39-2222-466e-a3ce-dff87f379cea" />

**Export & Share**
 - Export diagram to PNG/JPG
 - Show network policies visualization
 - Show environment variables organized by tier

<img width="818" height="94" alt="image" src="https://github.com/user-attachments/assets/160d77e8-2f3e-49e6-99f6-35c3dffa2919" />
<img width="732" height="428" alt="image" src="https://github.com/user-attachments/assets/4c603822-cbb9-46f0-93ce-adec12799358" />
<img width="812" height="148" alt="image" src="https://github.com/user-attachments/assets/45f2d324-9afa-4006-bf40-5cf6c222864f" />

## Usage

1. Open a workspace containing Kustomize projects
2. The extension automatically detects `kustomization.yaml` files
3. View the "Kustomize Overlays" tree view in the Explorer sidebar
4. Click on any item to open the file
5. Use "Visualize Kustomize Overlays" command for a graphical view

## Commands

- `Kustomize: Visualize Kustomize Overlays` - Opens a webview with visualization
- `Kustomize: Refresh Visualization` - Refreshes the tree view

## Requirements

- VS Code 1.85.0 or higher
- Kustomize projects with `kustomization.yaml` files

## Extension Structure

The extension expects Kustomize projects to follow common patterns:
- `base/` directory for base configurations
- `overlays/` or `overlay/` directory for environment-specific overlays

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run compile
```

### Debug

Press F5 to launch the extension in a new VS Code window.

## License

MIT
