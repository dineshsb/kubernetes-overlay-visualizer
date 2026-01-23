# Kubernetes Overlay Visualizer

A VS Code extension that visualizes Kustomize overlay structures, making it easy to understand how your base configurations and overlays are organized.

## Features

- **Tree View**: Browse Kustomize projects in your workspace with a hierarchical tree view
- **Visual Overlay Structure**: See the relationship between base configurations and overlays
- **Quick Navigation**: Click on any item to open the corresponding file
- **Resource Tracking**: View resources and patches defined in each kustomization
- **Webview Visualization**: Generate a visual representation of your overlay structure

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
