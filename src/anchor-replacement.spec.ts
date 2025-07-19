import * as path from 'path';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
import { parse as parseYaml } from 'yaml';
const { execSync } = require('child_process');
const fs = require('fs-extra');

describe('Anchor replacement in Helm templates', () => {
  const testName = 'anchor-replacement-test';
  const cwd = './kustomize-tests';
  const targetFolder = `../test-results/${testName}`;
  const directory = `./${testName}`;

  beforeAll(() => {
    // Create test directory structure
    const testDir = path.join(cwd, directory);
    fs.ensureDirSync(testDir);
    fs.ensureDirSync(path.join(testDir, 'base'));
    fs.ensureDirSync(path.join(testDir, 'overlays'));
    fs.ensureDirSync(path.join(testDir, 'overlays/dev'));

    // Create base kustomization.yaml
    fs.writeFileSync(
      path.join(testDir, 'base/kustomization.yaml'),
      `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
`
    );

    // Create base deployment
    fs.writeFileSync(
      path.join(testDir, 'base/deployment.yaml'),
      `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: app
        image: test:latest
        ports:
        - containerPort: 8080
`
    );

    // Create overlay kustomization
    fs.writeFileSync(
      path.join(testDir, 'overlays/dev/kustomization.yaml'),
      `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
bases:
  - ../../base
`
    );

    // Create values.yaml with anchors and references
    fs.writeFileSync(
      path.join(testDir, 'values.yaml'),
      `# Test scenario for anchor replacement
connect:
  replicas: &connect_replicas 3

globals:
  patches:
    - target:
        kind: Deployment
        name: test-app
      ops:
        - op: replace
          path: /spec/replicas
          value: *connect_replicas
`
    );
  });

  afterAll(() => {
    // Clean up test directories
    const testDir = path.join(cwd, directory);
    const resultDir = path.join(cwd, targetFolder);
    
    if (fs.existsSync(testDir)) {
      fs.removeSync(testDir);
    }
    if (fs.existsSync(resultDir)) {
      fs.removeSync(resultDir);
    }
  });


  it('should not include anchor replacement when disabled', async () => {
    const options = {
      cwd,
      targetFolder: `../test-results/${testName}-no-anchors`,
      directory,
      kustomizeOptions: {},
      chartName: 'test-chart-no-anchors',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Test Chart No Anchors',
      fs: fsDefault,
      execSync,
      tmpFolder: path.resolve(process.cwd(), `test-results/${testName}-no-anchors`),
      replaceAnchorsWithHashes: false, // Disabled
    };

    await wrapKustomizeIntoHelm(options);

    // Check that the _chart-utils.tpl file was generated
    const chartUtilsPath = path.join(cwd, `../test-results/${testName}-no-anchors`, 'templates/_chart-utils.tpl');
    expect(fs.existsSync(chartUtilsPath)).toBe(true);
    
    // Read the generated chart utils content
    const chartUtilsContent = fs.readFileSync(chartUtilsPath, 'utf8');
    
    // Should NOT contain anchor-specific handling since it's disabled
    expect(chartUtilsContent).not.toContain('hasKey .Values "connect_replicas"');
    expect(chartUtilsContent).not.toContain('safeGet.connect_replicas');
    
    // Read the generated values.yaml to check no anchor replacement occurred
    const valuesPath = path.join(cwd, `../test-results/${testName}-no-anchors`, 'values.yaml');
    const valuesContent = fs.readFileSync(valuesPath, 'utf8');
    
    // Should NOT contain hash replacement since it's disabled
    expect(valuesContent).not.toContain('&helmify_');
    expect(valuesContent).not.toContain('__anchorReferences__');
    
    // Should still contain the original anchor syntax
    expect(valuesContent).toContain('&connect_replicas');
    expect(valuesContent).toContain('*connect_replicas');
    
    // Clean up
    const resultDir = path.join(cwd, `../test-results/${testName}-no-anchors`);
    if (fs.existsSync(resultDir)) {
      fs.removeSync(resultDir);
    }
  });
});