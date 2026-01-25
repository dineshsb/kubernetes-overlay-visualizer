import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as k8s from '@kubernetes/client-node';

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

// View models for simplified rendering (converted from official k8s types)
export interface DeploymentInfo {
    k8sDeployment: k8s.V1Deployment;  // Original K8s object
    name: string;
    replicas: number;
    containers: ContainerInfo[];
    resources?: {
        limits?: { cpu?: string; memory?: string };
        requests?: { cpu?: string; memory?: string };
    };
    filePath?: string;  // Path to YAML file for navigation
}

export interface ContainerInfo {
    name: string;
    type: 'main' | 'sidecar';
    icon: string;
    purpose?: string;
    resources?: {
        limits?: { cpu?: string; memory?: string };
        requests?: { cpu?: string; memory?: string };
    };
    image?: string;  // Container image
}

export interface ConfigMapInfo {
    k8sConfigMap?: k8s.V1ConfigMap;  // Original K8s object
    name: string;
    data: { [key: string]: string };
    filePath?: string;  // Path to YAML file
}

export interface NetworkPolicyInfo {
    k8sNetworkPolicy: k8s.V1NetworkPolicy;  // Original K8s object
    name: string;
    ingress: NetworkRule[];
    egress: NetworkRule[];
    filePath?: string;  // Path to YAML file
}

export interface NetworkRule {
    description: string;
    ports?: { protocol: string; port: number }[];
    from?: { ipBlock?: string }[];
    to?: { ipBlock?: string }[];
}

export interface ServiceInfo {
    k8sService: k8s.V1Service;  // Original K8s object
    name: string;
    type: string;
    ports: { name?: string; port: number; targetPort: number | string; protocol: string }[];
    filePath?: string;  // Path to YAML file
}

// Validation result
export interface ValidationIssue {
    severity: 'error' | 'warning' | 'info';
    resource: string;
    message: string;
    filePath?: string;
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

    /**
     * Parse deployment files to extract workload information
     */
    async parseDeployments(kustomizePath: string): Promise<DeploymentInfo[]> {
        const deployments: DeploymentInfo[] = [];
        const dirPath = path.dirname(kustomizePath);
        
        try {
            const config = await this.parseKustomizationFile(kustomizePath);
            if (!config) {
                return deployments;
            }

            // Get all deployment resources (from current and base paths)
            const allResources = await this.collectAllResources(kustomizePath, config);
            
            for (const resource of allResources) {
                const resourcePath = path.isAbsolute(resource) ? resource : path.join(dirPath, resource);
                
                if (!fs.existsSync(resourcePath)) {
                    continue;
                }

                const deployment = await this.parseDeploymentFile(resourcePath);
                if (deployment) {
                    deployments.push(deployment);
                }
            }

            // Apply replica patches if specified
            if (config.content.replicas) {
                for (const replicaSpec of config.content.replicas) {
                    const deployment = deployments.find(d => d.name === replicaSpec.name);
                    if (deployment) {
                        deployment.replicas = replicaSpec.count;
                    }
                }
            }

            // Apply patches
            const patches = config.content.patches || config.content.patchesStrategicMerge || [];
            for (const patchPath of patches) {
                const fullPatchPath = path.join(dirPath, patchPath);
                if (fs.existsSync(fullPatchPath)) {
                    await this.applyPatch(deployments, fullPatchPath);
                }
            }

        } catch (error) {
            console.error(`Error parsing deployments from ${kustomizePath}:`, error);
        }

        return deployments;
    }

    /**
     * Collect all resources including from base paths
     */
    private async collectAllResources(kustomizePath: string, config: KustomizeConfig): Promise<string[]> {
        const resources: string[] = [];
        const dirPath = path.dirname(kustomizePath);

        // Add current resources
        resources.push(...config.resources.filter(r => !r.includes('..')));

        // Recursively collect from bases
        const bases = config.content.bases || config.resources?.filter((r: string) => r.includes('..')) || [];
        for (const base of bases) {
            const basePath = path.join(dirPath, base, 'kustomization.yaml');
            if (fs.existsSync(basePath)) {
                const baseConfig = await this.parseKustomizationFile(basePath);
                if (baseConfig) {
                    const baseResources = await this.collectAllResources(basePath, baseConfig);
                    resources.push(...baseResources.map(r => path.join(base, r)));
                }
            }
        }

        return resources;
    }

    /**
     * Parse a single deployment YAML file using official Kubernetes types
     */
    private async parseDeploymentFile(filePath: string): Promise<DeploymentInfo | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const docs = yaml.loadAll(content);

            for (const doc of docs) {
                if (doc && typeof doc === 'object' && 'kind' in doc && doc.kind === 'Deployment') {
                    // Cast to official Kubernetes Deployment type
                    const k8sDeployment = doc as k8s.V1Deployment;
                    
                    // Extract containers with type safety
                    const k8sContainers = k8sDeployment.spec?.template?.spec?.containers || [];
                    const containers = k8sContainers.map((container, index) => {
                        const isSidecar = index > 0 || this.isSidecarContainer(container.name || '');
                        return {
                            name: container.name || 'unnamed',
                            type: isSidecar ? 'sidecar' : 'main',
                            icon: this.getContainerIcon(container.name || ''),
                            purpose: isSidecar ? this.getContainerPurpose(container.name || '') : undefined,
                            image: container.image,  // Include image for validation
                            resources: container.resources ? {
                                limits: {
                                    cpu: container.resources.limits?.cpu,
                                    memory: container.resources.limits?.memory
                                },
                                requests: {
                                    cpu: container.resources.requests?.cpu,
                                    memory: container.resources.requests?.memory
                                }
                            } : undefined
                        } as ContainerInfo;
                    });

                    // Build view model from K8s types
                    return {
                        k8sDeployment: k8sDeployment,
                        name: k8sDeployment.metadata?.name || path.basename(filePath, path.extname(filePath)),
                        replicas: k8sDeployment.spec?.replicas || 1,
                        containers,
                        filePath: filePath,  // Store file path for navigation
                        resources: k8sContainers[0]?.resources ? {
                            limits: {
                                cpu: k8sContainers[0].resources.limits?.cpu,
                                memory: k8sContainers[0].resources.limits?.memory
                            },
                            requests: {
                                cpu: k8sContainers[0].resources.requests?.cpu,
                                memory: k8sContainers[0].resources.requests?.memory
                            }
                        } : undefined
                    };
                }
            }
        } catch (error) {
            console.error(`Error parsing deployment file ${filePath}:`, error);
        }

        return null;
    }

    /**
     * Apply patches to deployments using official types
     */
    private async applyPatch(deployments: DeploymentInfo[], patchPath: string): Promise<void> {
        try {
            const content = fs.readFileSync(patchPath, 'utf8');
            const patchDoc = yaml.load(content);

            if (patchDoc && typeof patchDoc === 'object' && 'kind' in patchDoc && patchDoc.kind === 'Deployment') {
                const patch = patchDoc as k8s.V1Deployment;
                const targetName = patch.metadata?.name;
                const deployment = deployments.find(d => d.name === targetName || d.name.endsWith(targetName || ''));
                
                if (deployment) {
                    // Apply replica patch
                    if (patch.spec?.replicas !== undefined) {
                        deployment.replicas = patch.spec.replicas;
                        if (deployment.k8sDeployment.spec) {
                            deployment.k8sDeployment.spec.replicas = patch.spec.replicas;
                        }
                    }
                    
                    // Apply resource patches
                    const patchContainers = patch.spec?.template?.spec?.containers || [];
                    for (const patchContainer of patchContainers) {
                        const container = deployment.containers.find(c => c.name === patchContainer.name);
                        if (container && patchContainer.resources) {
                            container.resources = {
                                limits: {
                                    cpu: patchContainer.resources.limits?.cpu,
                                    memory: patchContainer.resources.limits?.memory
                                },
                                requests: {
                                    cpu: patchContainer.resources.requests?.cpu,
                                    memory: patchContainer.resources.requests?.memory
                                }
                            };
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error applying patch ${patchPath}:`, error);
        }
    }

    /**
     * Parse ConfigMaps to extract environment variables
     */
    async parseConfigMaps(kustomizePath: string): Promise<ConfigMapInfo[]> {
        const configMaps: ConfigMapInfo[] = [];
        const dirPath = path.dirname(kustomizePath);
        
        try {
            const config = await this.parseKustomizationFile(kustomizePath);
            if (!config) {
                return configMaps;
            }

            // Get all configmap resources
            const allResources = await this.collectAllResources(kustomizePath, config);
            
            for (const resource of allResources) {
                const resourcePath = path.isAbsolute(resource) ? resource : path.join(dirPath, resource);
                
                if (!fs.existsSync(resourcePath)) {
                    continue;
                }

                const configMap = await this.parseConfigMapFile(resourcePath);
                if (configMap) {
                    configMaps.push(configMap);
                }
            }

            // Parse generated ConfigMaps from configMapGenerator
            const generators = config.content.configMapGenerator || [];
            for (const generator of generators) {
                if (generator.literals) {
                    const data: { [key: string]: string } = {};
                    generator.literals.forEach((literal: string) => {
                        const [key, ...valueParts] = literal.split('=');
                        data[key] = valueParts.join('=');
                    });
                    configMaps.push({
                        name: generator.name,
                        data
                    });
                }
            }

        } catch (error) {
            console.error(`Error parsing configmaps from ${kustomizePath}:`, error);
        }

        return configMaps;
    }

    /**
     * Parse a single ConfigMap YAML file using official Kubernetes types
     */
    private async parseConfigMapFile(filePath: string): Promise<ConfigMapInfo | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const docs = yaml.loadAll(content);

            for (const doc of docs) {
                if (doc && typeof doc === 'object' && 'kind' in doc && doc.kind === 'ConfigMap') {
                    const k8sConfigMap = doc as k8s.V1ConfigMap;
                    return {
                        k8sConfigMap: k8sConfigMap,
                        name: k8sConfigMap.metadata?.name || path.basename(filePath, path.extname(filePath)),
                        data: k8sConfigMap.data || {},
                        filePath: filePath
                    };
                }
            }
        } catch (error) {
            console.error(`Error parsing configmap file ${filePath}:`, error);
        }

        return null;
    }

    /**
     * Parse NetworkPolicies to extract network rules
     */
    async parseNetworkPolicies(kustomizePath: string): Promise<NetworkPolicyInfo[]> {
        const policies: NetworkPolicyInfo[] = [];
        const dirPath = path.dirname(kustomizePath);
        
        try {
            const config = await this.parseKustomizationFile(kustomizePath);
            if (!config) {
                return policies;
            }

            // Get all network policy resources
            const allResources = await this.collectAllResources(kustomizePath, config);
            
            for (const resource of allResources) {
                const resourcePath = path.isAbsolute(resource) ? resource : path.join(dirPath, resource);
                
                if (!fs.existsSync(resourcePath)) {
                    continue;
                }

                const policy = await this.parseNetworkPolicyFile(resourcePath);
                if (policy) {
                    policies.push(policy);
                }
            }

        } catch (error) {
            console.error(`Error parsing network policies from ${kustomizePath}:`, error);
        }

        return policies;
    }

    /**
     * Parse a single NetworkPolicy YAML file using official Kubernetes types
     */
    private async parseNetworkPolicyFile(filePath: string): Promise<NetworkPolicyInfo | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const docs = yaml.loadAll(content);

            for (const doc of docs) {
                if (doc && typeof doc === 'object' && 'kind' in doc && doc.kind === 'NetworkPolicy') {
                    const k8sNetworkPolicy = doc as k8s.V1NetworkPolicy;
                    const ingress: NetworkRule[] = [];
                    const egress: NetworkRule[] = [];

                    // Parse ingress rules with type safety
                    const ingressRules = k8sNetworkPolicy.spec?.ingress || [];
                    ingressRules.forEach((rule) => {
                        const ports = rule.ports || [];
                        const from = rule._from || [];  // Note: uses _from (from is reserved keyword)
                        
                        ingress.push({
                            description: this.formatNetworkRule('ingress', ports, from),
                            ports: ports.map((p) => ({
                                protocol: p.protocol || 'TCP',
                                port: (p.port as number) || 0
                            })),
                            from: from.map((f: k8s.V1NetworkPolicyPeer) => ({
                                ipBlock: f.ipBlock?.cidr
                            }))
                        });
                    });

                    // Parse egress rules with type safety
                    const egressRules = k8sNetworkPolicy.spec?.egress || [];
                    egressRules.forEach((rule) => {
                        const ports = rule.ports || [];
                        const to = rule.to || [];
                        
                        egress.push({
                            description: this.formatNetworkRule('egress', ports, to),
                            ports: ports.map((p) => ({
                                protocol: p.protocol || 'TCP',
                                port: (p.port as number) || 0
                            })),
                            to: to.map((t: k8s.V1NetworkPolicyPeer) => ({
                                ipBlock: t.ipBlock?.cidr
                            }))
                        });
                    });

                    return {
                        k8sNetworkPolicy: k8sNetworkPolicy,
                        name: k8sNetworkPolicy.metadata?.name || path.basename(filePath, path.extname(filePath)),
                        ingress,
                        egress,
                        filePath: filePath
                    };
                }
            }
        } catch (error) {
            console.error(`Error parsing network policy file ${filePath}:`, error);
        }

        return null;
    }

    /**
     * Format network rule for display
     */
    private formatNetworkRule(direction: 'ingress' | 'egress', ports: any[], targets: any[]): string {
        const portStr = ports.map((p: any) => p.port).join(',');
        const targetStr = targets
            .filter((t: any) => t.ipBlock)
            .map((t: any) => t.ipBlock.cidr)
            .join(', ');
        
        if (direction === 'ingress') {
            return `Port ${portStr} ← ${targetStr || 'Any'}`;
        } else {
            return `Port ${portStr} → ${targetStr || 'Any'}`;
        }
    }

    /**
     * Parse Services
     */
    async parseServices(kustomizePath: string): Promise<ServiceInfo[]> {
        const services: ServiceInfo[] = [];
        const dirPath = path.dirname(kustomizePath);
        
        try {
            const config = await this.parseKustomizationFile(kustomizePath);
            if (!config) {
                return services;
            }

            // Get all service resources
            const allResources = await this.collectAllResources(kustomizePath, config);
            
            for (const resource of allResources) {
                const resourcePath = path.isAbsolute(resource) ? resource : path.join(dirPath, resource);
                
                if (!fs.existsSync(resourcePath)) {
                    continue;
                }

                const service = await this.parseServiceFile(resourcePath);
                if (service) {
                    services.push(service);
                }
            }

        } catch (error) {
            console.error(`Error parsing services from ${kustomizePath}:`, error);
        }

        return services;
    }

    /**
     * Parse a single Service YAML file using official Kubernetes types
     */
    private async parseServiceFile(filePath: string): Promise<ServiceInfo | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const docs = yaml.loadAll(content);

            for (const doc of docs) {
                if (doc && typeof doc === 'object' && 'kind' in doc && doc.kind === 'Service') {
                    const k8sService = doc as k8s.V1Service;
                    const servicePorts = k8sService.spec?.ports || [];
                    
                    return {
                        k8sService: k8sService,
                        name: k8sService.metadata?.name || path.basename(filePath, path.extname(filePath)),
                        type: k8sService.spec?.type || 'ClusterIP',
                        ports: servicePorts.map((p) => ({
                            name: p.name,
                            port: p.port,
                            targetPort: (typeof p.targetPort === 'number' ? p.targetPort : p.port),
                            protocol: p.protocol || 'TCP'
                        })),
                        filePath: filePath
                    };
                }
            }
        } catch (error) {
            console.error(`Error parsing service file ${filePath}:`, error);
        }

        return null;
    }

    /**
     * Determine if a container is a sidecar based on name patterns
     */
    private isSidecarContainer(name: string): boolean {
        const sidecarKeywords = ['sidecar', 'proxy', 'agent', 'exporter', 'fluentd', 'envoy', 'istio', 'prometheus'];
        return sidecarKeywords.some(keyword => name.toLowerCase().includes(keyword));
    }

    /**
     * Get icon for container based on name
     */
    private getContainerIcon(name: string): string {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('api')) return '🚀';
        if (nameLower.includes('worker') || nameLower.includes('job')) return '⚙️';
        if (nameLower.includes('frontend') || nameLower.includes('web') || nameLower.includes('ui')) return '🌐';
        if (nameLower.includes('analytics') || nameLower.includes('data')) return '📈';
        if (nameLower.includes('fluentd') || nameLower.includes('log')) return '📝';
        if (nameLower.includes('prometheus') || nameLower.includes('metric')) return '📊';
        if (nameLower.includes('envoy') || nameLower.includes('proxy') || nameLower.includes('mesh')) return '🔀';
        if (nameLower.includes('database') || nameLower.includes('db')) return '💾';
        if (nameLower.includes('cache') || nameLower.includes('redis')) return '⚡';
        return '📦';
    }

    /**
     * Get purpose description for sidecar container
     */
    private getContainerPurpose(name: string): string {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('fluentd') || nameLower.includes('log')) return 'Logging';
        if (nameLower.includes('prometheus') || nameLower.includes('metric')) return 'Metrics';
        if (nameLower.includes('envoy') || nameLower.includes('proxy') || nameLower.includes('mesh')) return 'Service Mesh';
        if (nameLower.includes('istio')) return 'Service Mesh';
        if (nameLower.includes('agent')) return 'Monitoring';
        return 'Sidecar';
    }

    /**
     * Validate overlay configuration and return issues
     */
    async validateOverlay(kustomizePath: string): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];
        
        try {
            const deployments = await this.parseDeployments(kustomizePath);
            const configMaps = await this.parseConfigMaps(kustomizePath);
            const services = await this.parseServices(kustomizePath);
            
            // Get environment from path
            const dirPath = path.dirname(kustomizePath);
            const parts = dirPath.split(path.sep);
            const env = parts[parts.length - 1];
            const isProd = env.toLowerCase().includes('prod');
            
            // Validate deployments
            for (const deployment of deployments) {
                // Check for missing resource limits
                for (const container of deployment.containers) {
                    if (!container.resources?.limits?.cpu || !container.resources?.limits?.memory) {
                        issues.push({
                            severity: 'warning',
                            resource: `Deployment: ${deployment.name} / Container: ${container.name}`,
                            message: 'Missing resource limits - may cause resource contention',
                            filePath: deployment.filePath
                        });
                    }
                    
                    // Check for :latest tag in production
                    if (isProd && container.image?.endsWith(':latest')) {
                        issues.push({
                            severity: 'error',
                            resource: `Deployment: ${deployment.name} / Container: ${container.name}`,
                            message: `Using :latest tag in production is not recommended - Image: ${container.image}`,
                            filePath: deployment.filePath
                        });
                    }
                }
                
                // Check for ConfigMap references
                const spec = deployment.k8sDeployment.spec?.template?.spec;
                if (spec?.containers) {
                    for (const container of spec.containers) {
                        const configMapRefs = container.envFrom?.filter(e => e.configMapRef) || [];
                        for (const ref of configMapRefs) {
                            const configMapName = ref.configMapRef?.name;
                            if (configMapName && !configMaps.find(cm => cm.name === configMapName)) {
                                issues.push({
                                    severity: 'error',
                                    resource: `Deployment: ${deployment.name}`,
                                    message: `References ConfigMap "${configMapName}" which doesn't exist`,
                                    filePath: deployment.filePath
                                });
                            }
                        }
                    }
                }
            }
            
            // Validate services match deployments
            for (const service of services) {
                const selector = service.k8sService.spec?.selector;
                if (selector) {
                    const matchingDeployments = deployments.filter(d => {
                        const labels = d.k8sDeployment.spec?.template?.metadata?.labels;
                        if (!labels) return false;
                        return Object.entries(selector).every(([key, value]) => labels[key] === value);
                    });
                    
                    if (matchingDeployments.length === 0) {
                        issues.push({
                            severity: 'warning',
                            resource: `Service: ${service.name}`,
                            message: `Selector doesn't match any deployment labels`,
                            filePath: service.filePath
                        });
                    }
                }
            }
            
        } catch (error) {
            console.error(`Error validating overlay ${kustomizePath}:`, error);
        }
        
        return issues;
    }
}
