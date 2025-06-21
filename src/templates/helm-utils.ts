import { trimIndent } from '../lang';

/**
 * Generates the content of the chart utils file
 * @param {string} packageId - The id of the package that is used to prefix the helpers
 * @returns {string} The content of the chart utils file
 */
export const chartUtils = (packageId: string): string => {
  return trimIndent(`
{{- define "${packageId}.filterManifests" }}
{{- $filtered := list }}
{{- range $i, $v := .manifests }}
  {{- $name := $v.metadata.folder }}
  {{- if has $name $.Values.kustomizeFiles.printNames }}
    {{- $filtered = append $filtered $v }}
  {{- end }}
{{- end }}
manifests:
{{- toYaml $filtered | nindent 2 }}
{{- end }}


{{- define "${packageId}.printManifests" }}
{{- range $key, $manifest := .manifests }}
{{ toYaml $manifest.spec}}
---
{{- end }}
{{- end}}

{{- define "${packageId}.ensureMetadata" }} 
{{- /* gets manifestWarpper */}}
{{- if .manifest.spec.metadata }}
{{- else }}
{{- $n := set .manifest.spec "metadata" dict -}}
{{- end }}
{{- end}}

{{- define "${packageId}.setNamespace" }} 
{{- if .globals.namespace}}
{{- $n := set .manifest.spec.metadata "namespace" .globals.namespace -}}
{{- end }}
{{- end }}

{{- define "${packageId}.setNamePrefix" }} 
{{- if .globals.namePrefix}}
{{- if .manifest.spec.metadata.name }}
{{- $n := set .manifest.spec.metadata "name" (print .globals.namePrefix .manifest.spec.metadata.name ) -}}
{{- else }}
{{- $n := set .manifest.spec.metadata "name"  .globals.namePrefix -}}
{{- end }}
{{- end }}
{{- end }}

{{- define "${packageId}.setNameSuffix" }} 
{{- if .globals.nameSuffix}}
{{- if .manifest.spec.metadata.name }}
{{- $n := set .manifest.spec.metadata "name" (print .manifest.spec.metadata.name .globals.nameSuffix) -}}
{{- else }}
{{- $n := set .manifest.spec.metadata "name"  .globals.nameSuffix -}}
{{- end }}
{{- end }}
{{- end }}

{{- define "${packageId}.nameReleasePrefix" }} 
{{- if .globals.nameReleasePrefix}}
{{- if .manifest.spec.metadata.name }}
{{- $n := set .manifest.spec.metadata "name" (print .Values.Release.name "-" .manifest.spec.metadata.name) -}}
{{- else }}
{{- $n := set .manifest.spec.metadata "name"  .Values.Release -}}
{{- end }}
{{- end }}
{{- end }}


{{- define "${packageId}.labels" }} 
{{- if .globals.labels}}
{{- if .manifest.spec.metadata.labels }}
{{- else }}
{{- $n := set .manifest.spec.metadata "labels" dict -}}
{{- end }}
{{- $n := merge .manifest.spec.metadata.labels .globals.labels }}
{{- end }}
{{- end }}

{{- define "${packageId}.annotations" }} 
{{- if .globals.annotations}}
{{- if .manifest.spec.metadata.annotations }}
{{- else }}
{{- $n := set .manifest.spec.metadata "annotations" dict -}}
{{- end }}
{{- $n := merge .manifest.spec.metadata.annotations .globals.annotations }}
{{- end }}
{{- end }}


{{- define "${packageId}.addStandardHeaders" -}}
{{- if .manifest.spec.metadata.labels }}
{{- else }}
{{- $n := set .manifest.spec.metadata "labels" dict -}}
{{- end }}
{{- if or (not .globals) (not (eq .globals.addStandardHeaders false)) }}
    {{- $n := set .manifest.spec.metadata.labels "helmify-kustomize.local/overlay" .Values.overlay }}
{{- end}}
{{- if or (not .globals) (not (eq .globals.addStandardHeaders false)) }}
    {{- $n := set .manifest.spec.metadata.labels "app.kubernetes.io/name" .Chart.Name }}
    {{- $n := set .manifest.spec.metadata.labels "app.kubernetes.io/instance" .Release.Name }}
    {{- $n := set .manifest.spec.metadata.labels "app.kubernetes.io/version" .Chart.AppVersion  }}
{{- end}}
{{- end -}}

{{- define "${packageId}.updataImages" }} 
{{$images := .images}}
{{- if and (hasKey .manifest.spec "spec") (hasKey .manifest.spec.spec "template") (hasKey .manifest.spec.spec.template "spec") (hasKey .manifest.spec.spec.template.spec "containers") }}
  {{- range $j, $container := .manifest.spec.spec.template.spec.containers }}
    {{- if hasKey $container "image" }}
      {{- $currentImage := $container.image }}

      {{- range $i, $image := $images }}
      
        {{- if regexMatch (printf "^%s(:.*)?$" $image.image) $currentImage }}
          {{ $newName := include "image.name"  $container.image }}
          {{- if $image.newName}}
            {{- $newName = $image.newName}}
          {{- end}}
          {{ $newTag := include "image.tag"  $container.image }}
          {{- if $image.newTag }}
          {{- $newTag = printf ":%s" (print $image.newTag)}}
          {{- end }}
          {{ $newDigest := include "image.digest"  $container.image }}
          {{- if $image.digest }}
            {{- $newDigest = printf "@%s" (print $image.digest) }}
          {{- end}}
          {{- $newImage := printf "%s%s%s" $newName $newTag $newDigest }}
          {{- $container = set $container "image" $newImage }}
          
          {{- if $image.pullSecrets}}
          {{- $n := set $.manifest.spec.spec.template.spec "imagePullSecrets" $image.pullSecrets}}
          {{- end}}
        {{- end }}
      {{- end }}
      
    {{- end }}
  {{- end }}
{{- end }}
{{- end }}


{{- define "${packageId}.image.name" -}}
{{- $url := . -}}
{{- $parts := split ":" $url -}}
{{- $beforeDigest := $parts._0 -}}
{{- $beforeTagParts := split "@" $beforeDigest -}}
{{- $beforeTag := $beforeTagParts._1 -}}
{{- $beforeTagParts._0 -}}
{{- end -}}

{{- define "${packageId}.image.tag" -}}
{{- $url := . -}}
{{- $parts := split ":" $url -}}
{{- if gt (len $parts) 1 -}}
  {{- $tagAndDigest := $parts._1 -}}
  {{- $tagParts := split "@" $tagAndDigest -}}
  {{- $tag := $tagParts._0 -}}
  :{{- $tag -}}
{{- else -}}
:latest
{{- end -}}
{{- end -}}

{{- define "${packageId}.image.digest" -}}
{{- $url := . -}}
{{- $parts := split "@" $url -}}
{{- if gt (len $parts) 1 -}}
  {{- $digest := $parts._1 -}}
  @{{- $digest -}}
{{- else -}}
{{- end -}}
{{- end -}}

`);
};
