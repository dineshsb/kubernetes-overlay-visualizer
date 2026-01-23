import * as vscode from 'vscode';
import { KustomizeTreeDataProvider } from './kustomizeTreeProvider';
import { KustomizeParser } from './kustomizeParser';

export function activate(context: vscode.ExtensionContext) {
    console.log('Kubernetes Overlay Visualizer is now active');

    const parser = new KustomizeParser();
    const treeDataProvider = new KustomizeTreeDataProvider(parser);

    // Register tree view
    const treeView = vscode.window.createTreeView('kustomizeOverlayView', {
        treeDataProvider: treeDataProvider
    });

    // Register commands
    const visualizeCommand = vscode.commands.registerCommand(
        'kustomize-visualizer.visualize',
        async () => {
            await showVisualization(parser);
        }
    );

    const refreshCommand = vscode.commands.registerCommand(
        'kustomize-visualizer.refresh',
        () => {
            treeDataProvider.refresh();
        }
    );

    context.subscriptions.push(treeView, visualizeCommand, refreshCommand);
}

async function showVisualization(parser: KustomizeParser) {
    const panel = vscode.window.createWebviewPanel(
        'kustomizeVisualization',
        'Kustomize Overlay Visualization',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

    const projects = await parser.findKustomizeProjects();
    panel.webview.html = getWebviewContent(projects);
}

function getWebviewContent(projects: any[]): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Kustomize Visualization</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
            }
            .project {
                margin-bottom: 30px;
                border: 1px solid var(--vscode-panel-border);
                padding: 15px;
                border-radius: 5px;
            }
            .project-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .overlay-tree {
                margin-left: 20px;
            }
            .node {
                margin: 5px 0;
                padding: 5px;
                cursor: pointer;
            }
            .node:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .base {
                color: var(--vscode-symbolIcon-classForeground);
                font-weight: bold;
            }
            .overlay {
                color: var(--vscode-symbolIcon-functionForeground);
            }
        </style>
    </head>
    <body>
        <h1>Kustomize Overlay Visualization</h1>
        ${projects.length === 0 ? '<p>No Kustomize projects found in workspace.</p>' : ''}
        ${projects.map(project => `
            <div class="project">
                <div class="project-title">${project.name}</div>
                <div class="overlay-tree">
                    ${renderTree(project)}
                </div>
            </div>
        `).join('')}
    </body>
    </html>`;
}

function renderTree(project: any): string {
    let html = '';
    if (project.base) {
        html += `<div class="node base">📦 Base: ${project.base.path}</div>`;
    }
    if (project.overlays && project.overlays.length > 0) {
        html += '<div class="overlay-tree">';
        project.overlays.forEach((overlay: any) => {
            html += `<div class="node overlay">📋 Overlay: ${overlay.path}</div>`;
        });
        html += '</div>';
    }
    return html;
}

export function deactivate() {}
