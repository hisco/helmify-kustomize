#!/usr/bin/env node

import * as cp from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { stringify as yamlStringify } from 'yaml';
import { trimIndent } from './lang';
import { kustomizeFiles } from './templates/kustomize-files';
import { overlaysResults } from './templates/overlays-files';
import { FS, fsDefault, groupBy, randomString } from './utils';


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
}: WrapKustomizeOptions): Promise<void> {
  const kustomizeDir = /^\./.test(directory) ? path.resolve(cwd, directory) : directory;
  const tempFolder = path.join(kustomizeDir, '.helmify-kustomize-build');

  const targetTemplatesFolder = path.join(cwd, targetFolder, 'templates');
  copyFolder(fs, kustomizeDir, tempFolder, (src) => !src.includes('.helmify-kustomize-build'));

  const overlaysDir = path.join(tempFolder, 'overlays');
  const overlays = fs.readdirSync(overlaysDir).filter((file) => fs.statSync(path.join(overlaysDir, file)).isDirectory());

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

    fs.writeFileSync(envPath, Object.entries(after).map(([k, v]) => `${k}=${v}`).join('\n'), 'utf8');
  });

  const paramsRegex = new RegExp(Object.keys(mapRandomStringsToParametrize).join('|'), 'g');

  const replaceParams = (content: string) =>
    content.replace(paramsRegex, (match) => {
      const param = mapRandomStringsToParametrize[match];
      if (!param) return match;
      return `{{ .Values.${param.valuesProp}.${param.key} }}`;
    });

  const kustomizeManifestsResults = await Promise.all(
    overlays.map(async (overlay) => {
      const overlayPath = path.join(overlaysDir, overlay);
      const output = execSync(`kustomize build ${overlayPath} ${kustomizeCliOptions}`, { encoding: 'utf-8', cwd: tempFolder });
      return { overlay: `overlays/${overlay}`, content: replaceParams(output) };
    })
  );

  const resultContent = overlaysResults(kustomizeManifestsResults);
  fs.mkdirSync(targetTemplatesFolder, { recursive: true });
  fs.writeFileSync(path.join(targetTemplatesFolder, '_overlays-content.tpl'), resultContent, 'utf8' );

  const kustomizationFiles = getKustomizationFiles(fs, kustomizeDir);
  const kustomizeHelperContent = kustomizeFiles(kustomizationFiles);
  fs.writeFileSync(path.join(targetTemplatesFolder, '_kustomize-files.tpl'), kustomizeHelperContent, 'utf8');

  // copy from static to targetTemplatesFolder
  copyFolder(fs, path.join(__dirname, 'static'), targetTemplatesFolder);
  
  const groups = groupBy(parametrizeResults, (o) => o.valuesProp);
  const valuesYamlObj = Object.fromEntries(
    Array.from(groups.entries()).map(([key, value]) => [key, Object.fromEntries(value.map(o => [o.key, o.before[o.key]]))])
  );

  const prefixDocs = trimIndent(`|# globals:
    |#  namespace: "namespace"
    |#  namePrefix: "namePrefix"
    |#  nameSuffix: "nameSuffix"
    |#  nameReleasePrefix: "nameReleasePrefix"
    |#  labels:
    |#    key: "label"
    |#  annotations:
    |#    key: "annotation"`)
  fs.writeFileSync(
    path.join(cwd, targetFolder, 'values.yaml'),
    prefixDocs+"\n"+trimIndent(yamlStringify({
      overlay: '',
      ...valuesYamlObj,
    })),
    'utf8'
  );

  fs.writeFileSync(
    path.join(cwd,targetFolder, 'Chart.yaml'),
    trimIndent(`|apiVersion: v2\n|name: ${chartName}\n|version: ${chartVersion}\n|description: ${chartDescription}`),
    'utf8'
  );
}

// Utility Functions
function copyFolder(fs: FS, source: string, target: string, filter: (src: string, dest: string) => boolean = () => true): void {
  if (!fs.existsSync(source)) throw new Error(`Source folder does not exist: ${source}`);
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });

  fs.readdirSync(source).forEach((entry) => {
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
    fs.readdirSync(directory).forEach((file) => {
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
