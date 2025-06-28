import { trimIndent } from '../lang';

/**
 * Generates the content of the result.yaml file
 * @param {string} chartPrefix - The prefix of the chart that prefixes the helper name
 * @returns {string} The content of the result.yaml file
 */
export const yamlResult = (chartPrefix: string , packageId: string): string => {
  return trimIndent(`{{- $all := fromYaml (include "${chartPrefix}.yamls" (dict "Values" .Values) ) }}
{{- $kustomizeFiles := fromYaml (include "${chartPrefix}.kustomizeFiles" (dict "Values" .Values) ) }}

{{- if .Values.manifests }}
{{- range $key, $manifest := .Values.manifests }}
{{- $result := append $all.manifests (dict "spec" $manifest) }}
{{- $n := set $all "manifests" $result -}}
{{- end }}
{{- end }}

{{- range $key, $manifest := $all.manifests }}
{{- include "${packageId}.ensureMetadata" (dict "manifest" $manifest)}}
{{- if $.Values.images }}
  {{- include "${packageId}.updataImages" (dict "manifest" $manifest "images" $.Values.images)}}
{{- end}}
{{- if $.Values.globals }}
{{- include "${packageId}.setNamespace" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- include "${packageId}.setNamePrefix" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- include "${packageId}.setNameSuffix" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- include "${packageId}.nameReleasePrefix" (dict "manifest" $manifest "globals" $.Values.globals "Values" $.Values)}}
{{- include "${packageId}.labels" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- include "${packageId}.annotations" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- end}}
{{- end }}

{{- if and .Values.kustomizeFiles .Values.kustomizeFiles.include }}
{{- if .Values.kustomizeFiles.printNames}}
{{- $kustomizeManifests := fromYaml (include "${packageId}.filterManifests" (dict "manifests" $kustomizeFiles.manifests "Values" $.Values))}}
{{- include "${packageId}.printManifests"  $kustomizeManifests }}
{{- else }}
{{- include "${packageId}.printManifests" $kustomizeFiles }}
{{- end }}
{{- end }}

{{- if .Values.resources }}
{{- range $key, $manifest := .Values.resources }}
{{- $result := append $all.manifests (dict "spec" $manifest) }}
{{- $n := set $all "manifests" $result -}}
{{- end }}
{{- end }}

{{- include "${packageId}.printManifests" $all }}
        `);
};
