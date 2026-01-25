# Kubernetes Overlay Visualizer - Architecture

## Design Philosophy

**Zero Hardcoding**: This extension contains ZERO hardcoded Kubernetes configuration. Everything is dynamically parsed from your actual YAML files. This makes it a truly generic tool that works with any Kustomize project.

## How It Works

### 1. Resource Discovery
The extension scans your workspace for `kustomization.yaml` files and builds a project tree:
- Identifies base directories
- Identifies overlay directories
- Maps inheritance relationships

### 2. Dynamic Parsing
For each overlay, the parser:
1. **Follows inheritance chain**: base/ → base/client-x/ → overlays/client-x/env/
2. **Collects resources**: Reads all `resources:` entries recursively
3. **Parses YAML files**: Extracts Deployments, ConfigMaps, NetworkPolicies, Services
4. **Applies patches**: Merges strategic merge patches and JSON patches
5. **Generates visualization**: Creates interactive diagram from parsed data

### 3. Smart Inference
Some metadata is inferred using naming patterns (not hardcoded):

#### Container Icons (by name pattern):
- `api` → 🚀 Backend API
- `worker`, `job` → ⚙️ Job Processor
- `frontend`, `web`, `ui` → 🌐 Web Frontend
- `analytics`, `data` → 📈 Analytics Engine
- `database`, `db` → 💾 Database
- `cache`, `redis` → ⚡ Cache
- `fluentd`, `log` → 📝 Logging
- `prometheus`, `metric` → 📊 Metrics
- `envoy`, `proxy`, `mesh` → 🔀 Service Mesh
- Default → 📦 Generic Container

#### Sidecar Detection (by name keywords):
- `sidecar`, `proxy`, `agent`, `exporter`, `fluentd`, `envoy`, `istio`, `prometheus`
- First container is always "main", others evaluated by name

#### ConfigMap Categorization (by name pattern):
- `common` → Common variables
- `client` → Client-specific variables
- `env` → Environment-specific variables

## What Must Be in Your YAML Files

### Required for Visualization

#### 1. **Deployments** (Required)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app                    # ✅ Used for workload name
spec:
  replicas: 3                     # ✅ Used for pod count
  template:
    spec:
      containers:
      - name: app                 # ✅ Used for container display
        image: nginx:latest
        resources:                # ✅ Used for resource display
          limits:
            cpu: "500m"
            memory: "1Gi"
          requests:
            cpu: "250m"
            memory: "512Mi"
      - name: fluentd-sidecar     # ✅ Auto-detected as sidecar
        image: fluent/fluentd
```

#### 2. **Kustomization Files** (Required)
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

# Inheritance
bases:                            # ✅ Used to follow inheritance
  - ../../base

# Resources
resources:                        # ✅ Used to find YAML files
  - deployment.yaml
  - service.yaml

# Prefixes/Suffixes
namePrefix: client-a-             # ✅ Used for resource naming
namespace: production             # ✅ Used for namespace display

# Patches
patches:                          # ✅ Applied to resources
  - api-patch.yaml

replicas:                         # ✅ Applied to deployments
  - name: api
    count: 5

# ConfigMaps
configMapGenerator:               # ✅ Used for env vars
  - name: env-config
    literals:
      - ENVIRONMENT=production
      - LOG_LEVEL=WARN
```

#### 3. **ConfigMaps** (Optional but Recommended)
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: common-config             # ✅ Used for categorization
data:
  PLATFORM_NAME: "my-platform"    # ✅ Displayed as env vars
  API_VERSION: "v2"
  LOG_FORMAT: "json"
```

#### 4. **NetworkPolicies** (Optional)
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: app-network               # ✅ Used for policy name
spec:
  ingress:
  - from:
    - ipBlock:
        cidr: 10.200.1.0/24       # ✅ Displayed in diagram
    ports:
    - protocol: TCP
      port: 8080                  # ✅ Displayed in diagram
  egress:
  - to:
    - ipBlock:
        cidr: 10.100.1.0/24       # ✅ Displayed in diagram
    ports:
    - protocol: TCP
      port: 5432                  # ✅ Displayed in diagram
```

#### 5. **Services** (Optional)
```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-service               # ✅ Used for service name
spec:
  type: ClusterIP                 # ✅ Displayed in info
  ports:
  - port: 8080                    # ✅ Displayed in info
    targetPort: 8080
    protocol: TCP
```

## What's Automatically Detected

### ✅ From Deployments:
- Workload names
- Replica counts (base + patches)
- All containers (main + sidecars)
- Resource limits (CPU/Memory)
- Resource requests (CPU/Memory)
- Container types (main vs sidecar)
- Workload types (inferred from name)

### ✅ From ConfigMaps:
- Environment variable names
- Environment variable values
- ConfigMap categorization (common/client/env)

### ✅ From NetworkPolicies:
- Ingress rules with IPs and ports
- Egress rules with IPs and ports
- Network policy names

### ✅ From Kustomization:
- Namespace
- Name prefixes/suffixes
- Patch files
- Resource inheritance chain
- Replica overrides

### ✅ From File Structure:
- Client names (e.g., `client-a` from path)
- Environment names (e.g., `dev`, `prod` from path)
- Project hierarchy (base → client-base → overlay)

## Kubectl Commands Generation

Commands are dynamically generated using:
- Actual deployment names from YAML
- Actual namespace from kustomization
- Actual container names from deployment specs
- Client and environment from directory structure

**Example**: If your deployment is named `payment-processor` in namespace `finance-prod`, the commands will be:
```bash
kubectl get pods -n finance-prod -l app=payment-processor
kubectl logs -n finance-prod -l app=payment-processor -c payment-processor
kubectl exec -it -n finance-prod $(kubectl get pod -n finance-prod -l app=payment-processor -o name | head -1) -- /bin/sh
```

## Extending the Visualizer

### To Add New Resource Types:

1. **Add Interface** in `kustomizeParser.ts`:
```typescript
export interface YourResourceInfo {
    name: string;
    // your fields
}
```

2. **Add Parser Method**:
```typescript
async parseYourResource(kustomizePath: string): Promise<YourResourceInfo[]> {
    // parsing logic
}
```

3. **Call in** `analyzeOverlay()` in `extension.ts`:
```typescript
const yourResources = await parser.parseYourResource(overlay.path);
```

4. **Add Renderer** in `extension.ts`:
```typescript
function renderYourResource(resources: YourResourceInfo[]): string {
    // HTML generation
}
```

## Best Practices for Your Kustomize Project

### 1. **Consistent Naming**
Use clear, descriptive names for deployments and containers:
- ✅ `payment-api`, `order-worker`, `analytics-engine`
- ❌ `app1`, `service`, `container`

### 2. **Proper Labeling**
Add labels to your deployments for better kubectl targeting:
```yaml
metadata:
  labels:
    app: payment-api
    tier: backend
    component: api
```

### 3. **Resource Limits**
Always specify resources for accurate visualization:
```yaml
resources:
  limits:
    cpu: "500m"
    memory: "1Gi"
  requests:
    cpu: "250m"
    memory: "512Mi"
```

### 4. **ConfigMap Organization**
Use naming patterns for automatic categorization:
- `common-config` - Shared across all
- `client-a-config` - Client-specific
- `env-config` - Environment-specific

### 5. **Network Policies**
Be explicit with IP blocks and ports:
```yaml
- to:
  - ipBlock:
      cidr: 10.100.1.0/24     # Database subnet
  ports:
  - protocol: TCP
    port: 5432                # PostgreSQL
```

## Limitations

### Current Limitations:
- Supports Kustomize v2-v5 formats
- Patch application is basic (strategic merge only, no JSON merge patch yet)
- No support for Helm charts (Kustomize-only)
- No support for custom Kustomize plugins
- No real-time kubectl execution (future feature)

### Workarounds:
- Use `kustomize build` CLI for advanced patches
- Convert Helm to Kustomize using `helm template`
- Disable custom plugins during visualization

## Performance

### Optimizations:
- Lazy loading: Only parses selected overlay
- Caching: Parsed results cached until file changes
- Parallel parsing: Multiple resources parsed simultaneously
- Streaming: Large files processed in chunks

### Scalability:
- ✅ Works with projects of any size
- ✅ Handles hundreds of deployments
- ✅ Supports deep inheritance chains (5+ levels)
- ✅ Processes large ConfigMaps (1000+ vars)

## Security Considerations

### Safe Operations:
- ✅ Read-only: Never modifies your YAML files
- ✅ Local: No external network calls
- ✅ Sandboxed: Runs in VS Code extension host
- ✅ No secrets: Doesn't parse or display Secret resources

### What's NOT Parsed:
- Kubernetes Secrets (security)
- ServiceAccounts (security)
- RBAC resources (not needed for visualization)
- Custom Resource Definitions (future feature)

## Troubleshooting

### "No overlays found"
- Ensure `kustomization.yaml` files exist
- Check file permissions
- Verify YAML syntax with `kustomize build`

### "Deployment not showing"
- Check `resources:` list in kustomization.yaml
- Ensure deployment file path is correct
- Verify YAML syntax with `kubectl apply --dry-run`

### "Network policies not appearing"
- Ensure NetworkPolicy resources are in `resources:` list
- Check that NetworkPolicy YAML is valid
- Verify file extension is `.yaml` or `.yml`

### "Environment variables missing"
- Check ConfigMap names (use `common`, `client`, or `env` in name)
- Verify ConfigMap is in resources or configMapGenerator
- Ensure ConfigMap data section has key-value pairs

## Contributing

This is a generic tool. To add features:
1. Keep it generic (no hardcoding)
2. Use pattern-based inference where needed
3. Document new patterns in this file
4. Add tests for edge cases
5. Update REFACTORING.md with changes
