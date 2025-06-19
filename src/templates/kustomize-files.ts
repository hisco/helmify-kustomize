import { parse, stringify } from 'yaml';
import { trimIndent } from '../lang';
/**
 * Interface representing a Kustomize configuration file
 * @interface KustomizeFile
 * @property {string} folder - The directory containing the kustomization file
 * @property {string} filePath - The full path to the kustomization file
 * @property {string} content - The raw YAML content of the kustomization file
 */
interface KustomizeFile {
  folder: string;
  filePath: string;
  content: string;
}

/**
 * Generates a Helm template helper that contains all Kustomize configuration files
 * @param {KustomizeFile[]} files - Array of Kustomize configuration files
 * @returns {string} A Helm template string containing the Kustomize configurations
 */

export const kustomizeFiles = (chartPrefix: string, files: KustomizeFile[]): string => {
  return trimIndent(`|{{- define "${chartPrefix}.kustomizeFiles" }}
        |${
          stringify({
            manifests: files.map(({ folder, filePath, content }) => {
              const manifest = parse(content);
              return {
                metadata: {
                  folder: folder,
                  filePath: filePath,
                },
                spec: manifest,
              };
            }),
          })
        }
        |{{- end }}`);
};
