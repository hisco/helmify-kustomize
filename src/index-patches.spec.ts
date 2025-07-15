import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { wrapKustomizeIntoHelm } from './index';
import { fsDefault } from './utils';
const { execSync } = require('child_process');

describe('wrapKustomizeIntoHelmPatches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create helm chart with patches applied via globals.patches', async () => {
    const options = {
      cwd: './kustomize-tests',
      targetFolder: '../test-results/patches-test',
      directory: './patches-test',
      kustomizeOptions: {},
      chartName: 'test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Test Chart for Patches',
      fs: fsDefault,
      execSync: execSync,
      tmpFolder: path.resolve(process.cwd(), 'test-results/patches-test'),
      includeKustomizeFiles: true,
    };

    await wrapKustomizeIntoHelm(options);

    // Test the chart with patches applied via globals
    const result = execSync(`helm template test-chart . --set overlay="overlays/dev" --set-json globals.patches='[{"target":{"group":"apps","version":"v1","kind":"Deployment","name":"nginx-deployment"},"ops":[{"op":"add","path":"/spec/template/spec/containers/0/env/-","value":{"name":"LOG_LEVEL","value":"debug"}},{"op":"add","path":"/spec/replicas","value":5}]},{"target":{"group":"","version":"v1","kind":"Service","name":"nginx-service"},"ops":[{"op":"add","path":"/spec/ports/0/name","value":"http"}]}]'`, {
      cwd: path.join(options.cwd, options.targetFolder),
    });

    const yamls = result.toString().split(/---\n#.+\n/g).filter((s: string) => s.trim() !== '');
    expect(yamls.length).toBe(2);

    const objects = yamls.map((yaml: string) => parseYaml(yaml));
    
    // Find the deployment and service
    const deployment = objects.find((o: any) => o.kind === 'Deployment');
    const service = objects.find((o: any) => o.kind === 'Service');

    // Verify deployment patches were applied
    expect(deployment).toBeDefined();
    expect(deployment.metadata.name).toBe('nginx-deployment');
    expect(deployment.spec.replicas).toBe(5); // Patched from 2 to 5
    expect(deployment.spec.template.spec.containers[0].env).toEqual([
      { name: 'LOG_LEVEL', value: 'debug' }
    ]); // Env variable added via patch

    // Verify service patches were applied  
    expect(service).toBeDefined();
    expect(service.metadata.name).toBe('nginx-service');
    expect(service.spec.ports[0].name).toBe('http'); // Name added via patch
    expect(service.spec.ports[0].port).toBe(80); // Original value preserved
  });


  it('should create helm chart with patches applied via custom patches location', async () => {
    const options = {
      cwd: './kustomize-tests',
      targetFolder: '../test-results/patches-test',
      directory: './patches-test',
      kustomizeOptions: {},
      chartName: 'test-chart',
      chartVersion: '1.0.0',
      chartAppVersion: '1.0.0',
      chartDescription: 'Test Chart for Patches',
      fs: fsDefault,
      execSync: execSync,
      tmpFolder: path.resolve(process.cwd(), 'test-results/patches-test'),
      includeKustomizeFiles: true,
    };

    await wrapKustomizeIntoHelm(options);

    // Test the chart with patches applied via globals
    const result = execSync(`helm template test-chart . --set overlay="overlays/dev" --set helmifyPrefix="myLocation" --set-json myLocation.patches='[{"target":{"group":"apps","version":"v1","kind":"Deployment","name":"nginx-deployment"},"ops":[{"op":"add","path":"/spec/template/spec/containers/0/env/-","value":{"name":"LOG_LEVEL","value":"debug"}},{"op":"add","path":"/spec/replicas","value":5}]},{"target":{"group":"","version":"v1","kind":"Service","name":"nginx-service"},"ops":[{"op":"add","path":"/spec/ports/0/name","value":"http"}]}]'`, {
      cwd: path.join(options.cwd, options.targetFolder),
    });

    const yamls = result.toString().split(/---\n#.+\n/g).filter((s: string) => s.trim() !== '');
    expect(yamls.length).toBe(2);

    const objects = yamls.map((yaml: string) => parseYaml(yaml));
    
    // Find the deployment and service
    const deployment = objects.find((o: any) => o.kind === 'Deployment');
    const service = objects.find((o: any) => o.kind === 'Service');

    // Verify deployment patches were applied
    expect(deployment).toBeDefined();
    expect(deployment.metadata.name).toBe('nginx-deployment');
    expect(deployment.spec.replicas).toBe(5); // Patched from 2 to 5
    expect(deployment.spec.template.spec.containers[0].env).toEqual([
      { name: 'LOG_LEVEL', value: 'debug' }
    ]); // Env variable added via patch

    // Verify service patches were applied  
    expect(service).toBeDefined();
    expect(service.metadata.name).toBe('nginx-service');
    expect(service.spec.ports[0].name).toBe('http'); // Name added via patch
    expect(service.spec.ports[0].port).toBe(80); // Original value preserved
  });
});
