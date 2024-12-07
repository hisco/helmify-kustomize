
{{- define "yamls" }}
{{- if .overlay }}

{{- if eq .overlay "base" }}
manifests:
  - spec:
      kind: ingress
      metadata: 
        name: test
        labels:
          key: 1
  - spec:
      kind: deployment
{{- end }}

{{- else }}
manifests: []
{{- end }}
{{- end }} 

{{- define "kustomizeFiles" }}
manifests:
  - metadata:
      folder: base
    spec:
      apiVersion: kustomize.config.k8s.io/v1beta1
      commonLabels:
        app: some-backend
        app.kubernetes.io/name: some-backend
      configMapGenerator:
      - envs:
        - .env
        name: some-backend-configmap
      generatorOptions:
        disableNameSuffixHash: true
      kind: Kustomization
      resources:
      - deployment.yaml
      - service.yaml
      - podmonitoring.yaml

  - metadata:
      folder: overlays/dev
    spec:
      apiVersion: kustomize.config.k8s.io/v1beta1
      components:
      - ../../components/ingress
      configMapGenerator:
      - behavior: merge
        envs:
        - .env
        name: some-backend-configmap
{{- end }}

{{- define "filterManifests" }}
{{- $filtered := list }}
{{- range $i, $v := .manifests }}
  {{- $name := $v.metadata.file }}
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

{{- $all := fromYaml (include "yamls" (dict "overlay" .Values.overlay) ) }}
{{- $kustomizeFiles := fromYaml (include "kustomizeFiles" dict ) }}

{{- if .Values.manifests }}
{{- range $key, $manifest := .Values.manifests }}
{{- $result := append $all.manifests (dict "spec" $manifest) }}
{{- $n := set $all "manifests" $result -}}
{{- end }}
{{- end }}

{{- range $key, $manifest := $all.manifests }}
{{- include "ensureMetadata" (dict "manifest" $manifest)}}
{{- if $.Values.globals }}
{{- include "setNamespace" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- include "setNamePrefix" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- include "setNameSuffix" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- include "nameReleasePrefix" (dict "manifest" $manifest "globals" $.Values.globals "Values" $.Values)}}
{{- include "labels" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- include "annotations" (dict "manifest" $manifest "globals" $.Values.globals)}}
{{- end}}
{{- end }}

{{- if and .Values.kustomizeFiles .Values.kustomizeFiles.include }}
{{- if .Values.kustomizeFiles.printNames}}
{{- $kustomizeManifests := fromYaml (include "filterManifests" (dict "manifests" $kustomizeFiles.manifests "Values" $.Values))}}
{{- include "printManifests"  $kustomizeManifests }}
{{- else }}
{{- include "printManifests" $kustomizeFiles}}
{{- end }}
{{- end }}

{{- if .Values.crds }}
{{- range $key, $manifest := .Values.crds }}
{{- $result := append $all.manifests (dict "spec" $manifest) }}
{{- $n := set $all "manifests" $result -}}
{{- end }}
{{- end }}

{{- include "printManifests" $all}}








