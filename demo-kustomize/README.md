# Demo Kustomize Project Structure

This demo showcases a realistic multi-tenant Kustomize setup with **multiple workloads**, **shared environment variables**, and a **3-tier inheritance hierarchy**.

## Workload Architecture

### Common Base Workloads (`base/`)
- **api**: Backend API service (2 replicas)
- **worker**: Background job processor (1 replica)

### Client A Workloads (`base/client-a/`)
Inherits: api, worker
Adds:
- **analytics**: Data analytics engine (1 replica)

### Client B Workloads (`base/client-b/`)
Inherits: api, worker
Adds:
- **frontend**: Web frontend application (2 replicas)

## Shared Configuration

### Common ConfigMap (`base/configmap.yaml`)
All workloads inherit these environment variables:
```yaml
PLATFORM_NAME: "Multi-Tenant Platform"
API_VERSION: "v1"
METRICS_ENABLED: "true"
METRICS_PORT: "9090"
HEALTH_CHECK_PATH: "/health"
READINESS_CHECK_PATH: "/ready"
LOG_FORMAT: "json"
TIMEZONE: "UTC"
ENABLE_TRACING: "true"
TRACE_SAMPLING_RATE: "0.1"
```

### Client-Specific ConfigMap
Each client adds their own configuration:

**Client A** (`base/client-a/`):
```yaml
CLIENT_ID: client-a
CLIENT_NAME: Client A Corporation
DATABASE_HOST: postgres.client-a.svc
DATABASE_TYPE: postgresql
CACHE_HOST: redis.client-a.svc
```

**Client B** (`base/client-b/`):
```yaml
CLIENT_ID: client-b
CLIENT_NAME: Client B Industries
DATABASE_HOST: mysql.client-b.svc
DATABASE_TYPE: mysql
EXTERNAL_API_URL: https://api.external.com
S3_BUCKET: client-b-data
```

## Single Namespace Architecture

All deployments use: **`shared-platform`** namespace

Workload naming:
- Client A: `client-a-api`, `client-a-worker`, `client-a-analytics`
- Client B: `client-b-api`, `client-b-worker`, `client-b-frontend`

## Structure Overview

```
demo-kustomize/
├── base/                           # Tier 1: Common base for ALL clients
│   ├── deployment.yaml             # Base deployment template
│   ├── service.yaml                # Common service definition
│   ├── configmap.yaml              # Base configuration
│   ├── kustomization.yaml          # Base kustomization
│   │
│   ├── client-a/                   # Tier 2: Client A specific base
│   │   ├── kustomization.yaml      # Inherits from ../
│   │   └── db-network.yml          # Client A network policy (PostgreSQL + Redis)
│   │
│   └── client-b/                   # Tier 2: Client B specific base
│       ├── kustomization.yaml      # Inherits from ../
│       └── api-network.yml         # Client B network policy (MySQL + APIs + S3)
│
└── overlays/                       # Tier 3: Environment-specific configs
    ├── client-a/
    │   ├── dev/                    # Client A - Development
    │   │   ├── kustomization.yaml  # Inherits from base/client-a
    │   │   └── deployment-patch.yaml
    │   │
    │   └── prod/                   # Client A - Production
    │       ├── kustomization.yaml  # Inherits from base/client-a
    │       └── deployment-patch.yaml
    │
    └── client-b/
        ├── dev/                    # Client B - Development
        │   ├── kustomization.yaml  # Inherits from base/client-b
        │   └── deployment-patch.yaml
        │
        └── prod/                   # Client B - Production
            ├── kustomization.yaml  # Inherits from base/client-b
            └── deployment-patch.yaml
```

## 3-Tier Inheritance Model

### Tier 1: Common Base (`base/`)
Shared resources for ALL clients:
- Standard deployment template
- Common service definition
- Base ConfigMap
- Default resource limits
- Common labels

### Tier 2: Client-Specific Base (`base/client-a/`, `base/client-b/`)
Client-specific configurations that inherit from Tier 1:

**Client A** (`base/client-a/`):
- Inherits: `bases: ["../"]`
- Network: PostgreSQL database + Redis cache access
- Config: `DATABASE_TYPE=postgresql`, `CACHE_ENABLED=true`
- Team: platform-team
- Prefix: `client-a-`

**Client B** (`base/client-b/`):
- Inherits: `bases: ["../"]`
- Network: MySQL database + External APIs + S3 access
- Config: `DATABASE_TYPE=mysql`, `EXTERNAL_API_ENABLED=true`, `RATE_LIMIT=1000`
- Team: data-team
- Prefix: `client-b-`

### Tier 3: Environment Overlays (`overlays/client-a/`, `overlays/client-b/`)
Environment-specific settings that inherit from Tier 2:

**Development Environment:**
- 2 replicas
- Lower resource limits
- Debug logging enabled
- Dev API endpoints
- Feature flags for testing

**Production Environment:**
- 5-7 replicas (client-dependent)
- Higher resource limits
- Health probes configured
- Production API endpoints
- Monitoring enabled
- Production feature flags

## Usage Examples

### Build specific configurations
```bash
# Build Client A - Dev
kustomize build demo-kustomize/overlays/client-a/dev

# Build Client A - Prod
kustomize build demo-kustomize/overlays/client-a/prod

# Build Client B - Dev
kustomize build demo-kustomize/overlays/client-b/dev

# Build Client B - Prod
kustomize build demo-kustomize/overlays/client-b/prod

# Build Client A base (without environment)
kustomize build demo-kustomize/base/client-a

# Build Client B base (without environment)
kustomize build demo-kustomize/base/client-b
```

### Apply to cluster
```bash
kubectl apply -k demo-kustomize/overlays/client-a/dev
kubectl apply -k demo-kustomize/overlays/client-b/prod
```

### View inheritance chain
```bash
# See what Client A dev inherits
# Tier 3 (overlays/client-a/dev) 
#   → Tier 2 (base/client-a) 
#     → Tier 1 (base)

# Compare environments for same client
diff <(kustomize build demo-kustomize/overlays/client-a/dev) \
     <(kustomize build demo-kustomize/overlays/client-a/prod)

# Compare same environment for different clients
diff <(kustomize build demo-kustomize/overlays/client-a/dev) \
     <(kustomize build demo-kustomize/overlays/client-b/dev)
```

## Inheritance Flow

### Example: Building `overlays/client-a/prod`

1. **Start**: `overlays/client-a/prod/kustomization.yaml`
   - Reads `bases: ["../../../base/client-a"]`

2. **Load Tier 2**: `base/client-a/kustomization.yaml`
   - Reads `bases: ["../"]` → loads common base
   - Adds: `db-network.yml`, `client-a-` prefix, client labels

3. **Load Tier 1**: `base/kustomization.yaml`
   - Loads: `deployment.yaml`, `service.yaml`, `configmap.yaml`
   - Applies common labels

4. **Apply Tier 2 customizations**: Client A base layer
   - Merges Client A network policy
   - Adds Client A config (PostgreSQL, Redis)

5. **Apply Tier 3 customizations**: Production overlay
   - Sets namespace: `client-a-prod`
   - Sets replicas: 5
   - Patches deployment with production settings
   - Adds production ConfigMap values

6. **Result**: Fully customized Client A production manifest

## Customization Points

### Tier 1 (Common Base)
- Deployment template structure
- Service configuration
- Base resource limits
- Common labels

### Tier 2 (Client-Specific Base)
Each client can customize:
1. **Network Policies**: Client-specific network access rules
2. **Name Prefix**: Unique identifier for client resources
3. **Labels**: Team, client, tier metadata
4. **ConfigMap**: Client-specific defaults (database type, API settings)
5. **Additional Resources**: Client-specific base resources

### Tier 3 (Environment Overlays)
Each environment can customize:
1. **Namespace**: Isolated resources per client/environment
2. **Replica Count**: Scale based on environment load
3. **Resource Limits**: CPU/memory based on environment
4. **Environment Variables**: Environment-specific configuration
5. **Image Versions**: Different versions if needed
6. **Health Probes**: Production health checks
7. **Monitoring**: Enable/disable per environment
8. **Feature Flags**: Control features per environment
