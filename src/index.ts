#!/usr/bin/env node

import * as cp from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { stringify as yamlStringify, parse as yamlParse, Document, parseDocument } from 'yaml';
import { trimIndent } from './lang';
import { kustomizeFiles } from './templates/kustomize-files';
import { overlaysResults } from './templates/overlays-files';
import { FS, fsDefault, groupBy, randomString, shortHash } from './utils';
import { ParametrizeConfigmap, yamlResult } from './templates/result-yaml';
import { chartUtils } from './templates/helm-utils';
import { generateValuesYamlTemplate } from './templates/helm-yaml-anchors';

/**
 * Gets the package version from various sources
 * @returns {string} The package version
 */
function getPackageVersion(): string {
  // Method 1: Check npm environment variable (works when running via npm scripts)
  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }
  
  // Method 2: Try to read package.json from current working directory
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.version) {
        return packageJson.version;
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  // Method 3: Try to read package.json from module directory
  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.version) {
        return packageJson.version;
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  // Method 4: Try require('../../package.json') - works when installed as dependency
  try {
    const packageJson = require('../../package.json');
    if (packageJson.version) {
      return packageJson.version;
    }
  } catch (e) {
    // Ignore errors
  }
  
  // Method 5: Try require('../package.json') - works in development
  try {
    const packageJson = require('../package.json');
    if (packageJson.version) {
      return packageJson.version;
    }
  } catch (e) {
    // Ignore errors
  }
  
  // Fallback
  return '0.0.0';
}

/**
 * Represents a YAML anchor reference relationship
 */


/**
 * Options for wrapping Kustomize configurations into a Helm chart
 * @interface WrapKustomizeOptions
 * @property {string} cwd - Current working directory
 * @property {string} targetFolder - Output directory for the generated Helm chart
 * @property {string} directory - Directory containing Kustomize configurations
 * @property {Record<string, string>} kustomizeOptions - Command line options to pass to kustomize
 * @property {string} chartName - Name of the generated Helm chart
 * @property {string} chartVersion - Version of the generated Helm chart
 * @property {string} chartAppVersion - App version of the generated Helm chart
 * @property {string} [chartDescription] - Optional description of the Helm chart
 * @property {FS} [fs] - Filesystem implementation
 * @property {typeof cp.execSync} [execSync] - Optional exec function for testing
 * @property {string[]} [parametrize] - Optional array of values to parametrize
 * @property {string[]} [parametrizeConfigmap] - Optional array of configmap names to parametrize
 * @property {string} [overlayFilter] - Optional comma-separated list of overlay names to include (e.g., "staging,prod")
 * @property {string} [tmpFolder] -  Temporary folder for the build
 * @property {boolean} [includeKustomizeFiles] - Optional flag to include kustomize files template (default: false)
 * @property {boolean} [replaceAnchorsWithHashes] - Optional flag to replace YAML anchor names with unique hashes (default: false)
 */

interface WrapKustomizeOptions {
  cwd: string;
  targetFolder: string;
  directory: string;
  kustomizeOptions: Record<string, string>;
  chartName: string;
  chartVersion: string;
  chartAppVersion: string;
  chartDescription?: string;
  parametrizeConfigmap?: string[];
  fs?: FS;
  execSync?: typeof cp.execSync;
  parametrize?: string[];
  overlayFilter?: string;
  clearTargetFolder?: boolean;
  tmpFolder: string;
  includeKustomizeFiles?: boolean;
  replaceAnchorsWithHashes?: boolean;
  enabledDynamicAnchorReplacement?: boolean;
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
  chartAppVersion,
  chartDescription = '',
  fs = fsDefault,
  execSync = cp.execSync,
  parametrize = [],
  clearTargetFolder = false,
  overlayFilter,
  tmpFolder,
  parametrizeConfigmap,
  includeKustomizeFiles = false,
  enabledDynamicAnchorReplacement = true
}: WrapKustomizeOptions): Promise<void> {
  // to prevent collisions with other charts that were also generated by this package, but the functionality might be different we will prefix the helers with the major and minor version of the package
  const thisPackageVersion = getPackageVersion();
  const thisPackageId = `hlmfk-${thisPackageVersion.split('.')[0]}-${thisPackageVersion.split('.')[1]}`;
  

  // if directory starts with . then resolve it from cwd
  const kustomizeDir = /^\./.test(directory) ? path.resolve(cwd, directory) : directory;
  const kustomizeValuesYaml = path.join(kustomizeDir, 'values.yaml');
  const hasTemplatedValuesYaml = enabledDynamicAnchorReplacement && fs.existsSync(kustomizeValuesYaml);

  // the build result should be in a tmp folder in a subfolder named .helmify-kustomize-build
  const tempFolder = path.join(tmpFolder, '.helmify-kustomize-build');
  // The directory is a regular helm structure, so the templates folder is in the targetFolder/templates
  const targetTemplatesFolder = path.join(cwd, targetFolder, 'templates');

  // ensure target directory exists
  fs.mkdirSync(path.join(cwd, targetFolder), { recursive: true });

  // copy the source kustomize dir to the temp folder so we will be able to manipulate the files
  copyFolder(fs, kustomizeDir, tempFolder, (src) => !src.includes('.helmify-kustomize-build'));

  // create a list of all overlays including the base overlay
  const overlaysDir = path.join(tempFolder, 'overlays');
  const allOverlays = fs.readdirSync(overlaysDir).filter((file: string) => fs.statSync(path.join(overlaysDir, file)).isDirectory());

  // Filter overlays based on overlayFilter parameter
  const overlays = overlayFilter
    ? allOverlays.filter((overlay: string) => {
      const allowedOverlays = overlayFilter.split(',').map((name: string) => name.trim());
      return allowedOverlays.indexOf(`overlays/${overlay}`) !== -1;
    })
    : allOverlays;

  // it's possible to pass kustomize options to the kustomize build command
  const kustomizeCliOptions = Object.entries(kustomizeOptions)
    .map(([key, value]) => `${key} ${value}`)
    .join(' ');

  // it's possible to parametrize values in the kustomize files
  // parametrize is an array of dot env files to parametrize and thier respective values.yaml properties
  // each value is a string like "valuesProp=filePath"
  // the valuesProp is the property name in values.yaml where the parameter will be stored
  // the filePath is the path to the file where the parameter will be stored
  // the file is a .env file format
  // the file is parsed and the values are replaced with random strings to easelly I identify thier apperances in the kustomize output

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

  // create a regex to replace the random strings with the values.yaml properties
  const paramsRegex = new RegExp(Object.keys(mapRandomStringsToParametrize).join('|'), 'g');

  const replaceParams = (content: string) =>
    content.replace(paramsRegex, (match) => {
      const param = mapRandomStringsToParametrize[match];
      if (!param) return match;
      // {{- if .Values.myProp }}{{ .Values.myProp | quote }}{{- end }}
      const key = `.Values${isValuePropRoot(param.valuesProp) ? '' : `.${param.valuesProp}`}.${param.key}`;

      // if the value is a string, then we need to quote it
      // if the value is not a string, then we need to use the value directly
      // dynamiclly do something like this: {{ if kindIs "string" .Values.myProp }}{{ .Values.myProp | quote }}{{ else }}{{ .Values.myProp }}{{ end }}
      return `{{ ${key} | quote }}`;
    });

  const kustomizeManifestsResults = await Promise.all(
    overlays.map(async (overlay: string) => {
      const overlayPath = path.join(overlaysDir, overlay);
      // build the overlay with the kustomize cli options
      const output = execSync(`kustomize build ${overlayPath} ${kustomizeCliOptions}`, { encoding: 'utf-8', cwd: tempFolder });
      return { overlay: `overlays/${overlay}`, content: replaceParams(output) };
    })
  );

  // if clearTargetFolder is true, then remove the target folder
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
      fs.writeFileSync(path.join(cwd, targetFolder, 'Chart.yaml'), yamlStringify(chartYamlObj), 'utf8');
    }
    // if chartAppVersion is set then update it
    if (chartAppVersion) {
      chartYamlObj.appVersion = chartAppVersion;
      fs.writeFileSync(path.join(cwd, targetFolder, 'Chart.yaml'), yamlStringify(chartYamlObj), 'utf8');
    }
    // else get the values
    else {
      chartVersion = chartYamlObj.version;
      chartAppVersion = chartYamlObj.appVersion;
      chartName = chartYamlObj.name;
    }
  } else {
    // else create a new Chart.yaml file
    if (typeof chartName !== 'string') {
      console.error(`chartName is required when Chart.yaml does not exist in kustomizeDir`);
      throw new Error(`chartName is required when Chart.yaml does not exist in kustomizeDir`);
    }
    if (typeof chartVersion !== 'string') {
      console.error(`chartVersion is required when Chart.yaml does not exist in kustomizeDir`);
      throw new Error(`chartVersion is required when Chart.yaml does not exist in kustomizeDir`);
    }
    if (typeof chartAppVersion !== 'string') {
      chartAppVersion = '0.0.1';
    }
    fs.writeFileSync(
      path.join(cwd, targetFolder, 'Chart.yaml'),
      trimIndent(`
        |apiVersion: v2\n
        |name: ${chartName}\n
        |version: ${chartVersion}\n
        |appVersion: ${chartAppVersion}\n
        |description: ${chartDescription}
        `),
      'utf8'
    );
  }

  // To prevent collisions with other charts, we use a chart prefix
  // The prefix is calculated from the content of the overlay results
  // The placeholder is replaced with the hash of the content
  const chartPrefixPlaceHolder = 'chartPrefixPlaceholder|>unique';

  // Generate the content of the overlay results with the placeholder
  const resultContent = overlaysResults(chartPrefixPlaceHolder, kustomizeManifestsResults);
  // Calculate the hash of the content
  const chartPrefixHash = `${thisPackageId}-${shortHash(resultContent)}`;
  // Replace the placeholder with the actual hash
  const resultWithHash = resultContent.replace(chartPrefixPlaceHolder, chartPrefixHash);

  // Create the templates folder
  fs.mkdirSync(targetTemplatesFolder, { recursive: true });
  // Write the content of the overlay results to the templates folder
  fs.writeFileSync(path.join(targetTemplatesFolder, '_overlays-content.tpl'), resultWithHash, 'utf8');

  const parametrizeConfigmaps: ParametrizeConfigmap[] = [];
  if (parametrizeConfigmap) {
    parametrizeConfigmap.forEach((configmapEqualityString) => {
      const [valuesKey, name] = configmapEqualityString.split('=');
      parametrizeConfigmaps.push({ name, valuesKey: valuesKey.split('.') });
    });
  }
  // Write the result.yaml file to the templates folder
  const resultYamlContent = yamlResult(chartPrefixHash, thisPackageId, parametrizeConfigmaps, includeKustomizeFiles, hasTemplatedValuesYaml);
  // Write the result.yaml file to the templates folder
  fs.writeFileSync(path.join(targetTemplatesFolder, 'result.yaml'), resultYamlContent, 'utf8');

  // Chart utils will be generated after anchor processing

  // Get the kustomization files from the kustomize dir
  // The kustomization files are not relevant for the k8s content, we generate these and store them in case needed
  const kustomizationFiles = getKustomizationFiles(fs, kustomizeDir);
  // Generate the content of the kustomization files with the chart prefix hash
  const kustomizeHelperContent = kustomizeFiles(chartPrefixHash, kustomizationFiles);
  // Write the content of the kustomization files to the templates folder
  if (includeKustomizeFiles) {
    fs.writeFileSync(path.join(targetTemplatesFolder, '_kustomize-files.tpl'), kustomizeHelperContent, 'utf8');
  }

  if (parametrizeConfigmap) {
    // For each configmap in the parametrizeConfigmap array, we will pass through the property in the values.yaml object to the configmap
    parametrizeConfigmap.forEach((configmap) => {

    });
  }

  // Group the parametrize results by the valuesProp. e.g the property name in parametrized .env files, ENV_VAR_NAME=value so the valuesProp is ENV_VAR_NAME
  const groups = groupBy(parametrizeResults, (o) => o.valuesProp);
  // Create the values.yaml object
  const valuesYamlObj: Record<string, any> = {};
  Array.from(groups.entries()).forEach(([key, value]) => {
    // if key is undefined, it means that the value is on the .Values object
    if (isValuePropRoot(key)) {
      value.forEach(o => {
        // Set the key at the root of the values.yaml object , e.g. .Values.ENV_VAR_NAME = value
        valuesYamlObj[o.key] = o.before[o.key];
      });
    }
    else {
      // set the key at a sub key of the values.yaml object , e.g. .Values.someKey.ENV_VAR_NAME = value
      valuesYamlObj[key] = {};
      value.forEach(o => {
        valuesYamlObj[key][o.key] = o.before[o.key];
      });
    }
  });

  const prefixDocs = trimIndent(`|# To control the output of the manifests, you can use the following properties in the globals section:
    |# FYI helm chart has the concept globals but it's with the property name "global" and not "globals"
    |# helmifyPrefix: "globals"
    |# globals:
    |#  addStandardHeaders: false # by default it's true, \`true\` will add the standard helm headers to the manifests
    |#  namespace: "namespace"
    |#  namePrefix: "namePrefix"
    |#  nameSuffix: "nameSuffix"
    |#  nameReleasePrefix: "nameReleasePrefix"
    |#  labels:
    |#    key: "label"
    |#  annotations:
    |#    key: "annotation"
    |#  resources:
    |#    - name: "resource"
    |#      version: "v1"
    |#      kind: "Resource"
    |#   images:
    |#    - image: "old-image"
    |#      newName: "new-image"
    |#      newTag: "new-tag"
    |#      digest: "digest"
    |#      pullSecrets:
    |#       - name: "pull-secret"
    |#  patches:
    |#    - target:
    |#      group: "apps"
    |#      version: "v1"
    |#      kind: "Deployment"
    |#      name: "nginx-deployment"
    |#    ops:
    |#      - op: "add"
    |#        path: "/spec/template/spec/containers/0/env/-"
    |#        value:
    |#          name: "LOG_LEVEL"
    |#          value: "debug"`)

  // if values.yaml exists in kustomizeDir parse it and add to valuesYamlObj
  // The process is that the source kustomize dir can have a values.yaml file that will be merged with the values.yaml file generated by helmify-kustomize.
  // The motivation is to allow influnce the default values of the chart or even comments.
  let valuesYamlObjFromFile: any = {};
  let sourceValuesContent = '';
  if (hasTemplatedValuesYaml) {
    try {
      sourceValuesContent = fs.readFileSync(kustomizeValuesYaml, 'utf8');
      valuesYamlObjFromFile = yamlParse(sourceValuesContent) as Record<string, string>;
    } catch (e) {
      console.error(`Error parsing source values.yaml: ${e}`);
      console.error(`ignoring source values.yaml`);
    }
  }

  // Merge the generated values with source values (without anchor references yet)
  // Note: overlay is a runtime parameter, not part of values.yaml
  const mergedValues = {
    ...valuesYamlObj,
    ...valuesYamlObjFromFile,
  };

  // If source values.yaml exists and has content, we need to preserve anchors/references
  if (sourceValuesContent) {
    // Strategy: Read the source YAML, deep merge the values, preserve the rest
    try {
      const doc = parseDocument(sourceValuesContent);

      // Deep merge function that preserves YAML structure
      function deepMergeIntoDocument(target: any, source: any, path: string[] = []) {
        for (const [key, value] of Object.entries(source)) {
          const currentPath = [...path, key];

          if (target.has(key)) {
            const existingValue = target.get(key);
            // If both are objects, recursively merge
            if (existingValue && typeof existingValue === 'object' &&
              !Array.isArray(existingValue) && value && typeof value === 'object' &&
              !Array.isArray(value)) {
              deepMergeIntoDocument(existingValue, value, currentPath);
            }
            // If the existing value is not an object or the new value is not an object,
            // we don't overwrite (preserve existing values)
          } else {
            // Key doesn't exist, add it
            target.set(key, value);
          }
        }
      }

      // Deep merge the generated values into the document
      deepMergeIntoDocument(doc, valuesYamlObj);

      // Ensure overlay key exists
      if (!doc.has('overlay')) {
        doc.set('overlay', '');
      }

      if (enabledDynamicAnchorReplacement) {

        const yamlTemplateFile = [
          generateValuesYamlTemplate(chartPrefixHash, thisPackageId, doc.toString()),
        ].join(`\n`)

        fs.writeFileSync(
          path.join(cwd, targetFolder, 'templates', '_values.yaml.tpl'),
          yamlTemplateFile,
          'utf8'
        );
      }

      // Remove manifests and globals sections from the values.yaml file when using templated values
      // These will only be in the template (_values.yaml.tpl)
      // This prevents static values with anchor references from overwriting templated values during mergeOverwrite
      if (hasTemplatedValuesYaml) {
        if (doc.has('manifests')) {
          doc.delete('manifests');
        }
        if (doc.has('globals')) {
          doc.delete('globals');
        }
      }

      // Write the modified document, preserving anchors and references
      fs.writeFileSync(
        path.join(cwd, targetFolder, 'values.yaml'),
        prefixDocs + "\n" + doc.toString(),
        'utf8'
      );

    } catch (e) {
      // Fallback to regular stringify if document parsing fails
      console.error(`Error preserving YAML structure: ${e}`);
      fs.writeFileSync(
        path.join(cwd, targetFolder, 'values.yaml'),
        prefixDocs + "\n" + yamlStringify(mergedValues),
        'utf8'
      );
    }
  } else {
    fs.writeFileSync(
      path.join(cwd, targetFolder, 'values.yaml'),
      prefixDocs + "\n" + yamlStringify(mergedValues),
      'utf8'
    );
  }


  // Write the chart utils file to the templates folder
  const chartUtilsContent = chartUtils(thisPackageId);
  fs.writeFileSync(path.join(targetTemplatesFolder, '_chart-utils.tpl'), chartUtilsContent, 'utf8');

  // copy the rest of the non functional files to the targetFolder (README.md, LICENSE, NOTES.txt , values.schema.json)
  const nonFunctionalFiles = ['README.md', 'LICENSE', 'templates/NOTES.txt', 'values.schema.json'];
  copyFolder(fs, kustomizeDir, path.join(cwd, targetFolder), (src) => nonFunctionalFiles.includes(path.basename(src)));
}

// Utility Functions
/**
 * Checks if the valuesProp is a root property in the values.yaml object
 * @param {string} valuesProp - The property name in values.yaml
 * @returns {boolean} True if the valuesProp is a root property, false otherwise
 */
function isValuePropRoot(valuesProp: string | undefined): boolean {
  return valuesProp == undefined || valuesProp == '';
}

/**
 * Copies a folder from source to target
 * @param {FS} fs - The filesystem interface
 * @param {string} source - The source folder
 * @param {string} target - The target folder
 * @param {Function} filter - A filter function to determine if a file should be copied
 */
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
