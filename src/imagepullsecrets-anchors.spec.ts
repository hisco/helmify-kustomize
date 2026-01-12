import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
const { execSync } = require('child_process');
const fs = require('fs-extra');
import * as os from 'os';
import { chartUtils } from './templates/helm-utils';

const helmChartRaw = chartUtils('chartUtils');

function createImageUpdateTestTemplate(helmChartRaw: string): string {
  return `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.updataImages" (dict "manifest" $manifest "globals" .Values.globals "images" .Values.images) }}
{{- toYaml $manifest.spec }}
  `;
}

function testHelm({valuesYaml, template, releaseNamespace}:{valuesYaml:string, template:string, releaseNamespace?:string}):string{
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
  // write file named Chart.yaml with content:
  fsDefault.writeFileSync(path.join(tmpFolder, 'Chart.yaml'), `apiVersion: v2
name: test-chart
description: A Helm chart for Kubernetes
type: application
version: 0.1.0
appVersion: "1.16.0"
`);
  // helm template test-chart .
  const result = execSync(`helm template test-chart .${releaseNamespace ? ` --namespace ${releaseNamespace}` : ''}`, {
    cwd: tmpFolder,
  });
  return result.toString();
}

describe('ImagePullSecrets with YAML Anchors', () => {
  const testName = 'imagepullsecrets-anchors-test';
  const cwd = './kustomize-tests';
  const targetFolder = `../test-results/${testName}`;
  const directory = `./${testName}`;

  afterAll(() => {
    // Clean up test directories
    // TEMPORARILY DISABLED FOR DEBUGGING
    // const resultDir = path.join(cwd, targetFolder);
    // if (fs.existsSync(resultDir)) {
    //   fs.removeSync(resultDir);
    // }
  });

  describe('Suite 1: Unit Tests (Quick Validation)', () => {
    it('should apply default imagePullSecrets anchor value to all containers', async () => {
      const result = testHelm({
        valuesYaml: `
imagePullSecrets: &image_pull_secrets
  - name: default-registry-secret

globals:
  images:
    - image: ".*"
      pullSecrets: *image_pull_secrets

k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: multi-container-app
  spec:
    template:
      spec:
        containers:
        - name: frontend
          image: nginx:1.21.0
        - name: backend
          image: node:16-alpine
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });

      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);

      // Verify all container images remain unchanged
      expect(actualObject.spec.template.spec.containers[0].image).toBe('nginx:1.21.0');
      expect(actualObject.spec.template.spec.containers[1].image).toBe('node:16-alpine');

      // Verify imagePullSecrets is applied at pod spec level
      expect(actualObject.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'default-registry-secret' }
      ]);
    });

    it('should handle multiple imagePullSecrets with anchor', async () => {
      const result = testHelm({
        valuesYaml: `
imagePullSecrets: &image_pull_secrets
  - name: docker-hub-secret
  - name: gcr-secret
  - name: ecr-secret

globals:
  images:
    - image: ".*"
      pullSecrets: *image_pull_secrets

k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: myapp:v1.0.0
        - name: sidecar
          image: sidecar:latest
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });

      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);

      expect(actualObject.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'docker-hub-secret' },
        { name: 'gcr-secret' },
        { name: 'ecr-secret' }
      ]);
    });

    it('should work with top-level images configuration (not globals.images)', async () => {
      const result = testHelm({
        valuesYaml: `
imagePullSecrets: &image_pull_secrets
  - name: top-level-secret

images:
  - image: ".*"
    pullSecrets: *image_pull_secrets

k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: nginx:1.21
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });

      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);

      expect(actualObject.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'top-level-secret' }
      ]);
    });

    it('should apply imagePullSecrets using globals.patches with anchor', async () => {
      const result = testHelm({
        valuesYaml: `
imagePullSecrets: &image_pull_secrets
  - name: patch-based-secret

globals:
  patches:
    - target:
        kind: Deployment
        name: test-deployment
      ops:
        - op: add
          path: /spec/template/spec/imagePullSecrets
          value: *image_pull_secrets

k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: test-deployment
  spec:
    replicas: 1
    template:
      metadata:
        labels:
          app: test
      spec:
        containers:
        - name: app
          image: nginx:latest
`,
        template: `
${helmChartRaw}
{{- $manifest := dict "spec" .Values.k8sManifest }}
{{- include "chartUtils.ensureMetadata" (dict "manifest" $manifest) }}
{{- include "chartUtils.applyManifestPatchers" (dict "manifest" $manifest "globals" .Values.globals) }}
{{- toYaml $manifest.spec }}
`
      });

      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const deployment = parseYaml(yamlContent);

      expect(deployment.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'patch-based-secret' }
      ]);
    });
  });

  describe('Suite 2: E2E Tests (Full Integration)', () => {
    it('should create deployment with default imagePullSecrets anchor values from values.yaml', async () => {
      const options = {
        cwd,
        targetFolder,
        directory,
        kustomizeOptions: {},
        chartName: 'imagepullsecrets-test-chart',
        chartVersion: '1.0.0',
        chartAppVersion: '1.0.0',
        chartDescription: 'ImagePullSecrets Test Chart with Patches',
        fs: fsDefault,
        execSync,
        tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
        // Note: replaceAnchorsWithHashes not needed - auto-enabled when anchors detected
      };

      try {
        await wrapKustomizeIntoHelm(options);
      } catch (error) {
        console.error('wrapKustomizeIntoHelm failed:', error);
        throw error;
      }

      const cwdHelm = path.join(cwd, targetFolder);

      // Debug: Check generated files
      console.log('=== GENERATED CHART FILES ===');
      console.log(execSync(`ls -la`, { cwd: cwdHelm }).toString());
      console.log('=== TEMPLATE FILES ===');
      console.log(execSync(`ls -la templates/`, { cwd: cwdHelm }).toString());
      console.log('=== _values.yaml.tpl ===');
      console.log(execSync(`cat templates/_values.yaml.tpl`, { cwd: cwdHelm }).toString());
      console.log('=== result.yaml FIRST 100 LINES ===');
      console.log(execSync(`head -100 templates/result.yaml`, { cwd: cwdHelm }).toString());
      console.log('=== VALUES.YAML ===');
      console.log(execSync(`cat values.yaml`, { cwd: cwdHelm }).toString());

      // Verify _values.yaml.tpl includes anchor processing
      const valuesTemplate = fs.readFileSync(
        path.join(cwdHelm, 'templates/_values.yaml.tpl'),
        'utf8'
      );
      console.log('=== VERIFYING _values.yaml.tpl CONTAINS ANCHOR PROCESSING ===');
      console.log('Contains $runtime_image_pull_secrets:', valuesTemplate.includes('$runtime_image_pull_secrets'));
      console.log('Contains $final_image_pull_secrets:', valuesTemplate.includes('$final_image_pull_secrets'));
      console.log('Contains globals:', valuesTemplate.includes('globals:'));
      console.log('Contains patches:', valuesTemplate.includes('patches:'));

      // Test with default values
      const defaultResult = execSync(`helm template test-chart . --set overlay="overlays/dev"`, {
        cwd: cwdHelm
      });

      console.log('=== FULL HELM TEMPLATE OUTPUT ===');
      console.log(defaultResult.toString());

      const defaultYamls = defaultResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
      const defaultObjects = defaultYamls.map((yaml: string) => parseYaml(yaml));

      const deployment = defaultObjects.find((obj: any) => obj.kind === 'Deployment');
      const service = defaultObjects.find((obj: any) => obj.kind === 'Service');

      // Verify all objects exist
      expect(deployment).toBeDefined();
      expect(service).toBeDefined();

      // Debug output
      console.log('=== DEPLOYMENT OBJECT ===');
      console.log(JSON.stringify(deployment, null, 2));
      console.log('=== imagePullSecrets ===');
      console.log(deployment?.spec?.template?.spec?.imagePullSecrets);

      // Verify deployment has default imagePullSecrets from anchor
      expect(deployment.metadata.name).toBe('multi-container-app');
      expect(deployment.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'default-registry-secret' }
      ]);

      // Verify all containers present
      expect(deployment.spec.template.spec.containers).toHaveLength(3);
      expect(deployment.spec.template.spec.containers[0].name).toBe('frontend');
      expect(deployment.spec.template.spec.containers[1].name).toBe('backend');
      expect(deployment.spec.template.spec.containers[2].name).toBe('cache');

      console.log('✓ Default imagePullSecrets anchor values work correctly');
    });

    it('should override imagePullSecrets anchor values at runtime with --set', async () => {
      const options = {
        cwd,
        targetFolder,
        directory,
        kustomizeOptions: {},
        chartName: 'imagepullsecrets-test-chart',
        chartVersion: '1.0.0',
        chartAppVersion: '1.0.0',
        chartDescription: 'ImagePullSecrets Test Chart with Patches',
        fs: fsDefault,
        execSync,
        tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      };

      await wrapKustomizeIntoHelm(options);

      const cwdHelm = path.join(cwd, targetFolder);

      // Test with runtime override
      const runtimeResult = execSync(
        `helm template test-chart . --set overlay="overlays/dev" --set imagePullSecrets[0].name=runtime-secret`,
        { cwd: cwdHelm }
      );

      const runtimeYamls = runtimeResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
      const runtimeObjects = runtimeYamls.map((yaml: string) => parseYaml(yaml));

      const deployment = runtimeObjects.find((obj: any) => obj.kind === 'Deployment');

      expect(deployment).toBeDefined();
      expect(deployment.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'runtime-secret' }
      ]);

      console.log('✓ Runtime override with --set imagePullSecrets[0].name works correctly');
    });

    it('should override with multiple imagePullSecrets at runtime', async () => {
      const options = {
        cwd,
        targetFolder,
        directory,
        kustomizeOptions: {},
        chartName: 'imagepullsecrets-test-chart',
        chartVersion: '1.0.0',
        chartAppVersion: '1.0.0',
        chartDescription: 'ImagePullSecrets Test Chart with Patches',
        fs: fsDefault,
        execSync,
        tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      };

      await wrapKustomizeIntoHelm(options);

      const cwdHelm = path.join(cwd, targetFolder);

      const multiResult = execSync(
        `helm template test-chart . --set overlay="overlays/dev" --set imagePullSecrets[0].name=secret-1 --set imagePullSecrets[1].name=secret-2`,
        { cwd: cwdHelm }
      );

      const multiYamls = multiResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
      const multiObjects = multiYamls.map((yaml: string) => parseYaml(yaml));

      const deployment = multiObjects.find((obj: any) => obj.kind === 'Deployment');

      expect(deployment).toBeDefined();
      expect(deployment.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'secret-1' },
        { name: 'secret-2' }
      ]);

      console.log('✓ Multiple imagePullSecrets override works correctly');
    });

    it('should override imagePullSecrets using custom values file', async () => {
      const options = {
        cwd,
        targetFolder,
        directory,
        kustomizeOptions: {},
        chartName: 'imagepullsecrets-test-chart',
        chartVersion: '1.0.0',
        chartAppVersion: '1.0.0',
        chartDescription: 'ImagePullSecrets Test Chart with Patches',
        fs: fsDefault,
        execSync,
        tmpFolder: path.resolve(process.cwd(), `test-results/${testName}`),
      };

      await wrapKustomizeIntoHelm(options);

      const cwdHelm = path.join(cwd, targetFolder);

      // Create custom values file
      const customValuesPath = path.join(cwdHelm, 'custom-values.yaml');
      fs.writeFileSync(customValuesPath, `overlay: "overlays/dev"
imagePullSecrets:
  - name: custom-values-secret-1
  - name: custom-values-secret-2
`);

      const valuesFileResult = execSync(`helm template test-chart . -f custom-values.yaml`, {
        cwd: cwdHelm
      });

      const valuesYamls = valuesFileResult.toString().split(/---\n/g).filter((s: string) => s.trim() !== '');
      const valuesObjects = valuesYamls.map((yaml: string) => parseYaml(yaml));

      const deployment = valuesObjects.find((obj: any) => obj.kind === 'Deployment');

      expect(deployment).toBeDefined();
      expect(deployment.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'custom-values-secret-1' },
        { name: 'custom-values-secret-2' }
      ]);

      // Clean up
      fs.unlinkSync(customValuesPath);

      console.log('✓ Values file override works correctly');
    });
  });

  describe('Suite 3: Edge Cases', () => {
    it('should not add imagePullSecrets when anchor is empty array', async () => {
      const result = testHelm({
        valuesYaml: `
imagePullSecrets: &image_pull_secrets []

globals:
  images:
    - image: ".*"
      pullSecrets: *image_pull_secrets

k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: nginx:1.21.0
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });

      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);

      // Empty array should result in undefined or empty
      expect(actualObject.spec.template.spec.imagePullSecrets).toBeFalsy();
    });

    it('should not apply imagePullSecrets to non-pod resources', async () => {
      const result = testHelm({
        valuesYaml: `
imagePullSecrets: &image_pull_secrets
  - name: should-not-apply

globals:
  images:
    - image: ".*"
      pullSecrets: *image_pull_secrets

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
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });

      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);

      expect(actualObject.kind).toBe('Service');
      expect(actualObject.spec.imagePullSecrets).toBeUndefined();
    });

    it('should apply same pullSecrets anchor to multiple image patterns', async () => {
      const result = testHelm({
        valuesYaml: `
imagePullSecrets: &image_pull_secrets
  - name: shared-secret

globals:
  images:
    - image: "nginx.*"
      pullSecrets: *image_pull_secrets
    - image: "node.*"
      pullSecrets: *image_pull_secrets

k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: app
  spec:
    template:
      spec:
        containers:
        - name: web
          image: nginx:1.21
        - name: api
          image: node:16
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });

      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);

      // Should apply to all matching containers
      expect(actualObject.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'shared-secret' }
      ]);
    });

    it('should use last matching wildcard pattern for imagePullSecrets (last wins)', async () => {
      const result = testHelm({
        valuesYaml: `
imagePullSecrets: &image_pull_secrets
  - name: first-secret

otherSecrets: &other_secrets
  - name: second-secret

globals:
  images:
    - image: ".*"
      pullSecrets: *image_pull_secrets
    - image: ".*"
      pullSecrets: *other_secrets

k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: app
  spec:
    template:
      spec:
        containers:
        - name: app
          image: nginx:1.21
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });

      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);

      // Last wildcard should override
      expect(actualObject.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'second-secret' }
      ]);
    });

    it('should work with anchor and specific image pattern (not just wildcard)', async () => {
      const result = testHelm({
        valuesYaml: `
imagePullSecrets: &image_pull_secrets
  - name: specific-secret

globals:
  images:
    - image: "nginx"
      pullSecrets: *image_pull_secrets

k8sManifest:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: app
  spec:
    template:
      spec:
        containers:
        - name: web
          image: nginx:1.21
        - name: db
          image: postgres:13
        `,
        template: createImageUpdateTestTemplate(helmChartRaw),
      });

      const lines = result.split('\n');
      const yamlStart = lines.findIndex(line => line.includes('apiVersion: apps/v1'));
      const yamlContent = lines.slice(yamlStart).join('\n');
      const actualObject = parseYaml(yamlContent);

      // Should apply because nginx matches
      expect(actualObject.spec.template.spec.imagePullSecrets).toEqual([
        { name: 'specific-secret' }
      ]);
    });
  });
});
