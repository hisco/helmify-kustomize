import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
const { execSync } = require('child_process');
import * as os from 'os';
import { chartUtils } from './templates/helm-utils';

const helmChartRaw = chartUtils('chartUtils');

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

describe('Target Filtering Verification - Table Conditions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Target Matching', () => {
    
    it('group/version/kind/name exact matching works', async () => {
      const result = testHelm({
        valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: apps-deployment
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: batch/v1
  kind: Job
  metadata:
    name: batch-job
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
    name: core-service
  spec:
    ports:
    - port: 80
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: apps-deployment
  ops:
    - op: add
      path: /metadata/labels/group-matched
      value: apps
- target:
    group: batch
    version: v1
    kind: Job
    name: batch-job
  ops:
    - op: add
      path: /metadata/labels/group-matched
      value: batch
- target:
    group: ""
    version: v1
    kind: Service
    name: core-service
  ops:
    - op: add
      path: /metadata/labels/group-matched
      value: core
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
      expect(actualResources).toHaveLength(3);
      
      const deployment = actualResources.find(r => r.kind === 'Deployment');
      const job = actualResources.find(r => r.kind === 'Job');
      const service = actualResources.find(r => r.kind === 'Service');
      
      // All should be patched with correct group labels
      expect(deployment.metadata.labels['group-matched']).toBe('apps');
      expect(job.metadata.labels['group-matched']).toBe('batch');
      expect(service.metadata.labels['group-matched']).toBe('core');
    });

    it('version: API version matching (v1, v1beta1, etc.)', async () => {
      const result = testHelm({
        valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: v1-deployment
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1beta1
  kind: Deployment
  metadata:
    name: v1beta1-deployment
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: v1-deployment
  ops:
    - op: add
      path: /metadata/labels/version-matched
      value: v1
- target:
    group: apps
    version: v1beta1
    kind: Deployment
    name: v1beta1-deployment
  ops:
    - op: add
      path: /metadata/labels/version-matched
      value: v1beta1
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
      expect(actualResources).toHaveLength(2);
      
      const v1Deployment = actualResources.find(r => r.metadata.name === 'v1-deployment');
      const v1beta1Deployment = actualResources.find(r => r.metadata.name === 'v1beta1-deployment');
      
      // Both should be patched with correct version labels
      expect(v1Deployment.metadata.labels['version-matched']).toBe('v1');
      expect(v1beta1Deployment.metadata.labels['version-matched']).toBe('v1beta1');
    });

    it('kind: Resource kind matching (Deployment, ConfigMap, etc.)', async () => {
      const result = testHelm({
        valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: test-deployment
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: v1
  kind: ConfigMap
  metadata:
    name: test-configmap
  data:
    key: value
- apiVersion: v1
  kind: Service
  metadata:
    name: test-service
  spec:
    ports:
    - port: 80
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: test-deployment
  ops:
    - op: add
      path: /metadata/labels/kind-matched
      value: deployment
- target:
    group: "somethingElse"
    version: v1
    kind: ConfigMap
    name: test-configmap
  ops:
    - op: add
      path: /metadata/labels/kind-matched-not-matched
      value: "not-matched"
- target:
    group: ""
    version: v1
    kind: ConfigMap
    name: test-configmap
  ops:
    - op: add
      path: /metadata/labels/kind-matched
      value: should-match
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
      expect(actualResources).toHaveLength(3);
      
      const deployment = actualResources.find(r => r.kind === 'Deployment');
      const configMap = actualResources.find(r => r.kind === 'ConfigMap');
      const service = actualResources.find(r => r.kind === 'Service');
      
      // Only targeted kinds should be patched
      expect(deployment.metadata.labels['kind-matched']).toBe('deployment');
      expect(configMap.metadata.labels['kind-matched']).toBe('should-match');
      expect(configMap.metadata.labels['kind-matched-not-matched']).toBeUndefined();
    });

    it('name: Object name exact matching', async () => {
      const result = testHelm({
        valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-app
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: api-app
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: web-app
  ops:
    - op: add
      path: /metadata/labels/name-matched
      value: "true"
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
      expect(actualResources).toHaveLength(2);
      
      const webApp = actualResources.find(r => r.metadata.name === 'web-app');
      const apiApp = actualResources.find(r => r.metadata.name === 'api-app');
      
      // Only web-app should be patched
      expect(webApp.metadata.labels['name-matched']).toBe('true');
      expect(apiApp.metadata.labels?.['name-matched'] || undefined).toBeUndefined(); // Not targeted
    });

    it('namespace: Object namespace exact matching', async () => {
        const result = testHelm({
          valuesYaml: `
  k8sResources:
  - apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: web-app
      namespace: production
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: test
      template:
        metadata:
          labels:
            app: test
        spec:
          containers:
          - name: test
            image: nginx:1.14.2
  - apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: api-app
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: test
      template:
        metadata:
          labels:
            app: test
        spec:
          containers:
          - name: test
            image: nginx:1.14.2
            
  patchs:
  - target:
      namespace: production
    ops:
      - op: add
        path: /metadata/labels/name-matched
        value: "true"
          `,
          template: printOutput2(helmChartRaw),
        });
        
        const documents = result.split('---').filter(doc => doc.trim());
        const actualResources = documents.map(doc => {
          try {
            // Remove comment lines before parsing
            const lines = doc.split('\n');
            const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
            const yamlContent = yamlLines.join('\n').trim();
            
            if (!yamlContent) return null;
            
            return parseYaml(yamlContent);
          } catch (e) {
            return null;
          }
        }).filter(obj => obj);
        
        expect(actualResources).toHaveLength(2);
        
        const webApp = actualResources.find(r => r.metadata.name === 'web-app');
        const apiApp = actualResources.find(r => r.metadata.name === 'api-app');
        
        // Only web-app should be patched
        expect(webApp.metadata.labels['name-matched']).toBe('true');
        expect(apiApp.metadata.labels?.['name-matched'] || undefined).toBeUndefined(); // Not targeted
      });

  });

  describe('Advanced Target Matching', () => {

    it('kind: Regex pattern matching (.*Set$)', async () => {
      const result = testHelm({
        valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: test-deployment
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: DaemonSet
  metadata:
    name: test-daemonset
  spec:
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: ReplicaSet
  metadata:
    name: test-replicaset
  spec:
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
          
patchs:
- target:
    group: apps
    version: v1
    kind: ".*Set$"  # Should match DaemonSet and ReplicaSet but not Deployment
    name: ""
  ops:
    - op: add
      path: /metadata/labels/regex-matched
      value: "true"
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
      expect(actualResources).toHaveLength(3);
      
      const deployment = actualResources.find(r => r.kind === 'Deployment');
      const daemonSet = actualResources.find(r => r.kind === 'DaemonSet');
      const replicaSet = actualResources.find(r => r.kind === 'ReplicaSet');
      
      // Currently regex is NOT supported - all should be undefined
      expect(deployment.metadata.labels?.['regex-matched']).toBeUndefined();
      expect(daemonSet.metadata.labels?.['regex-matched']).toBeUndefined();
      expect(replicaSet.metadata.labels?.['regex-matched']).toBeUndefined();
      
      // When regex is implemented, this should be:
      // expect(deployment.metadata.labels?.['regex-matched']).toBeUndefined(); // Doesn't match .*Set$
      // expect(daemonSet.metadata.labels['regex-matched']).toBe('true'); // Matches .*Set$
      // expect(replicaSet.metadata.labels['regex-matched']).toBe('true'); // Matches .*Set$
    });

    it('name: Go-regex pattern matching (^web-.*)', async () => {
      const result = testHelm({
        valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-frontend
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-backend
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: api-service
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: "^web-.*"  # Should match web-frontend and web-backend but not api-service
  ops:
    - op: add
      path: /metadata/labels/name-regex-matched
      value: "true"
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
      expect(actualResources).toHaveLength(3);
      
      const webFrontend = actualResources.find(r => r.metadata.name === 'web-frontend');
      const webBackend = actualResources.find(r => r.metadata.name === 'web-backend');
      const apiService = actualResources.find(r => r.metadata.name === 'api-service');
      
      // Name regex is now working correctly
      expect(webFrontend.metadata.labels['name-regex-matched']).toBe('true'); // Matches ^web-.*
      expect(webBackend.metadata.labels['name-regex-matched']).toBe('true'); // Matches ^web-.*
      expect(apiService.metadata.labels?.['name-regex-matched']).toBeUndefined(); // Doesn't match ^web-.*
    });

    it('namespace: Namespace filtering works correctly', async () => {
      const result = testHelm({
        valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: test-app
    namespace: production
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: test-app
    namespace: staging
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: test-app
    namespace: production  # Should only match production namespace
  ops:
    - op: add
      path: /metadata/labels/namespace-matched
      value: production
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
      expect(actualResources).toHaveLength(2);
      
      const prodDeployment = actualResources.find(r => r.metadata.namespace === 'production');
      const stagingDeployment = actualResources.find(r => r.metadata.namespace === 'staging');
      
      // Namespace filtering now works correctly - only production deployment gets patched
      expect(prodDeployment.metadata.labels['namespace-matched']).toBe('production'); // Only this should match
      expect(stagingDeployment.metadata.labels?.['namespace-matched']).toBeUndefined(); // This should not match
    });

    it('labelSelector: Kubernetes label selector', async () => {
      const result = testHelm({
        valuesYaml: `
k8sResources:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: frontend-app
    labels:
      app: web
      tier: frontend
      env: production
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: backend-app
    labels:
      app: web
      tier: backend
      env: production
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: database-app
    labels:
      app: db
      tier: database
      env: production
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
          
patchs:
- target:
    labelSelector: "app=web,tier in (frontend,backend)"  # Should match frontend and backend but not database
  ops:
    - op: add
      path: /metadata/labels/label-selector-matched
      value: "true"
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
      expect(actualResources).toHaveLength(3);
      
      const frontend = actualResources.find(r => r.metadata.name === 'frontend-app');
      const backend = actualResources.find(r => r.metadata.name === 'backend-app');
      const database = actualResources.find(r => r.metadata.name === 'database-app');
      
      // Currently labelSelector is NOT supported - all should be undefined
      expect(frontend.metadata.labels?.['label-selector-matched']).toBeUndefined();
      expect(backend.metadata.labels?.['label-selector-matched']).toBeUndefined();
      expect(database.metadata.labels?.['label-selector-matched']).toBeUndefined();
      
      // When labelSelector is implemented, this should be:
      // expect(frontend.metadata.labels['label-selector-matched']).toBe('true'); // Matches app=web,tier in (frontend,backend)
      // expect(backend.metadata.labels['label-selector-matched']).toBe('true'); // Matches app=web,tier in (frontend,backend)
      // expect(database.metadata.labels?.['label-selector-matched']).toBeUndefined(); // Doesn't match (app=db)
    });

//     it('❌ annotationSelector: Annotation selector - NOT IMPLEMENTED', async () => {
//       const result = testHelm({
//         valuesYaml: `
// k8sResources:
// - apiVersion: v1
//   kind: Service
//   metadata:
//     name: web-service
//     annotations:
//       service.beta.kubernetes.io/aws-load-balancer-type: nlb
//       environment: production
//   spec:
//     ports:
//     - port: 80
// - apiVersion: v1
//   kind: Service
//   metadata:
//     name: api-service
//     annotations:
//       service.beta.kubernetes.io/aws-load-balancer-type: alb
//       environment: staging
//   spec:
//     ports:
//     - port: 8080
// - apiVersion: v1
//   kind: Service
//   metadata:
//     name: internal-service
//     annotations:
//       environment: production
//   spec:
//     ports:
//     - port: 9000
          
// patchs:
// - target:
//     annotationSelector: "service.beta.kubernetes.io/aws-load-balancer-type,environment=production"
//   ops:
//     - op: add
//       path: /metadata/labels/annotation-selector-matched
//       value: "true"
//         `,
//         template: printOutput2(helmChartRaw),
//       });
      
//       const documents = result.split('---').filter(doc => doc.trim());
//       const actualResources = documents.map(doc => {
//         try {
//           // Remove comment lines before parsing
//           const lines = doc.split('\n');
//           const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
//           const yamlContent = yamlLines.join('\n').trim();
          
//           if (!yamlContent) return null;
          
//           return parseYaml(yamlContent);
//         } catch (e) {
//           return null;
//         }
//       }).filter(obj => obj);
      
//       expect(actualResources).toHaveLength(3);
      
//       const webService = actualResources.find(r => r.metadata.name === 'web-service');
//       const apiService = actualResources.find(r => r.metadata.name === 'api-service');
//       const internalService = actualResources.find(r => r.metadata.name === 'internal-service');
      
//       // Currently annotationSelector is NOT supported - all should be undefined
//       expect(webService.metadata.labels?.['annotation-selector-matched']).toBeUndefined();
//       expect(apiService.metadata.labels?.['annotation-selector-matched']).toBeUndefined();
//       expect(internalService.metadata.labels?.['annotation-selector-matched']).toBeUndefined();
      
//       // When annotationSelector is implemented, this should be:
//       // expect(webService.metadata.labels['annotation-selector-matched']).toBe('true'); // Has both annotations
//       // expect(apiService.metadata.labels?.['annotation-selector-matched']).toBeUndefined(); // Wrong environment
//       // expect(internalService.metadata.labels?.['annotation-selector-matched']).toBeUndefined(); // Missing AWS annotation
//     });

  });

  describe('Wildcard Behavior', () => {

    it('Wildcard: Omitted fields should act as "match all"', async () => {
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
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
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
    ports:
    - port: 80
          
patchs:
- target: {}  # No fields specified - should match ALL resources (wildcard behavior)
  ops:
    - op: add
      path: /metadata/labels/wildcard-matched
      value: "true"
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
      expect(actualResources).toHaveLength(3);
      
      const deployment = actualResources.find(r => r.kind === 'Deployment');
      const job = actualResources.find(r => r.kind === 'Job');
      const service = actualResources.find(r => r.kind === 'Service');
      
      // Wildcard behavior now works correctly - omitted fields match all resources
      expect(deployment.metadata.labels['wildcard-matched']).toBe('true');
      expect(job.metadata.labels['wildcard-matched']).toBe('true');
      expect(service.metadata.labels['wildcard-matched']).toBe('true');
    });

  });

  describe('AND Logic', () => {

    it('Combined conditions should be AND-ed together - PARTIAL IMPLEMENTATION', async () => {
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
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-backend
    namespace: production
    labels:
      app: web
      tier: backend
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: web-frontend
    namespace: staging
    labels:
      app: web
      tier: frontend
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: test
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: test
          image: nginx:1.14.2
          
patchs:
- target:
    group: apps
    version: v1
    kind: Deployment
    name: web-frontend    # Specific name
    namespace: production # Specific namespace - this condition is currently IGNORED
  ops:
    - op: add
      path: /metadata/labels/and-logic-matched
      value: "true"
        `,
        template: printOutput2(helmChartRaw),
      });
      
      const documents = result.split('---').filter(doc => doc.trim());
      const actualResources = documents.map(doc => {
        let yamlContent = '';
        try {
          // Remove comment lines before parsing
          const lines = doc.split('\n');
          const yamlLines = lines.filter(line => !line.trim().startsWith('#'));
          yamlContent = yamlLines.join('\n').trim();

          if (!yamlContent) return null;

          return parseYaml(yamlContent);
        } catch (e) {
          // Only return null for truly empty content
          if (yamlContent) {
            console.error('Failed to parse YAML content:', yamlContent.substring(0, 100));
            console.error('Parse error:', e);
            throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
          }
          return null;
        }
      }).filter(obj => obj);
      
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
      
      // Currently namespace is ignored, so both web-frontend deployments get patched
      expect(prodFrontend.metadata.labels['and-logic-matched']).toBe('true');
      expect(prodBackend.metadata.labels?.['and-logic-matched']).toBeUndefined(); // Different name
      expect(stagingFrontend.metadata.labels?.['and-logic-matched']).toBeUndefined(); // Should be undefined when namespace works
      
      // When proper AND logic is implemented:
      // expect(prodFrontend.metadata.labels['and-logic-matched']).toBe('true'); // Matches ALL conditions
      // expect(prodBackend.metadata.labels?.['and-logic-matched']).toBeUndefined(); // Wrong name
      // expect(stagingFrontend.metadata.labels?.['and-logic-matched']).toBeUndefined(); // Wrong namespace
    });

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