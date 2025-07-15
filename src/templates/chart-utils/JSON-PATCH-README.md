# JSON Patch for Helm Templates

A comprehensive implementation of [RFC 6902 JSON Patch](https://tools.ietf.org/html/rfc6902) operations for dynamically modifying Kubernetes manifests within Helm templates.

## Overview

This JSON Patch system allows you to make surgical modifications to Kubernetes manifests at Helm render time, providing a powerful alternative to complex template logic or multiple chart variants.

### Key Benefits

- 🎯 **Surgical Changes**: Make precise modifications without duplicating entire manifests
- 🔄 **Dynamic Configuration**: Apply different patches based on Helm values or conditions  
- 📦 **Reusability**: Same base manifest can be customized for different environments
- 🚀 **Maintainability**: Changes are explicit and traceable through patch definitions
- ✅ **Standards Compliant**: Implements RFC 6902 JSON Patch specification

## Quick Start

### Basic Usage

```yaml
# values.yaml
k8sDeployment:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: nginx-deployment
    labels:
      app: nginx
  spec:
    replicas: 3
    template:
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2

patchs:
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: LOG_LEVEL
    value: debug
- op: remove
  path: /metadata/labels/app
```

```yaml
# templates/deployment.yaml
{{- include "chartUtils.applyPatches" (dict "object" .Values.k8sDeployment "patches" .Values.patchs) -}}
{{- toYaml .Values.k8sDeployment -}}
```

## Supported Operations

### 1. Add Operation

Add new properties or append to arrays.

#### Add Object Property
```yaml
- op: add
  path: /metadata/labels/environment
  value: production
```

#### Add Array Element (Append)
```yaml
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: NODE_ENV
    value: production
```

#### Add Nested Object
```yaml
- op: add
  path: /spec/template/spec/containers/0/resources
  value:
    requests:
      memory: "64Mi"
      cpu: "250m"
    limits:
      memory: "128Mi"
      cpu: "500m"
```

### 2. Remove Operation

Delete object properties or array elements.

#### Remove Object Property
```yaml
- op: remove
  path: /metadata/labels/version
```

#### Remove Array Element by Index
```yaml
- op: remove
  path: /spec/template/spec/containers/0/env/1
```

#### Remove Nested Object
```yaml
- op: remove
  path: /spec/template/spec/containers/0/resources/limits
```

## Advanced Usage

### Targeted Patches

Apply patches to specific Kubernetes resources in a multi-resource template:

```yaml
# values.yaml
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-nginx
  spec:
    replicas: 3
    template:
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
- apiVersion: v1
  kind: Service
  metadata:
    name: my-service
  spec:
    ports:
    - port: 80
      targetPort: 80

patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: my-nginx
  ops:
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: LOG_LEVEL
        value: debug
    - op: add
      path: /spec/replicas
      value: 5
- target:
    group: ""
    version: v1
    kind: Service
    name: my-service
  ops:
    - op: add
      path: /spec/type
      value: LoadBalancer
```

```yaml
# templates/resources.yaml
{{- include "chartUtils.applyTargetedPatches" (dict "resources" .Values.k8sResources "patches" .Values.patchs) -}}
{{- range $index, $resource := .Values.k8sResources -}}
{{- if $index }}
---
{{- end }}
{{- toYaml $resource }}
{{- end -}}
```

### Combined Operations

Chain multiple operations for complex transformations:

```yaml
patchs:
# Remove old configuration
- op: remove
  path: /metadata/labels/version
- op: remove
  path: /spec/template/spec/containers/0/env/0

# Add new configuration
- op: add
  path: /metadata/labels/version
  value: "v2.0"
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: NEW_FEATURE
    value: enabled
```

## Path Syntax

JSON Patch uses [JSON Pointer (RFC 6901)](https://tools.ietf.org/html/rfc6901) for specifying paths:

### Object Navigation
```yaml
/metadata/labels/app              # Object property
/spec/template/metadata/labels    # Nested object properties
```

### Array Navigation
```yaml
/spec/template/spec/containers/0         # First container
/spec/template/spec/containers/0/env/1   # Second environment variable
/spec/template/spec/containers/0/env/-   # Append to env array
```

### Special Characters
- `/` separates path segments
- `~0` represents `~` in property names
- `~1` represents `/` in property names

## Template Helper Functions

### chartUtils.applyPatches

Apply patches to a single Kubernetes object:

```yaml
{{- include "chartUtils.applyPatches" (dict "object" .Values.k8sDeployment "patches" .Values.patchs) -}}
```

**Parameters:**
- `object`: The Kubernetes manifest to modify
- `patches`: Array of patch operations

### chartUtils.applyTargetedPatches

Apply patches to specific resources in a multi-resource collection:

```yaml
{{- include "chartUtils.applyTargetedPatches" (dict "resources" .Values.k8sResources "patches" .Values.patchs) -}}
```

**Parameters:**
- `resources`: Array of Kubernetes manifests
- `patches`: Array of targeted patch definitions

## Real-World Examples

### Environment-Specific Configuration

```yaml
# values-production.yaml
patchs:
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: ENVIRONMENT
    value: production
- op: add
  path: /spec/replicas
  value: 5
- op: add
  path: /spec/template/spec/containers/0/resources
  value:
    requests:
      memory: "256Mi"
      cpu: "500m"
    limits:
      memory: "512Mi"
      cpu: "1000m"
```

### Feature Flags

```yaml
{{- if .Values.features.monitoring }}
patchs:
- op: add
  path: /spec/template/spec/containers/0/ports/-
  value:
    containerPort: 8080
    name: metrics
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: METRICS_ENABLED
    value: "true"
{{- end }}
```

### Security Hardening

```yaml
# Remove default security configurations
patchs:
- op: remove
  path: /spec/template/spec/containers/0/securityContext/runAsUser
- op: add
  path: /spec/template/spec/containers/0/securityContext
  value:
    runAsNonRoot: true
    runAsUser: 65534
    allowPrivilegeEscalation: false
    capabilities:
      drop:
      - ALL
```

## Error Handling

The system gracefully handles various error conditions:

### Non-Existent Paths
```yaml
# These operations will be safely ignored if paths don't exist
- op: remove
  path: /metadata/labels/nonexistent
- op: remove
  path: /spec/template/spec/containers/0/env/99
```

### Invalid Operations
- Removing from non-existent arrays
- Accessing undefined object properties
- Invalid array indices

## Limitations

1. **Array Replacement**: Currently supports element-by-element operations, not full array replacement
2. **Complex Path Navigation**: Very deep nesting (10+ levels) may impact performance
3. **Type Validation**: No runtime type checking of patch values
4. **Conditional Patches**: No built-in conditional logic (use Helm's `{{- if }}` blocks)

## Best Practices

### 1. Use Descriptive Patch Names
```yaml
patchs:
# Good: Clear intent
- op: add
  path: /metadata/labels/monitoring-enabled
  value: "true"

# Better: With comments
# Enable Prometheus monitoring
- op: add
  path: /spec/template/spec/containers/0/ports/-
  value:
    containerPort: 8080
    name: metrics
```

### 2. Group Related Operations
```yaml
# Group patches by functionality
monitoring_patches:
- op: add
  path: /spec/template/spec/containers/0/ports/-
  value:
    containerPort: 8080
    name: metrics

security_patches:
- op: add
  path: /spec/template/spec/containers/0/securityContext/runAsNonRoot
  value: true
```

### 3. Test Patch Order
Operations are applied in sequence, so order matters:
```yaml
# Correct order: remove first, then add
- op: remove
  path: /metadata/labels/version
- op: add
  path: /metadata/labels/version
  value: "2.0"
```

### 4. Use Targeted Patches for Multi-Resource Templates
```yaml
# Prefer targeted patches over multiple patch lists
patchs:
- target:
    kind: Deployment
    name: api
  ops:
    - op: add
      path: /spec/replicas
      value: 3
- target:
    kind: Service
    name: api
  ops:
    - op: add
      path: /spec/type
      value: LoadBalancer
```

## Integration with Helm

### Values Structure
```yaml
# Recommended values.yaml structure
app:
  name: myapp
  version: 1.0.0

k8sResources:
  - # ... your Kubernetes manifests

# Environment-specific patches
patches:
  common: []
  development: []
  staging: []
  production: []

# Active patches (can reference above)
patchs: "{{ .Values.patches.common | concat .Values.patches[.Values.environment] }}"
```

### Template Organization
```
templates/
├── _helpers.tpl              # Include chartUtils functions here
├── deployment.yaml           # Use applyPatches
├── service.yaml             # Use applyPatches  
└── resources.yaml           # Use applyTargetedPatches
```

## Performance Considerations

- **Patch Count**: Each patch adds template processing time
- **Path Complexity**: Deeply nested paths take longer to navigate
- **Array Operations**: Array modifications are more expensive than object operations
- **Resource Count**: Targeted patches scale linearly with resource count

For high-performance requirements, consider pre-computing patches or using simpler template logic.

## Contributing

This JSON Patch implementation is part of the helmify-kustomize project. To contribute:

1. Add test cases in `src/playground.spec.ts`
2. Update helper functions in the main template
3. Update this documentation
4. Ensure all tests pass with `npm test`

## References

- [RFC 6902: JSON Patch](https://tools.ietf.org/html/rfc6902)
- [RFC 6901: JSON Pointer](https://tools.ietf.org/html/rfc6901)
- [Helm Template Functions](https://helm.sh/docs/chart_template_guide/function_list/)
- [Kubernetes API Reference](https://kubernetes.io/docs/reference/kubernetes-api/) 