import { indentYaml, trimIndent } from '../lang';

/**
 * Generates a Helm template string for a single Kustomize overlay
 * @param {string} overlay - The path to the overlay directory relative to the base
 * @param {string} content - The raw YAML content generated from building the overlay
 * @returns {string} A Helm template string containing the overlay configuration
 */
export const singleOverlay = (overlay: string, content: string): string => {
  const manifests = content
    .split('---')
    .map((manifest) => manifest.trim())
    .filter((manifest) => manifest.length > 0);

  return trimIndent(`|{{- if eq .Values.overlay "${overlay}" }}
        |manifests:
        |${
          manifests
            .map((manifest) =>
              trimIndent(`|  - spec: 
                    |${indentYaml(manifest, 6)}`)
            )
            .join('\n')
        }
        |{{- else}}
        |{{- end }}`);
};
