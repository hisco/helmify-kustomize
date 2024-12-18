
{{- define "filterManifests" }}
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


{{- define "printManifests" }}
{{- range $key, $manifest := .manifests }}
{{ toYaml $manifest.spec}}
---
{{- end }}
{{- end}}

{{- define "ensureMetadata" }} 
{{- /* gets manifestWarpper */}}
{{- if .manifest.spec.metadata }}
{{- else }}
{{- $n := set .manifest.spec "metadata" dict -}}
{{- end }}
{{- end}}

{{- define "setNamespace" }} 
{{- if .globals.namespace}}
{{- $n := set .manifest.spec.metadata "namespace" .globals.namespace -}}
{{- end }}
{{- end }}

{{- define "setNamePrefix" }} 
{{- if .globals.namePrefix}}
{{- if .manifest.spec.metadata.name }}
{{- $n := set .manifest.spec.metadata "name" (print .globals.namePrefix .manifest.spec.metadata.name ) -}}
{{- else }}
{{- $n := set .manifest.spec.metadata "name"  .globals.namePrefix -}}
{{- end }}
{{- end }}
{{- end }}

{{- define "setNameSuffix" }} 
{{- if .globals.nameSuffix}}
{{- if .manifest.spec.metadata.name }}
{{- $n := set .manifest.spec.metadata "name" (print .manifest.spec.metadata.name .globals.nameSuffix) -}}
{{- else }}
{{- $n := set .manifest.spec.metadata "name"  .globals.nameSuffix -}}
{{- end }}
{{- end }}
{{- end }}

{{- define "nameReleasePrefix" }} 
{{- if .globals.nameReleasePrefix}}
{{- if .manifest.spec.metadata.name }}
{{- $n := set .manifest.spec.metadata "name" (print .Values.Release.name "-" .manifest.spec.metadata.name) -}}
{{- else }}
{{- $n := set .manifest.spec.metadata "name"  .Values.Release -}}
{{- end }}
{{- end }}
{{- end }}


{{- define "labels" }} 
{{- if .globals.labels}}
{{- if .manifest.spec.metadata.labels }}
{{- else }}
{{- $n := set .manifest.spec.metadata "labels" dict -}}
{{- end }}
{{- $n := merge .manifest.spec.metadata.labels .globals.labels }}
{{- end }}
{{- end }}

{{- define "annotations" }} 
{{- if .globals.annotations}}
{{- if .manifest.spec.metadata.annotations }}
{{- else }}
{{- $n := set .manifest.spec.metadata "annotations" dict -}}
{{- end }}
{{- $n := merge .manifest.spec.metadata.annotations .globals.annotations }}
{{- end }}
{{- end }}
