#!/usr/bin/env node

import * as cp from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';
import { stringify as yamlStringify, parse as yamlParse } from 'yaml';
import { trimIndent } from './lang';
import { kustomizeFiles } from './templates/kustomize-files';
import { overlaysResults } from './templates/overlays-files';
import { FS, fsDefault, groupBy, randomString } from './utils';
import { yamlResult } from './templates/result-yaml';


/**
 * Options for wrapping Kustomize configurations into a Helm chart
 * @interface WrapKustomizeOptions
 * @property {string} cwd - Current working directory
 * @property {string} targetFolder - Output directory for the generated Helm chart
 * @property {string} directory - Directory containing Kustomize configurations
 * @property {Record<string, string>} kustomizeOptions - Command line options to pass to kustomize
 * @property {string} chartName - Name of the generated Helm chart
 * @property {string} chartVersion - Version of the generated Helm chart
 * @property {string} [chartDescription] - Optional description of the Helm chart
 * @property {FS} [fs] - Optional filesystem interface for testing
 * @property {typeof cp.execSync} [execSync] - Optional exec function for testing
 * @property {string[]} [parametrize] - Optional array of values to parametrize
 * @property {string} [overlayFilter] - Optional comma-separated list of overlay names to include (e.g., "staging,prod")
 */

interface WrapKustomizeOptions {
  cwd: string;
  targetFolder: string;
  directory: string;
  kustomizeOptions: Record<string, string>;
  chartName: string;
  chartVersion: string;
  chartDescription?: string;
  fs?: FS;
  execSync?: typeof cp.execSync;
  parametrize?: string[];
  overlayFilter?: string;
  clearTargetFolder?: boolean;
}
/**
 * Result of parametrizing a value in a Kustomize configuration
 * @interface ParametrizeResult
 * @property {string} valuesProp - The property name in values.yaml where the parameter will be stored
 * @property {string} key - The environment variable key being parametrized
 * @property {Record<string, string>} before - Original key-value pairs before parametrization
 * @property {Record<string, string>} after - Modified key-value pairs after parametrization with random strings
 */

interface ParametrizeResult {
  valuesProp: string;
  key: string;
  before: Record<string, string>;
  after: Record<string, string>;
}

/**
 * Wraps Kustomize into a Helm chart
 * @param {WrapKustomizeOptions} options - The options for wrapping Kustomize into a Helm chart
 * @returns {Promise<void>} - A promise that resolves when the Kustomize is wrapped into a Helm chart
 */
export async function wrapKustomizeIntoHelm({
  cwd,
  targetFolder,
  directory,
  kustomizeOptions,
  chartName,
  chartVersion,
  chartDescription = '',
  fs = fsDefault,
  execSync = cp.execSync,
  parametrize = [],
  clearTargetFolder = false,
  overlayFilter,
}: WrapKustomizeOptions): Promise<void> {
  // chart prefix should be random string of letters only of 10 chars
  const kustomizeDir = /^\./.test(directory) ? path.resolve(cwd, directory) : directory;
  const tempFolder = path.join(os.tmpdir(), '.helmify-kustomize-build');

  const targetTemplatesFolder = path.join(cwd, targetFolder, 'templates');
  copyFolder(fs, kustomizeDir, tempFolder, (src) => !src.includes('.helmify-kustomize-build'));

  const overlaysDir = path.join(tempFolder, 'overlays');
  const allOverlays = fs.readdirSync(overlaysDir).filter((file: string) => fs.statSync(path.join(overlaysDir, file)).isDirectory());

  // Filter overlays based on overlayFilter parameter
  const overlays = overlayFilter
    ? allOverlays.filter((overlay: string) => {
      const allowedOverlays = overlayFilter.split(',').map((name: string) => name.trim());
      return allowedOverlays.indexOf(`overlays/${overlay}`) !== -1;
    })
    : allOverlays;

  const kustomizeCliOptions = Object.entries(kustomizeOptions)
    .map(([key, value]) => `${key} ${value}`)
    .join(' ');

  const parametrizeResults: ParametrizeResult[] = [];
  const mapRandomStringsToParametrize: Record<string, ParametrizeResult> = {};

  parametrize.forEach((param) => {
    const [valuesProp, filePath] = param.split('=');
    const envPath = path.join(tempFolder, filePath);
    const before = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    const after = { ...before };

    Object.keys(after).forEach((key) => {
      const id = randomString();
      after[key] = id;
      mapRandomStringsToParametrize[id] = { valuesProp, before, after, key };
      parametrizeResults.push({ valuesProp, before, after, key });
    });

    fs.writeFileSync(envPath, Object.entries(after).map(([k, v]: [string, string]) => `${k}=${v}`).join('\n'), 'utf8');
  });

  const paramsRegex = new RegExp(Object.keys(mapRandomStringsToParametrize).join('|'), 'g');

  const replaceParams = (content: string) =>
    content.replace(paramsRegex, (match) => {
      const param = mapRandomStringsToParametrize[match];
      if (!param) return match;
      // {{- if .Values.myProp }}{{ .Values.myProp | quote }}{{- end }}
      const key = `.Values${ isValuePropRoot(param.valuesProp) ? '' : `.${param.valuesProp}`}.${param.key}`;

      // dynamiclly do something like this: {{ if kindIs "string" .Values.myProp }}{{ .Values.myProp | quote }}{{ else }}{{ .Values.myProp }}{{ end }}
      return `{{ if kindIs "string" ${key} }}{{ ${key} | quote }}{{ else }}{{ ${key} }}{{ end }}`;
    });

  const kustomizeManifestsResults = await Promise.all(
    overlays.map(async (overlay: string) => {
      const overlayPath = path.join(overlaysDir, overlay);
      const output = execSync(`kustomize build ${overlayPath} ${kustomizeCliOptions}`, { encoding: 'utf-8', cwd: tempFolder });
      return { overlay: `overlays/${overlay}`, content: replaceParams(output) };
    })
  );

  if (clearTargetFolder) {
    fs.rmSync(targetTemplatesFolder, { recursive: true, force: true });
  }
  // if Chart.yaml exists in kustomizeDir copy it, otherwise create a new one
  const kustomizeChartYaml = path.join(kustomizeDir, 'Chart.yaml');
  if (fs.existsSync(kustomizeChartYaml)) {
    fs.copyFileSync(kustomizeChartYaml, path.join(cwd, targetFolder, 'Chart.yaml'));
    const chartYaml = fs.readFileSync(path.join(cwd, targetFolder, 'Chart.yaml'), 'utf8');
    const chartYamlObj = yamlParse(chartYaml) as Record<string, string>;
    // if chartVersion is set then update it
    if (chartVersion) {
      chartYamlObj.version = chartVersion;
      fs.writeFileSync(path.join(cwd, targetFolder, 'Chart.yaml'), trimIndent(yamlStringify(chartYamlObj)), 'utf8');
    }
    // else get the values
    else {
      chartVersion = chartYamlObj.version;
      chartName = chartYamlObj.name;
    }
  } else {
    if (typeof chartName !== 'string') {
      console.error(`chartName is required when Chart.yaml does not exist in kustomizeDir`);
      throw new Error(`chartName is required when Chart.yaml does not exist in kustomizeDir`);
    }
    if (typeof chartVersion !== 'string') {
      console.error(`chartVersion is required when Chart.yaml does not exist in kustomizeDir`);
      throw new Error(`chartVersion is required when Chart.yaml does not exist in kustomizeDir`);
    }
    fs.writeFileSync(
      path.join(cwd, targetFolder, 'Chart.yaml'),
      trimIndent(`|apiVersion: v2\n|name: ${chartName}\n|version: ${chartVersion}\n|description: ${chartDescription}`),
      'utf8'
    );
  }
  const chartPrefix = `${chartName}-${chartVersion}`;

  const resultContent = overlaysResults(chartPrefix, kustomizeManifestsResults);
  fs.mkdirSync(targetTemplatesFolder, { recursive: true });
  fs.writeFileSync(path.join(targetTemplatesFolder, '_overlays-content.tpl'), resultContent, 'utf8');


  const resultYamlContent = yamlResult(chartPrefix);
  fs.writeFileSync(path.join(targetTemplatesFolder, 'result.yaml'), resultYamlContent, 'utf8');

  const kustomizationFiles = getKustomizationFiles(fs, kustomizeDir);
  const kustomizeHelperContent = kustomizeFiles(chartPrefix, kustomizationFiles);
  fs.writeFileSync(path.join(targetTemplatesFolder, '_kustomize-files.tpl'), kustomizeHelperContent, 'utf8');

  // copy from static to targetTemplatesFolder
  try {
    copyFolder(fs, path.join(__dirname, '..', 'static'), targetTemplatesFolder);
  } catch (e) {
    console.error(`static folder does not exist`);
  }

  const groups = groupBy(parametrizeResults, (o) => o.valuesProp);
  const valuesYamlObj: Record<string, any> = {};
  Array.from(groups.entries()).forEach(([key, value]) => {
    // if key is undefined, it means that the value is on the .Values object
    if (isValuePropRoot(key)) {
      value.forEach(o => {
        valuesYamlObj[o.key] = o.before[o.key];
      });
    }
    else {
      valuesYamlObj[key] = {};
      value.forEach(o => {
        valuesYamlObj[key][o.key] = o.before[o.key];
      });
    }
  });

  const prefixDocs = trimIndent(`|# globals:
    |#  namespace: "namespace"
    |#  namePrefix: "namePrefix"
    |#  nameSuffix: "nameSuffix"
    |#  nameReleasePrefix: "nameReleasePrefix"
    |#  labels:
    |#    key: "label"
    |#  annotations:
    |#    key: "annotation"
    |#  images:
    |#    - image: "old-image"
    |#      newName: "new-image"
    |#      newTag: "new-tag"
    |#      digest: "digest"
    |#      pullSecrets:
    |#        - name: "pull-secret"
    |#  resources:
    |#    - name: "resource"
    |#      version: "v1"
    |#      kind: "Resource"`)

  // if values.yaml exists in kustomizeDir parse it and add to valuesYamlObj
  const kustomizeValuesYaml = path.join(kustomizeDir, 'values.yaml');
  let valuesYamlObjFromFile: any = {};
  if (fs.existsSync(kustomizeValuesYaml)) {
    try {
      valuesYamlObjFromFile = yamlParse(fs.readFileSync(kustomizeValuesYaml, 'utf8')) as Record<string, string>;
    } catch (e) {
      console.error(`Error parsing source values.yaml: ${e}`);
      console.error(`ignoring source values.yaml`);
    }
  }

  fs.writeFileSync(
    path.join(cwd, targetFolder, 'values.yaml'),
    prefixDocs + "\n" + trimIndent(yamlStringify({
      overlay: '',
      ...valuesYamlObj,
      ...valuesYamlObjFromFile,
    })),
    'utf8'
  );

}

// Utility Functions
function isValuePropRoot(valuesProp: string | undefined): boolean {
  return valuesProp == undefined || valuesProp == '';
}
function copyFolder(fs: FS, source: string, target: string, filter: (src: string, dest: string) => boolean = () => true): void {
  if (!fs.existsSync(source)) {
    console.error(`Source folder does not exist: ${source}`);
    throw new Error(`Source folder does not exist: ${source}`);
  }
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });

  fs.readdirSync(source).forEach((entry: string) => {
    const sourcePath = path.join(source, entry);
    const targetPath = path.join(target, entry);

    if (!filter(sourcePath, targetPath)) return;

    const stats = fs.statSync(sourcePath);
    stats.isDirectory() ? copyFolder(fs, sourcePath, targetPath, filter) : fs.copyFileSync(sourcePath, targetPath);
  });
}

/**
 * Retrieves Kustomize files from a given directory
 * @param {FS} fs - The filesystem interface
 * @param {string} folder - The directory to scan for Kustomize files
 * @returns {Array<{ folder: string; filePath: string; content: string }>} An array of Kustomize files
 */
function getKustomizationFiles(fs: FS, folder: string): { folder: string; filePath: string; content: string }[] {
  const result: { folder: string; filePath: string; content: string }[] = [];
  const scanDirectory = (directory: string) => {
    fs.readdirSync(directory).forEach((file: string) => {
      const filePath = path.join(directory, file);
      if (fs.statSync(filePath).isDirectory()) {
        scanDirectory(filePath);
      } else if (file === 'kustomization.yaml' || file === 'kustomization.yml') {
        result.push({
          folder: path.relative(folder, directory),
          filePath: path.relative(folder, filePath),
          content: fs.readFileSync(filePath, 'utf8'),
        });
      }
    });
  };
  scanDirectory(folder);
  return result;
}
