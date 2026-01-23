import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export interface KustomizeProject {
    name: string;
    rootPath: string;
    base?: KustomizeConfig;
    overlays: KustomizeConfig[];
}

export interface KustomizeConfig {
    path: string;
    fileName: string;
    content: any;
    resources: string[];
    patches: string[];
    bases: string[];
}

export class KustomizeParser {
    async findKustomizeProjects(): Promise<KustomizeProject[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        const projects: KustomizeProject[] = [];

        for (const folder of workspaceFolders) {
            const kustomizationFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folder, '**/kustomization.{yaml,yml}'),
                '**/node_modules/**'
            );

            const projectMap = new Map<string, KustomizeProject>();

            for (const file of kustomizationFiles) {
                const config = await this.parseKustomizationFile(file.fsPath);
                if (!config) {
                    continue;
                }

                const dirPath = path.dirname(file.fsPath);
                const relativePath = path.relative(folder.uri.fsPath, dirPath);
                
                // Determine if this is a base or overlay
                const parts = relativePath.split(path.sep);
                
                // Try to find project root
                let projectRoot = folder.uri.fsPath;
                let projectName = folder.name;

                if (parts.includes('overlays') || parts.includes('overlay')) {
                    // This is an overlay
                    const overlayIndex = parts.findIndex(p => p === 'overlays' || p === 'overlay');
                    projectRoot = path.join(folder.uri.fsPath, ...parts.slice(0, overlayIndex));
                    projectName = parts[overlayIndex - 1] || folder.name;
                } else if (parts.includes('base')) {
                    // This is a base
                    const baseIndex = parts.findIndex(p => p === 'base');
                    projectRoot = path.join(folder.uri.fsPath, ...parts.slice(0, baseIndex));
                    projectName = parts[baseIndex - 1] || folder.name;
                }

                if (!projectMap.has(projectRoot)) {
                    projectMap.set(projectRoot, {
                        name: projectName,
                        rootPath: projectRoot,
                        overlays: []
                    });
                }

                const project = projectMap.get(projectRoot)!;

                if (parts.includes('base')) {
                    project.base = config;
                } else if (parts.includes('overlays') || parts.includes('overlay')) {
                    project.overlays.push(config);
                } else {
                    // Standalone kustomization
                    if (!project.base) {
                        project.base = config;
                    }
                }
            }

            projects.push(...Array.from(projectMap.values()));
        }

        return projects;
    }

    async parseKustomizationFile(filePath: string): Promise<KustomizeConfig | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = yaml.load(content) as any;

            return {
                path: filePath,
                fileName: path.basename(filePath),
                content: parsed,
                resources: parsed.resources || [],
                patches: parsed.patches || parsed.patchesStrategicMerge || [],
                bases: parsed.bases || parsed.resources?.filter((r: string) => r.includes('..')) || []
            };
        } catch (error) {
            console.error(`Error parsing ${filePath}:`, error);
            return null;
        }
    }
}
