import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
const { execSync } = require('child_process');
import * as os from 'os';
import { chartUtils } from './templates/helm-utils';

const helmChartRaw = chartUtils('chartUtils');

function printOutput(template:string){
  return `
  ${template}
  {{- include "chartUtils.applyPatches" (dict "object" .Values.k8sDeployment "patches" .Values.patchs) -}}
{{- toYaml .Values.k8sDeployment -}}
  `
}
function printOutput2(template:string){
  return `
  ${template}
  {{- include "chartUtils.applyTargetedPatches" (dict "resources" .Values.k8sResources "patches" .Values.patchs) -}}
{{- range $index, $resource := .Values.k8sResources -}}
{{- if $index }}
---
{{- end }}
{{- toYaml $resource }}
{{- end -}}
  `
}

function printOutputWithManifestPatchers(template:string){
  return `
  ${template}
  {{- $manifest := dict "spec" .Values.k8sManifest }}
  {{- include "chartUtils.applyManifestPatchers" (dict "manifest" $manifest "globals" .Values.globals) -}}
  {{- toYaml $manifest.spec }}
  `
}


describe('Chart Utils Patches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });


  it('should apply patches to k8sDeployment', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sDeployment:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: nginx-deployment
    labels:
      app: nginx
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
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
    `,
      template: printOutput(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // Expected object after applying the patch
    const expectedObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'nginx-deployment',
        labels: {
          app: 'nginx'
        }
      },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: {
            app: 'nginx'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'nginx'
            }
          },
          spec: {
            containers: [
              {
                name: 'nginx',
                image: 'nginx:1.14.2',
                env: [
                  {
                    name: 'LOG_LEVEL',
                    value: 'debug'
                  }
                ]
              }
            ]
          }
        }
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should apply multiple patches to k8sDeployment', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sDeployment:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: nginx-deployment
    labels:
      app: nginx
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
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
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: NODE_ENV
    value: production
- op: add
  path: /spec/template/spec/containers/0/resources
  value:
    requests:
      memory: "64Mi"
      cpu: "250m"
    limits:
      memory: "128Mi"
      cpu: "500m"
- op: add
  path: /spec/replicas
  value: 5
    `,
      template: printOutput(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // Expected object after applying all patches
    const expectedObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'nginx-deployment',
        labels: {
          app: 'nginx'
        }
      },
      spec: {
        replicas: 5, // Updated by patch
        selector: {
          matchLabels: {
            app: 'nginx'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'nginx'
            }
          },
          spec: {
            containers: [
              {
                name: 'nginx',
                image: 'nginx:1.14.2',
                env: [
                  {
                    name: 'LOG_LEVEL',
                    value: 'debug'
                  },
                  {
                    name: 'NODE_ENV',
                    value: 'production'
                  }
                ],
                resources: {
                  requests: {
                    memory: '64Mi',
                    cpu: '250m'
                  },
                  limits: {
                    memory: '128Mi',
                    cpu: '500m'
                  }
                }
              }
            ]
          }
        }
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should apply targeted patches to specific resources', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-nginx
    labels:
      app: nginx
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
          
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
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // Expected object after applying targeted patches
    const expectedObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'my-nginx',
        labels: {
          app: 'nginx'
        }
      },
      spec: {
        replicas: 5, // Updated by patch
        selector: {
          matchLabels: {
            app: 'nginx'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'nginx'
            }
          },
          spec: {
            containers: [
              {
                name: 'nginx',
                image: 'nginx:1.14.2',
                env: [
                  {
                    name: 'LOG_LEVEL',
                    value: 'debug'
                  }
                ]
              }
            ]
          }
        }
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should demonstrate exact user-requested syntax with array of resources', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-nginx
    labels:
      app: nginx
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
- apiVersion: v1
  kind: Service
  metadata:
    name: my-service
    labels:
      app: nginx
  spec:
    selector:
      app: nginx
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
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    // Expected: First resource (Deployment) should be patched, second (Service) should be unchanged
    expect(actualResources).toHaveLength(2);
    
    // Check that my-nginx Deployment was patched
    const deployment = actualResources.find(r => r.kind === 'Deployment' && r.metadata.name === 'my-nginx');
    expect(deployment.spec.replicas).toBe(5); // Should be patched
    expect(deployment.spec.template.spec.containers[0].env).toEqual([
      { name: 'LOG_LEVEL', value: 'debug' }
    ]);
    
    // Check that my-service Service was NOT patched (unchanged)
    const service = actualResources.find(r => r.kind === 'Service' && r.metadata.name === 'my-service');
    expect(service.spec.ports).toEqual([{ port: 80, targetPort: 80 }]); // Should be unchanged
    
  });

  it('should handle non-matching targets gracefully', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-nginx
    labels:
      app: nginx
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: non-existent-deployment
  ops:
    - op: add
      path: /spec/replicas
      value: 10
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    // Expected: Resource should remain unchanged since target doesn't match
    expect(actualResources).toHaveLength(1);
    
    const deployment = actualResources[0];
    expect(deployment.spec.replicas).toBe(3); // Should remain unchanged
    expect(deployment.spec.template.spec.containers[0].env).toBeUndefined(); // Should remain unchanged
    
  });

  it('should handle core resources with empty group', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: v1
  kind: Service
  metadata:
    name: my-service
    labels:
      app: nginx
  spec:
    selector:
      app: nginx
    ports:
    - port: 80
      targetPort: 80
- apiVersion: v1
  kind: ConfigMap
  metadata:
    name: my-config
  data:
    key1: value1
          
patchs:
- target:
    group: ""
    version: v1
    kind: Service
    name: my-service
  ops:
    - op: add
      path: /spec/ports/0/name
      value: http
- target:
    group: ""
    version: v1
    kind: ConfigMap
    name: my-config
  ops:
    - op: add
      path: /data/key2
      value: value2
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(2);
    
    // Check that Service was patched
    const service = actualResources.find(r => r.kind === 'Service');
    expect(service.spec.ports[0].name).toBe('http'); // Should be patched
    expect(service.spec.ports[0].port).toBe(80); // Should remain unchanged
    
    // Check that ConfigMap was patched
    const configMap = actualResources.find(r => r.kind === 'ConfigMap');
    expect(configMap.data.key1).toBe('value1'); // Should remain unchanged
    expect(configMap.data.key2).toBe('value2'); // Should be patched
    
  });

  it('should handle core resources without specifying group and version', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: v1
  kind: Service
  metadata:
    name: my-service
    labels:
      app: nginx
  spec:
    selector:
      app: nginx
    ports:
    - port: 80
      targetPort: 80
- apiVersion: v1
  kind: ConfigMap
  metadata:
    name: my-config
  data:
    key1: value1
          
patchs:
- target:
    kind: Service
    name: my-service
  ops:
    - op: add
      path: /spec/ports/0/name
      value: http
    - op: add
      path: /spec/type
      value: LoadBalancer
- target:
    kind: ConfigMap
    name: my-config
  ops:
    - op: add
      path: /data/key2
      value: value2
    - op: add
      path: /data/key3
      value: value3
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(2);
    
    // With enhanced targeting, omitted group and version act as wildcards
    const service = actualResources.find(r => r.kind === 'Service');
    expect(service.spec.ports[0].name).toBe('http'); // Should be patched
    expect(service.spec.ports[0].port).toBe(80); // Should remain unchanged
    expect(service.spec.type).toBe('LoadBalancer'); // Should be patched
    
    const configMap = actualResources.find(r => r.kind === 'ConfigMap');
    expect(configMap.data.key1).toBe('value1'); // Should remain unchanged
    expect(configMap.data.key2).toBe('value2'); // Should be patched
    expect(configMap.data.key3).toBe('value3'); // Should be patched
    
  });

  it('should handle complex nested paths', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: complex-app
    labels:
      app: complex
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: complex
    template:
      metadata:
        labels:
          app: complex
      spec:
        containers:
        - name: main
          image: nginx:1.14.2
          resources:
            requests:
              memory: "64Mi"
              cpu: "250m"
        - name: sidecar
          image: busybox:1.30
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: complex-app
  ops:
    - op: add
      path: /spec/template/spec/containers/0/resources/limits
      value:
        memory: "128Mi"
        cpu: "500m"
    - op: add
      path: /spec/template/spec/containers/1/env/-
      value:
        name: SIDECAR_MODE
        value: enabled
    - op: add
      path: /spec/template/spec/containers/0/ports/-
      value:
        containerPort: 8080
        name: metrics
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(1);
    
    const deployment = actualResources[0];
    
    // Check that resource limits were added to first container
    expect(deployment.spec.template.spec.containers[0].resources.limits).toEqual({
      memory: '128Mi',
      cpu: '500m'
    });
    
    // Check that original requests are preserved
    expect(deployment.spec.template.spec.containers[0].resources.requests).toEqual({
      memory: '64Mi',
      cpu: '250m'
    });
    
    // Check that environment variable was added to sidecar container
    expect(deployment.spec.template.spec.containers[1].env).toEqual([
      { name: 'SIDECAR_MODE', value: 'enabled' }
    ]);
    
    // Check that port was added to main container
    expect(deployment.spec.template.spec.containers[0].ports).toEqual([
      { containerPort: 8080, name: 'metrics' }
    ]);
    
  });

  it('should handle multiple targets with different resource types', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-app
    labels:
      app: web
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: web
    template:
      metadata:
        labels:
          app: web
      spec:
        containers:
        - name: web
          image: nginx:1.14.2
- apiVersion: v1
  kind: Service
  metadata:
    name: web-service
    labels:
      app: web
  spec:
    selector:
      app: web
    ports:
    - port: 80
      targetPort: 80
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: api-app
    labels:
      app: api
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: api
    template:
      metadata:
        labels:
          app: api
      spec:
        containers:
        - name: api
          image: node:14
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: web-app
  ops:
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: APP_TYPE
        value: web
- target:
    group: ""
    version: v1
    kind: Service
    name: web-service
  ops:
    - op: add
      path: /spec/type
      value: LoadBalancer
- target:
    group: apps
    version: v1
    kind: Deployment
    name: api-app
  ops:
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: APP_TYPE
        value: api
    - op: add
      path: /spec/replicas
      value: 4
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(3);
    
    // Check web-app Deployment
    const webDeployment = actualResources.find(r => r.kind === 'Deployment' && r.metadata.name === 'web-app');
    expect(webDeployment.spec.template.spec.containers[0].env).toEqual([
      { name: 'APP_TYPE', value: 'web' }
    ]);
    expect(webDeployment.spec.replicas).toBe(3); // Should remain unchanged
    
    // Check web-service Service
    const webService = actualResources.find(r => r.kind === 'Service' && r.metadata.name === 'web-service');
    expect(webService.spec.type).toBe('LoadBalancer'); // Should be patched
    expect(webService.spec.ports[0].port).toBe(80); // Should remain unchanged
    
    // Check api-app Deployment
    const apiDeployment = actualResources.find(r => r.kind === 'Deployment' && r.metadata.name === 'api-app');
    expect(apiDeployment.spec.template.spec.containers[0].env).toEqual([
      { name: 'APP_TYPE', value: 'api' }
    ]);
    expect(apiDeployment.spec.replicas).toBe(4); // Should be patched
    
  });

  it('should handle appending to existing arrays', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: existing-env-app
    labels:
      app: existing
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: existing
    template:
      metadata:
        labels:
          app: existing
      spec:
        containers:
        - name: app
          image: nginx:1.14.2
          env:
          - name: EXISTING_VAR
            value: existing_value
          ports:
          - containerPort: 80
            name: http
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: existing-env-app
  ops:
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: NEW_VAR
        value: new_value
    - op: add
      path: /spec/template/spec/containers/0/ports/-
      value:
        containerPort: 8080
        name: metrics
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(1);
    
    const deployment = actualResources[0];
    
    // Check that new environment variable was appended to existing ones
    expect(deployment.spec.template.spec.containers[0].env).toEqual([
      { name: 'EXISTING_VAR', value: 'existing_value' },
      { name: 'NEW_VAR', value: 'new_value' }
    ]);
    
    // Check that new port was appended to existing ones
    expect(deployment.spec.template.spec.containers[0].ports).toEqual([
      { containerPort: 80, name: 'http' },
      { containerPort: 8080, name: 'metrics' }
    ]);
    
  });

  it('should remove object properties', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sDeployment:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: nginx-deployment
    labels:
      app: nginx
      version: v1.0
      environment: production
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
          resources:
            requests:
              memory: "64Mi"
              cpu: "250m"
            limits:
              memory: "128Mi"
              cpu: "500m"
          
patchs:
- op: remove
  path: /metadata/labels/version
- op: remove
  path: /metadata/labels/environment
- op: remove
  path: /spec/template/spec/containers/0/resources/limits
    `,
      template: printOutput(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // Expected object after removing properties
    const expectedObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'nginx-deployment',
        labels: {
          app: 'nginx'
          // version and environment should be removed
        }
      },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: {
            app: 'nginx'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'nginx'
            }
          },
          spec: {
            containers: [
              {
                name: 'nginx',
                image: 'nginx:1.14.2',
                resources: {
                  requests: {
                    memory: '64Mi',
                    cpu: '250m'
                  }
                  // limits should be removed
                }
              }
            ]
          }
        }
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should remove array elements by index', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sDeployment:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: nginx-deployment
    labels:
      app: nginx
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
          env:
          - name: ENV1
            value: value1
          - name: ENV2
            value: value2
          - name: ENV3
            value: value3
          ports:
          - containerPort: 80
            name: http
          - containerPort: 443
            name: https
          - containerPort: 8080
            name: metrics
          
patchs:
- op: remove
  path: /spec/template/spec/containers/0/env/1
- op: remove
  path: /spec/template/spec/containers/0/ports/0
    `,
      template: printOutput(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // Expected object after removing array elements
    const expectedObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'nginx-deployment',
        labels: {
          app: 'nginx'
        }
      },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: {
            app: 'nginx'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'nginx'
            }
          },
          spec: {
            containers: [
              {
                name: 'nginx',
                image: 'nginx:1.14.2',
                env: [
                  { name: 'ENV1', value: 'value1' },
                  // ENV2 (index 1) should be removed
                  { name: 'ENV3', value: 'value3' }
                ],
                ports: [
                  // port 80 (index 0) should be removed
                  { containerPort: 443, name: 'https' },
                  { containerPort: 8080, name: 'metrics' }
                ]
              }
            ]
          }
        }
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should combine add and remove operations', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sDeployment:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: nginx-deployment
    labels:
      app: nginx
      version: old
      environment: staging
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
          env:
          - name: OLD_VAR
            value: old_value
          
patchs:
- op: remove
  path: /metadata/labels/version
- op: remove
  path: /metadata/labels/environment
- op: add
  path: /metadata/labels/version
  value: "v2.0"
- op: add
  path: /metadata/labels/environment
  value: production
- op: remove
  path: /spec/template/spec/containers/0/env/0
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: NEW_VAR
    value: new_value
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: ANOTHER_VAR
    value: another_value
    `,
      template: printOutput(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // Expected object after combined operations
    const expectedObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'nginx-deployment',
        labels: {
          app: 'nginx',
          version: 'v2.0',  // removed old, added new
          environment: 'production'  // removed staging, added production
        }
      },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: {
            app: 'nginx'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'nginx'
            }
          },
          spec: {
            containers: [
              {
                name: 'nginx',
                image: 'nginx:1.14.2',
                env: [
                  // OLD_VAR removed, new vars added
                  { name: 'NEW_VAR', value: 'new_value' },
                  { name: 'ANOTHER_VAR', value: 'another_value' }
                ]
              }
            ]
          }
        }
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should handle remove operations in targeted patches', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-nginx
    labels:
      app: nginx
      version: old
      environment: dev
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
          env:
          - name: DEBUG
            value: "true"
          - name: LOG_LEVEL
            value: info
- apiVersion: v1
  kind: Service
  metadata:
    name: my-service
    labels:
      app: nginx
      version: old
  spec:
    selector:
      app: nginx
    ports:
    - port: 80
      targetPort: 80
    - port: 443
      targetPort: 443
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: my-nginx
  ops:
    - op: remove
      path: /metadata/labels/version
    - op: remove
      path: /metadata/labels/environment
    - op: add
      path: /metadata/labels/version
      value: "v2.0"
    - op: remove
      path: /spec/template/spec/containers/0/env/0
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: PRODUCTION
        value: "true"
- target:
    group: ""
    version: v1
    kind: Service
    name: my-service
  ops:
    - op: remove
      path: /metadata/labels/version
    - op: remove
      path: /spec/ports/1
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(2);
    
    // Check that my-nginx Deployment was patched
    const deployment = actualResources.find(r => r.kind === 'Deployment' && r.metadata.name === 'my-nginx');
    expect(deployment.metadata.labels.app).toBe('nginx');
    expect(deployment.metadata.labels.version).toBe('v2.0'); // replaced
    expect(deployment.metadata.labels.environment).toBeUndefined(); // removed
    expect(deployment.spec.template.spec.containers[0].env).toEqual([
      // DEBUG removed, LOG_LEVEL kept, PRODUCTION added
      { name: 'LOG_LEVEL', value: 'info' },
      { name: 'PRODUCTION', value: 'true' }
    ]);
    
    // Check that my-service Service was patched
    const service = actualResources.find(r => r.kind === 'Service' && r.metadata.name === 'my-service');
    expect(service.metadata.labels.app).toBe('nginx');
    expect(service.metadata.labels.version).toBeUndefined(); // removed
    expect(service.spec.ports).toEqual([
      // port 443 (index 1) removed, only port 80 remains
      { port: 80, targetPort: 80 }
    ]);
    
  });

  it('should gracefully handle removing non-existent properties', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sDeployment:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: nginx-deployment
    labels:
      app: nginx
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
          
patchs:
- op: remove
  path: /metadata/labels/nonexistent
- op: remove
  path: /spec/template/spec/containers/0/env/5
- op: remove
  path: /spec/template/spec/containers/0/resources
- op: add
  path: /spec/template/spec/containers/0/env/-
  value:
    name: NEW_VAR
    value: new_value
    `,
      template: printOutput(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // Expected object - should be unchanged except for the add operation
    const expectedObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'nginx-deployment',
        labels: {
          app: 'nginx'
        }
      },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: {
            app: 'nginx'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'nginx'
            }
          },
          spec: {
            containers: [
              {
                name: 'nginx',
                image: 'nginx:1.14.2',
                env: [
                  { name: 'NEW_VAR', value: 'new_value' }
                ]
              }
            ]
          }
        }
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should apply manifest patchers using globals.patches', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: nginx-deployment
    labels:
      app: nginx
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: nginx
    template:
      metadata:
        labels:
          app: nginx
      spec:
        containers:
        - name: nginx
          image: nginx:1.14.2
          
globals:
  patches:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: nginx-deployment
    ops:
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: LOG_LEVEL
        value: debug
    - op: add
      path: /spec/replicas
      value: 5
    `,
      template: printOutputWithManifestPatchers(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // Expected object after applying the manifest patches
    const expectedObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'nginx-deployment',
        labels: {
          app: 'nginx'
        }
      },
      spec: {
        replicas: 5, // Updated by patch
        selector: {
          matchLabels: {
            app: 'nginx'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'nginx'
            }
          },
          spec: {
            containers: [
              {
                name: 'nginx',
                image: 'nginx:1.14.2',
                env: [
                  {
                    name: 'LOG_LEVEL',
                    value: 'debug'
                  }
                ]
              }
            ]
          }
        }
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should not apply manifest patchers to non-matching manifests', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: Service
  metadata:
    name: nginx-service
    labels:
      app: nginx
  spec:
    ports:
    - port: 80
      protocol: TCP
      targetPort: 80
    selector:
      app: nginx
          
globals:
  patches:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: nginx-deployment
    ops:
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: LOG_LEVEL
        value: debug
    `,
      template: printOutputWithManifestPatchers(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // Expected object should be unchanged since Service doesn't match Deployment target
    const expectedObject = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'nginx-service',
        labels: {
          app: 'nginx'
        }
      },
      spec: {
        ports: [
          {
            port: 80,
            protocol: 'TCP',
            targetPort: 80
          }
        ],
        selector: {
          app: 'nginx'
        }
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should apply manifest patchers without specifying group and version in target', async () => {
   
    const result = testHelm({
      valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: my-config
    labels:
      app: myapp
  data:
    config.properties: |
      key1=value1
      key2=value2
          
globals:
  patches:
  - target:
      kind: ConfigMap
      name: my-config
    ops:
    - op: add
      path: /data/newKey
      value: newValue
    - op: add
      path: /metadata/labels/environment
      value: production
    `,
      template: printOutputWithManifestPatchers(helmChartRaw),
    });
    
    // Parse the YAML output to get the actual object
    const lines = result.split('\n');
    const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
    const yamlContent = lines.slice(yamlStart).join('\n');
    const actualObject = parseYaml(yamlContent);
    
    // With enhanced targeting, omitted group and version act as wildcards
    const expectedObject = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'my-config',
        labels: {
          app: 'myapp',
          environment: 'production' // Should be added
        }
      },
      data: {
        'config.properties': 'key1=value1\nkey2=value2\n    \n',
        newKey: 'newValue' // Should be added
      }
    };
    
    expect(actualObject).toEqual(expectedObject);

  });

  it('should support regex matching in kind field', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-deployment
    labels:
      app: web
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: web
    template:
      metadata:
        labels:
          app: web
      spec:
        containers:
        - name: web
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: DaemonSet
  metadata:
    name: log-daemonset
    labels:
      app: logging
  spec:
    selector:
      matchLabels:
        app: logging
    template:
      metadata:
        labels:
          app: logging
      spec:
        containers:
        - name: logger
          image: fluentd:latest
- apiVersion: v1
  kind: Service
  metadata:
    name: web-service
    labels:
      app: web
  spec:
    selector:
      app: web
    ports:
    - port: 80
          
patchs:
- target:
    group: apps
    version: v1
    kind: ".*Set$"  # Should match DaemonSet but not Deployment
  ops:
    - op: add
      path: /metadata/labels/matched-by-regex
      value: "true"
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(3);
    
    // DaemonSet should be patched (matches .*Set$ regex)
    const daemonSet = actualResources.find(r => r.kind === 'DaemonSet');
    expect(daemonSet.metadata.labels['matched-by-regex']).toBe('true');
    
    // Deployment should NOT be patched (doesn't match .*Set$ regex)
    const deployment = actualResources.find(r => r.kind === 'Deployment');
    expect(deployment.metadata.labels['matched-by-regex']).toBeUndefined(); // Should remain undefined
    
    // Service should NOT be patched (wrong group)
    const service = actualResources.find(r => r.kind === 'Service');
    expect(service.metadata.labels['matched-by-regex']).toBeUndefined(); // Should remain undefined
    
  });

  it('should support regex matching in name field', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-frontend
    labels:
      app: frontend
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: frontend
    template:
      metadata:
        labels:
          app: frontend
      spec:
        containers:
        - name: frontend
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-backend
    labels:
      app: backend
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: backend
    template:
      metadata:
        labels:
          app: backend
      spec:
        containers:
        - name: backend
          image: node:14
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: api-service
    labels:
      app: api
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: api
    template:
      metadata:
        labels:
          app: api
      spec:
        containers:
        - name: api
          image: python:3.9
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: "^web-.*"  # Should match web-frontend and web-backend but not api-service
  ops:
    - op: add
      path: /metadata/labels/web-component
      value: "true"
    - op: add
      path: /metadata/unrelated/web-component
      value: "true"
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(3);
    
    const webFrontend = actualResources.find(r => r.metadata.name === 'web-frontend');
    const webBackend = actualResources.find(r => r.metadata.name === 'web-backend');
    const apiService = actualResources.find(r => r.metadata.name === 'api-service');
    
    // Both web- prefixed deployments should be patched
    expect(webFrontend.metadata.labels['web-component']).toBe('true');
    expect(webBackend.metadata.labels['web-component']).toBe('true');
    expect(apiService.metadata.labels['web-component']).toBeUndefined(); // Should remain undefined
    
    expect(webFrontend.metadata.unrelated['web-component']).toBe('true');
  });

  it('should support annotationSelector matching', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: v1
  kind: Service
  metadata:
    name: web-service
    labels:
      app: web
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-type: nlb
      environment: production
  spec:
    type: LoadBalancer
    selector:
      app: web
    ports:
    - port: 80
- apiVersion: v1
  kind: Service
  metadata:
    name: api-service
    labels:
      app: api
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-type: alb
      environment: staging
  spec:
    type: LoadBalancer
    selector:
      app: api
    ports:
    - port: 8080
- apiVersion: v1
  kind: Service
  metadata:
    name: internal-service
    labels:
      app: internal
    annotations:
      environment: production
  spec:
    type: ClusterIP
    selector:
      app: internal
    ports:
    - port: 9000
          
patchs:
- target:
    group: ""
    version: v1
    kind: Service
    annotationSelector: "service.beta.kubernetes.io/aws-load-balancer-type,environment=production"
  ops:
    - op: add
      path: /metadata/labels/aws-production-lb
      value: "true"
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(3);
    
    const webService = actualResources.find(r => r.metadata.name === 'web-service');
    const apiService = actualResources.find(r => r.metadata.name === 'api-service');
    const internalService = actualResources.find(r => r.metadata.name === 'internal-service');
    
    // Only web-service should be patched (has both required annotations)
    expect(webService.metadata.labels['aws-production-lb']).toBe('true'); // Has both annotations
    expect(apiService.metadata.labels['aws-production-lb']).toBeUndefined(); // Wrong environment
    expect(internalService.metadata.labels['aws-production-lb']).toBeUndefined(); // Missing AWS annotation
    
  });

  it('should support namespace filtering', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-app
    namespace: production
    labels:
      app: web
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: web
    template:
      metadata:
        labels:
          app: web
      spec:
        containers:
        - name: web
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-app
    namespace: staging
    labels:
      app: web
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: web
    template:
      metadata:
        labels:
          app: web
      spec:
        containers:
        - name: web
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-app
    namespace: development
    labels:
      app: web
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: web
    template:
      metadata:
        labels:
          app: web
      spec:
        containers:
        - name: web
          image: nginx:1.14.2
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: web-app
    namespace: production  # Should only match the production deployment
  ops:
    - op: add
      path: /metadata/labels/environment
      value: production
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(3);
    
    const prodDeployment = actualResources.find(r => r.metadata.namespace === 'production');
    const stagingDeployment = actualResources.find(r => r.metadata.namespace === 'staging');
    const devDeployment = actualResources.find(r => r.metadata.namespace === 'development');
     
    // Only production deployment should be patched
    expect(prodDeployment.metadata.labels.environment).toBe('production'); // Only this one should be patched
    expect(stagingDeployment.metadata.labels.environment).toBeUndefined();
    expect(devDeployment.metadata.labels.environment).toBeUndefined();
    
  });

  it('should support combined target selectors (AND logic)', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-frontend
    namespace: production
    labels:
      app: web
      tier: frontend
      version: v2
    annotations:
      deploy.version: "2.0"
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: web
    template:
      metadata:
        labels:
          app: web
      spec:
        containers:
        - name: frontend
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-backend
    namespace: production
    labels:
      app: web
      tier: backend
      version: v1
    annotations:
      deploy.version: "1.0"
  spec:
    replicas: 2
    selector:
      matchLabels:
        app: web
    template:
      metadata:
        labels:
          app: web
      spec:
        containers:
        - name: backend
          image: node:14
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-frontend
    namespace: staging
    labels:
      app: web
      tier: frontend
      version: v2
    annotations:
      deploy.version: "2.0"
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: web
    template:
      metadata:
        labels:
          app: web
      spec:
        containers:
        - name: frontend
          image: nginx:1.14.2
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: "^web-.*"                          # Must match name pattern
    namespace: production                    # Must be in production namespace
    labelSelector: "app=web,tier=frontend"  # Must have specific labels
    annotationSelector: "deploy.version=2.0" # Must have specific annotation
  ops:
    - op: add
      path: /metadata/labels/fully-matched
      value: "true"
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(3);
    
    const prodFrontend = actualResources.find(r => 
      r.metadata.name === 'web-frontend' && r.metadata.namespace === 'production'
    );
    const prodBackend = actualResources.find(r => 
      r.metadata.name === 'web-backend' && r.metadata.namespace === 'production'
    );
    const stagingFrontend = actualResources.find(r => 
      r.metadata.name === 'web-frontend' && r.metadata.namespace === 'staging'
    );
    
    // Only prodFrontend should match ALL conditions
    expect(prodFrontend.metadata.labels['fully-matched']).toBe('true');
    expect(prodBackend.metadata.labels['fully-matched']).toBeUndefined(); // tier=backend doesn't match
    expect(stagingFrontend.metadata.labels['fully-matched']).toBeUndefined(); // namespace=staging doesn't match
    
  });

  it('should act as wildcard when target fields are omitted', async () => {
    const result = testHelm({
      valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: app1
    labels:
      type: application
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: app1
    template:
      metadata:
        labels:
          app: app1
      spec:
        containers:
        - name: app
          image: nginx:1.14.2
- apiVersion: batch/v1
  kind: Job
  metadata:
    name: job1
    labels:
      type: application
  spec:
    template:
      spec:
        containers:
        - name: job
          image: busybox:latest
        restartPolicy: Never
- apiVersion: v1
  kind: Service
  metadata:
    name: svc1
    labels:
      type: application
  spec:
    selector:
      app: app1
    ports:
    - port: 80
          
patchs:
- target:
    labelSelector: "type=application"  # Only labelSelector specified - should match all resources with this label regardless of group/version/kind
  ops:
    - op: add
      path: /metadata/labels/wildcard-matched
      value: "true"
    `,
      template: printOutput2(helmChartRaw),
    });
    
    // Parse the YAML output to get all resources
    const documents = result.split('---').filter(doc => doc.trim());
    const actualResources = documents.map(doc => parseYaml(doc.trim())).filter(obj => obj);
    
    expect(actualResources).toHaveLength(3);
    
    const deployment = actualResources.find(r => r.kind === 'Deployment');
    const job = actualResources.find(r => r.kind === 'Job');
    const service = actualResources.find(r => r.kind === 'Service');
    
    // All resources should match because only labelSelector is specified and all have type=application
    expect(deployment.metadata.labels['wildcard-matched']).toBe('true');
    expect(job.metadata.labels['wildcard-matched']).toBe('true');
    expect(service.metadata.labels['wildcard-matched']).toBe('true');
    
  });



});

function testHelm({valuesYaml , template }:{valuesYaml:string, template:string}):string{
  // create a random name folder in /tmp
  const tmpFolder = path.join(os.tmpdir(), Math.random().toString(36).substring(2, 15));
  // create folder
  fsDefault.mkdirSync(tmpFolder);
  // write file named values.yaml with content:
  fsDefault.writeFileSync(path.join(tmpFolder, 'values.yaml'), valuesYaml);
  // create templates folder
  fsDefault.mkdirSync(path.join(tmpFolder, 'templates'));
  // write file named test.yaml with content:
  fsDefault.writeFileSync(path.join(tmpFolder, 'templates', 'test.yaml'), template);
  // create Chart.yaml with content:
  fsDefault.writeFileSync(path.join(tmpFolder, 'Chart.yaml'), `
    name: test-chart
    version: 1.0.0
    appVersion: 1.0.0
  `);
  // create kustomization.yaml with content:
  const result = execSync(`helm template test-chart .` , {
    cwd: tmpFolder,
  });
  return result.toString();
}
