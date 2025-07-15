import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
const { execSync } = require('child_process');
import * as os from 'os';
import { chartUtils } from './templates/helm-utils';

const helmChartRaw = chartUtils('chartUtils');

function createNamespaceTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.setNamespace" (dict "manifest" $manifest "globals" .Values.globals) }}
{{- toYaml $manifest.spec }}
  `;
}

function createImageUpdateTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.updataImages" (dict "manifest" $manifest "images" .Values.images) }}
{{- toYaml $manifest.spec }}
  `;
}

function createNamePrefixTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.setNamePrefix" (dict "manifest" $manifest "globals" .Values.globals) }}
{{- toYaml $manifest.spec }}
  `;
}

function createNameSuffixTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.setNameSuffix" (dict "manifest" $manifest "globals" .Values.globals) }}
{{- toYaml $manifest.spec }}
  `;
}

function createLabelsTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.labels" (dict "manifest" $manifest "globals" .Values.globals) }}
{{- toYaml $manifest.spec }}
  `;
}

function createAnnotationsTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.annotations" (dict "manifest" $manifest "globals" .Values.globals) }}
{{- toYaml $manifest.spec }}
  `;
}

function createStandardHeadersTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.addStandardHeaders" (dict "manifest" $manifest "globals" .Values.globals "Values" .Values "Chart" .Chart "Release" .Release) }}
{{- toYaml $manifest.spec }}
  `;
}

function createConfigMapUpdateTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.updateConfigMap" (dict "manifest" $manifest "name" .Values.configMapName "data" .Values.configMapData) }}
{{- toYaml $manifest.spec }}
  `;
}

function createImageParsingTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
name: {{ include "chartUtils.image.name" .Values.imageUrl }}
tag: "{{ include "chartUtils.image.tag" .Values.imageUrl }}"
digest: "{{ include "chartUtils.image.digest" .Values.imageUrl }}"
  `;
}

describe('Chart Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chartUtils.setNamespace', () => {
    it('should set namespace when globals.namespace is provided', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
    labels:
      app: my-app
  spec:
    replicas: 1

globals:
  namespace: my-custom-namespace
        `,
        template: createNamespaceTestTemplate(helmChartRaw),
      });
      
      // Parse the YAML output to get the actual object
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.namespace).toBe('my-custom-namespace');
      expect(actualObject.metadata.name).toBe('my-app');
      expect(actualObject.metadata.labels.app).toBe('my-app');
    });

    it('should not modify manifest when globals.namespace is not provided', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: Service
  metadata:
    name: my-service
    labels:
      app: my-app
  spec:
    selector:
      app: my-app
    ports:
    - port: 80

globals: {}
        `,
        template: createNamespaceTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.namespace).toBeUndefined();
      expect(actualObject.metadata.name).toBe('my-service');
      expect(actualObject.spec.ports[0].port).toBe(80);
    });

    it('should work with ConfigMap', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: my-config
  data:
    key1: value1
    key2: value2

globals:
  namespace: config-namespace
        `,
        template: createNamespaceTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.namespace).toBe('config-namespace');
      expect(actualObject.metadata.name).toBe('my-config');
      expect(actualObject.data.key1).toBe('value1');
      expect(actualObject.data.key2).toBe('value2');
    });

    it('should not modify manifest when globals has no namespace', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    replicas: 2
    
globals:
  # No namespace property
  someOtherProperty: value
        `,
        template: createNamespaceTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.namespace).toBeUndefined();
      expect(actualObject.metadata.name).toBe('my-app');
      expect(actualObject.spec.replicas).toBe(2);
    });
  });

  describe('chartUtils.setNamePrefix', () => {
    it('should add prefix to existing name', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
    labels:
      app: my-app
  spec:
    replicas: 1

globals:
  namePrefix: "dev-"
        `,
        template: createNamePrefixTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.name).toBe('dev-my-app');
      expect(actualObject.metadata.labels.app).toBe('my-app');
    });

    it('should set namePrefix when no existing name', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: Service
  metadata:
    labels:
      app: my-app
  spec:
    selector:
      app: my-app
    ports:
    - port: 80

globals:
  namePrefix: "production-"
        `,
        template: createNamePrefixTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.name).toBe('production-');
    });

    it('should not modify manifest when namePrefix is not provided', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    replicas: 2

globals: {}
        `,
        template: createNamePrefixTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.name).toBe('my-app');
    });
  });

  describe('chartUtils.setNameSuffix', () => {
    it('should add suffix to existing name', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
    labels:
      app: my-app
  spec:
    replicas: 1

globals:
  nameSuffix: "-v2"
        `,
        template: createNameSuffixTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.name).toBe('my-app-v2');
      expect(actualObject.metadata.labels.app).toBe('my-app');
    });

    it('should set nameSuffix when no existing name', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: Service
  metadata:
    labels:
      app: my-app
  spec:
    selector:
      app: my-app
    ports:
    - port: 80

globals:
  nameSuffix: "-prod"
        `,
        template: createNameSuffixTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.name).toBe('-prod');
    });

    it('should not modify manifest when nameSuffix is not provided', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    replicas: 2

globals: {}
        `,
        template: createNameSuffixTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.name).toBe('my-app');
    });
  });

  describe('chartUtils.labels', () => {
    it('should add labels to existing labels', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
    labels:
      app: my-app
      version: v1.0
  spec:
    replicas: 1

globals:
  labels:
    environment: production
    team: backend
        `,
        template: createLabelsTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.labels).toEqual({
        app: 'my-app',
        version: 'v1.0',
        environment: 'production',
        team: 'backend'
      });
    });

    it('should create labels when none exist', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: Service
  metadata:
    name: my-service
  spec:
    selector:
      app: my-app
    ports:
    - port: 80

globals:
  labels:
    environment: staging
    owner: team-a
        `,
        template: createLabelsTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.labels).toEqual({
        environment: 'staging',
        owner: 'team-a'
      });
    });

    it('should not modify manifest when labels is not provided', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
    labels:
      app: my-app
  spec:
    replicas: 2

globals: {}
        `,
        template: createLabelsTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.labels).toEqual({
        app: 'my-app'
      });
    });
  });

  describe('chartUtils.annotations', () => {
    it('should add annotations to existing annotations', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
    annotations:
      deployment.kubernetes.io/revision: "1"
  spec:
    replicas: 1

globals:
  annotations:
    example.com/owner: "team-backend"
    example.com/environment: "production"
        `,
        template: createAnnotationsTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.annotations).toEqual({
        'deployment.kubernetes.io/revision': '1',
        'example.com/owner': 'team-backend',
        'example.com/environment': 'production'
      });
    });

    it('should create annotations when none exist', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: Service
  metadata:
    name: my-service
  spec:
    selector:
      app: my-app
    ports:
    - port: 80

globals:
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    example.com/prometheus-scrape: "true"
        `,
        template: createAnnotationsTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.annotations).toEqual({
        'service.beta.kubernetes.io/aws-load-balancer-type': 'nlb',
        'example.com/prometheus-scrape': 'true'
      });
    });

    it('should not modify manifest when annotations is not provided', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
    annotations:
      existing.annotation: "value"
  spec:
    replicas: 2

globals: {}
        `,
        template: createAnnotationsTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.annotations).toEqual({
        'existing.annotation': 'value'
      });
    });
  });

  describe('chartUtils.addStandardHeaders', () => {
    it('should add standard Helm labels when enabled', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
    labels:
      app: my-app
  spec:
    replicas: 1

overlay: "production"
globals:
  addStandardHeaders: true
        `,
        template: createStandardHeadersTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.labels).toEqual({
        app: 'my-app',
        'helmify-kustomize.local/overlay': 'production',
        'app.kubernetes.io/name': 'test-chart',
        'app.kubernetes.io/instance': 'test-chart',
        'app.kubernetes.io/version': '1.0.0'
      });
    });

    it('should add standard Helm labels by default when globals not provided', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: Service
  metadata:
    name: my-service
  spec:
    selector:
      app: my-app
    ports:
    - port: 80

overlay: "development"
        `,
        template: createStandardHeadersTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.labels).toEqual({
        'helmify-kustomize.local/overlay': 'development',
        'app.kubernetes.io/name': 'test-chart',
        'app.kubernetes.io/instance': 'test-chart',
        'app.kubernetes.io/version': '1.0.0'
      });
    });

    it('should not add standard headers when explicitly disabled', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
    labels:
      app: my-app
  spec:
    replicas: 1

overlay: "staging"
globals:
  addStandardHeaders: false
        `,
        template: createStandardHeadersTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.labels).toEqual({
        app: 'my-app'
      });
    });
  });

  describe('chartUtils.updateConfigMap', () => {
    it('should update ConfigMap data when name matches', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: my-config
  data:
    key1: original-value1
    key2: original-value2

configMapName: "my-config"
configMapData:
  key2: updated-value2
  key3: new-value3
        `,
        template: createConfigMapUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.data).toEqual({
        key1: 'original-value1',
        key2: 'updated-value2',
        key3: 'new-value3'
      });
    });

    it('should create data section if ConfigMap has no data', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: empty-config

configMapName: "empty-config"
configMapData:
  newKey1: newValue1
  newKey2: newValue2
        `,
        template: createConfigMapUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.data).toEqual({
        newKey1: 'newValue1',
        newKey2: 'newValue2'
      });
    });

    it('should not modify ConfigMap when name does not match', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: different-config
  data:
    key1: original-value1

configMapName: "my-config"
configMapData:
  key1: updated-value1
        `,
        template: createConfigMapUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.data).toEqual({
        key1: 'original-value1'
      });
    });

    it('should not modify non-ConfigMap resources', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-config
  spec:
    replicas: 1

configMapName: "my-config"
configMapData:
  key1: value1
        `,
        template: createConfigMapUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.spec.replicas).toBe(1);
      expect(actualObject.data).toBeUndefined();
    });
  });

  describe('chartUtils.image parsing functions', () => {
    it('should parse simple image name', async () => {
      const result = testHelm({
        valuesYaml: `
imageUrl: "nginx:1.14.2"
        `,
        template: createImageParsingTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n').filter(line => line.trim());
      const nameMatch = lines.find(line => line.startsWith('name:'));
      const tagMatch = lines.find(line => line.startsWith('tag:'));
      const digestMatch = lines.find(line => line.startsWith('digest:'));
      
      expect(nameMatch).toBe('name: nginx');
      expect(tagMatch).toBe('tag: ":1.14.2"');
      expect(digestMatch).toBe('digest: ""');
    });

    it('should parse image with digest', async () => {
      const result = testHelm({
        valuesYaml: `
imageUrl: "nginx:1.14.2@sha256:abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab"
        `,
        template: createImageParsingTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n').filter(line => line.trim());
      const nameMatch = lines.find(line => line.startsWith('name:'));
      const tagMatch = lines.find(line => line.startsWith('tag:'));
      const digestMatch = lines.find(line => line.startsWith('digest:'));
      
      expect(nameMatch).toBe('name: nginx');
      expect(tagMatch).toBe('tag: ":1.14.2"');
      expect(digestMatch).toBe('digest: "@sha256:abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab"');
    });

    it('should parse image without tag (defaults to latest)', async () => {
      const result = testHelm({
        valuesYaml: `
imageUrl: "nginx"
        `,
        template: createImageParsingTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n').filter(line => line.trim());
      const nameMatch = lines.find(line => line.startsWith('name:'));
      const tagMatch = lines.find(line => line.startsWith('tag:'));
      const digestMatch = lines.find(line => line.startsWith('digest:'));
      
      expect(nameMatch).toBe('name: nginx');
      expect(tagMatch).toBe('tag: ":latest"');
      expect(digestMatch).toBe('digest: ""');
    });

    it('should parse complex registry URL', async () => {
      const result = testHelm({
        valuesYaml: `
imageUrl: "gcr.io/my-project/my-app:v2.1.3"
        `,
        template: createImageParsingTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n').filter(line => line.trim());
      const nameMatch = lines.find(line => line.startsWith('name:'));
      const tagMatch = lines.find(line => line.startsWith('tag:'));
      const digestMatch = lines.find(line => line.startsWith('digest:'));
      
      expect(nameMatch).toBe('name: gcr.io/my-project/my-app');
      expect(tagMatch).toBe('tag: ":v2.1.3"');
      expect(digestMatch).toBe('digest: ""');
    });

    it('should parse image with digest only', async () => {
      const result = testHelm({
        valuesYaml: `
imageUrl: "nginx@sha256:abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab"
        `,
        template: createImageParsingTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n').filter(line => line.trim());
      const nameMatch = lines.find(line => line.startsWith('name:'));
      const tagMatch = lines.find(line => line.startsWith('tag:'));
      const digestMatch = lines.find(line => line.startsWith('digest:'));
      
      expect(nameMatch).toBe('name: nginx');
      expect(tagMatch).toBe('tag: ":latest"');
      expect(digestMatch).toBe('digest: "@sha256:abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab"');
    });
  });

  describe('chartUtils.updataImages', () => {
    it('should replace image name when matching', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: nginx:1.14.2
        - name: sidecar
          image: busybox:latest

images:
- image: nginx
  newName: my-registry.com/nginx
  newTag: "1.20.0"
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.spec.template.spec.containers[0].image).toBe('my-registry.com/nginx:1.20.0');
      expect(actualObject.spec.template.spec.containers[1].image).toBe('busybox:latest'); // unchanged
    });

    it('should replace image with digest', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: nginx:1.14.2

images:
- image: nginx
  newName: nginx
  digest: sha256:abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.spec.template.spec.containers[0].image).toBe('nginx:1.14.2@sha256:abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab');
    });

    it('should add pull secrets when specified', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: nginx:1.14.2

images:
- image: nginx
  newName: private-registry.com/nginx
  newTag: "1.20.0"
  pullSecrets:
  - name: my-registry-secret
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.spec.template.spec.containers[0].image).toBe('private-registry.com/nginx:1.20.0');
      expect(actualObject.spec.template.spec.imagePullSecrets).toEqual([{ name: 'my-registry-secret' }]);
    });

    it('should handle multiple image replacements', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: nginx:1.14.2
        - name: sidecar
          image: busybox:1.30
        - name: proxy
          image: envoy:v1.15.0

images:
- image: nginx
  newName: my-registry.com/nginx
  newTag: "1.20.0"
- image: busybox
  newName: my-registry.com/busybox
  newTag: "1.35"
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.spec.template.spec.containers[0].image).toBe('my-registry.com/nginx:1.20.0');
      expect(actualObject.spec.template.spec.containers[1].image).toBe('my-registry.com/busybox:1.35');
      expect(actualObject.spec.template.spec.containers[2].image).toBe('envoy:v1.15.0'); // unchanged
    });

    it('should not modify images when no images config provided', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: nginx:1.14.2
        - name: sidecar
          image: busybox:latest
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.spec.template.spec.containers[0].image).toBe('nginx:1.14.2');
      expect(actualObject.spec.template.spec.containers[1].image).toBe('busybox:latest');
    });

    it('should handle complex image URLs with registry and paths', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: gcr.io/my-project/my-app:v1.2.3

images:
- image: gcr.io/my-project/my-app
  newName: us-central1-docker.pkg.dev/my-project/my-repo/my-app
  newTag: "v2.0.0"
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.spec.template.spec.containers[0].image).toBe('us-central1-docker.pkg.dev/my-project/my-repo/my-app:v2.0.0');
    });

    it('should handle manifest without containers gracefully', async () => {
      const result = testHelm({
        valuesYaml: `
k8sManifest:
  apiVersion: v1
  kind: Service
  metadata:
    name: my-service
  spec:
    selector:
      app: my-app
    ports:
    - port: 80

images:
- image: nginx
  newName: my-registry.com/nginx
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });
      
      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);
      
      expect(actualObject.metadata.name).toBe('my-service');
      expect(actualObject.spec.ports[0].port).toBe(80);
      // Should not crash or modify anything since there are no containers
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
  const result = execSync(`helm template test-chart . --debug` , {
    cwd: tmpFolder,
  });
  return result.toString();
}
