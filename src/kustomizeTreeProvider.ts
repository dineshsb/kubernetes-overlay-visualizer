import * as vscode from 'vscode';
import * as path from 'path';
import { KustomizeParser, KustomizeProject, KustomizeConfig } from './kustomizeParser';

export class KustomizeTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private parser: KustomizeParser) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            // Root level - show all projects
            const projects = await this.parser.findKustomizeProjects();
            return projects.map(project => new ProjectTreeItem(project));
        }

        if (element instanceof ProjectTreeItem) {
            const items: TreeItem[] = [];
            
            if (element.project.base) {
                items.push(new ConfigTreeItem(element.project.base, 'base'));
            }

            if (element.project.overlays.length > 0) {
                items.push(new OverlaysFolderTreeItem(element.project.overlays));
            }

            return items;
        }

        if (element instanceof OverlaysFolderTreeItem) {
            return element.overlays.map(overlay => new ConfigTreeItem(overlay, 'overlay'));
        }

        if (element instanceof ConfigTreeItem) {
            const items: TreeItem[] = [];

            if (element.config.resources.length > 0) {
                items.push(new ResourcesFolderTreeItem(element.config.resources));
            }

            if (element.config.patches.length > 0) {
                items.push(new PatchesFolderTreeItem(element.config.patches));
            }

            return items;
        }

        if (element instanceof ResourcesFolderTreeItem) {
            return element.resources.map(resource => new ResourceTreeItem(resource));
        }

        if (element instanceof PatchesFolderTreeItem) {
            return element.patches.map(patch => new PatchTreeItem(patch));
        }

        return [];
    }
}

class TreeItem extends vscode.TreeItem {}

class ProjectTreeItem extends TreeItem {
    constructor(public project: KustomizeProject) {
        super(project.name, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('folder-opened');
        this.contextValue = 'project';
    }
}

class ConfigTreeItem extends TreeItem {
    constructor(public config: KustomizeConfig, private type: 'base' | 'overlay') {
        const label = path.basename(path.dirname(config.path));
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        
        this.description = type === 'base' ? '(base)' : '(overlay)';
        this.iconPath = new vscode.ThemeIcon(type === 'base' ? 'package' : 'layers');
        this.contextValue = type;
        this.resourceUri = vscode.Uri.file(config.path);
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [this.resourceUri]
        };
    }
}

class OverlaysFolderTreeItem extends TreeItem {
    constructor(public overlays: KustomizeConfig[]) {
        super('Overlays', vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('layers');
        this.contextValue = 'overlays-folder';
    }
}

class ResourcesFolderTreeItem extends TreeItem {
    constructor(public resources: string[]) {
        super(`Resources (${resources.length})`, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.contextValue = 'resources-folder';
    }
}

class PatchesFolderTreeItem extends TreeItem {
    constructor(public patches: string[]) {
        super(`Patches (${patches.length})`, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('diff');
        this.contextValue = 'patches-folder';
    }
}

class ResourceTreeItem extends TreeItem {
    constructor(resource: string) {
        super(resource, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('file');
        this.contextValue = 'resource';
    }
}

class PatchTreeItem extends TreeItem {
    constructor(patch: string) {
        super(patch, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('diff-modified');
        this.contextValue = 'patch';
    }
}
