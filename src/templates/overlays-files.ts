import { trimIndent } from '../lang';
import { singleOverlay } from './single-overlay-content';

/**
 * Interface representing the result of processing a Kustomize overlay
 * @interface OverlayResult 
 * @property {string} overlay - The path to the overlay directory relative to the base
 * @property {string} content - The raw YAML content generated from building the overlay
 */
interface OverlayResult {
  overlay: string;
  content: string;
}
/**
 * Interface representing the result of processing a Kustomize overlay
 * @interface OverlayResult 
 * @property {string} overlay - The path to the overlay directory relative to the base
 * @property {string} content - The raw YAML content generated from building the overlay
 */

export const overlaysResults = (chartPrefix: string, overlayResults: OverlayResult[]): string => {
  return trimIndent(`|{{- define "${chartPrefix}.yamls" }}
        |{{- if .Values.overlay }}
        |${overlayResults
          .map(({ overlay, content }) => singleOverlay(overlay, content))
          .join('\n')}
        |{{- else }}
        |manifests: []
        |{{- end }}{{- end }}`);
};