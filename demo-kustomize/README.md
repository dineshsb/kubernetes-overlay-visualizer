# Demo Kustomize Project Structure

This demo showcases a realistic multi-tenant Kustomize setup with a common base template inherited by multiple clients.

## Structure Overview

```
demo-kustomize/
├── base/                           # Common deployment template
│   ├── deployment.yaml             # Base deployment with common configuration
│   ├── service.yaml                # Common service definition
│   ├── configmap.yaml              # Base configuration
│   └── kustomization.yaml          # Base kustomization
│
└── overlays/
    ├── dev/                        # Development environment
    │   ├── client-a/               # Client A dev configuration
    │   │   ├── kustomization.yaml  # Inherits from base
    │   │   ├── network-policy.yaml # Client A specific network rules
    │   │   └── deployment-patch.yaml # Client A customizations
    │   │
    │   └── client-b/               # Client B dev configuration
    │       ├── kustomization.yaml  # Inherits from base
    │       ├── network-policy.yaml # Client B specific network rules
    │       └── deployment-patch.yaml # Client B customizations
    │
    └── prod/                       # Production environment
        ├── client-a/               # Client A prod configuration
        │   ├── kustomization.yaml  # Inherits from base
        │   ├── network-policy.yaml # Production network rules
        │   └── deployment-patch.yaml # Production settings
        │
        └── client-b/               # Client B prod configuration
            ├── kustomization.yaml  # Inherits from base
            ├── network-policy.yaml # Production network rules
            └── deployment-patch.yaml # Production settings
```

## Key Features

### Base Template
- **Common Deployment**: Shared deployment template with standard resource limits
- **Service Definition**: ClusterIP service for all clients
- **ConfigMap**: Base configuration used by all deployments

### Client-Specific Overlays
Each client inherits the base template and adds:
- **Custom Namespace**: Isolated namespaces per client and environment
- **Network Policies**: Client-specific ingress/egress rules
- **Resource Overrides**: Different CPU/memory limits per client
- **Environment Variables**: Client-specific configuration
- **Replica Counts**: Different scaling per environment
- **Feature Flags**: Enable/disable features per client

### Environment Differences

**Development (dev/)**
- Lower resource limits
- Fewer replicas (2-3)
- Debug-friendly settings
- Less restrictive network policies

**Production (prod/)**
- Higher resource limits
- More replicas (5-7)
- Monitoring enabled
- Health probes configured
- Strict network policies
- Production-grade settings

## Client Differences

### Client A
- **Dev**: 3 replicas, Alpine image, moderate resources
- **Prod**: 5 replicas, production monitoring, higher resources
- **Network**: Access to database, Redis, monitoring
- **Features**: feature-a, feature-b, feature-c

### Client B
- **Dev**: 2 replicas, newer Alpine image, caching enabled
- **Prod**: 7 replicas, premium features, highest resources
- **Network**: Access to database, external APIs, S3
- **Features**: feature-x, feature-y, feature-z, premium-features

## Usage

### Build a specific overlay
```bash
kustomize build demo-kustomize/overlays/dev/client-a
kustomize build demo-kustomize/overlays/prod/client-b
```

### Apply to cluster
```bash
kubectl apply -k demo-kustomize/overlays/dev/client-a
kubectl apply -k demo-kustomize/overlays/prod/client-b
```

### View differences
```bash
# Compare dev vs prod for client-a
diff <(kustomize build demo-kustomize/overlays/dev/client-a) \
     <(kustomize build demo-kustomize/overlays/prod/client-a)
```

## Customization Points

Each client overlay can customize:
1. **Namespace**: Isolated resources per tenant
2. **Resource Limits**: CPU/memory based on client tier
3. **Replica Count**: Scale based on load requirements
4. **Network Policies**: Fine-grained network access control
5. **Environment Variables**: Client-specific configuration
6. **Image Versions**: Different versions per client if needed
7. **ConfigMaps**: Generated with client-specific values
8. **Labels**: Track client and environment metadata
