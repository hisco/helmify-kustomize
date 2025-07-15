{{- define "chartUtils.getGlobals" }}
{{- if .Values.helmifyPrefix }}
  {{- index .Values .Values.helmifyPrefix }}
{{- else }}
  {{- .Values.globals }}
{{- end }}
{{- end }}

{{- define "chartUtils.filterManifests" }}
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


{{- define "chartUtils.printManifests" }}
{{- range $key, $manifest := .manifests }}
{{ toYaml $manifest.spec}}
---
{{- end }}
{{- end}}

{{- define "chartUtils.ensureMetadata" }} 
{{- /* gets manifestWarpper */}}
{{- if .manifest.spec.metadata }}
{{- else }}
{{- $n := set .manifest.spec "metadata" dict -}}
{{- end }}
{{- end}}

{{- define "chartUtils.setNamespace" }} 
{{- if .globals.namespace}}
{{- $n := set .manifest.spec.metadata "namespace" .globals.namespace -}}
{{- end }}
{{- end }}

{{- define "chartUtils.setNamePrefix" }} 
{{- if .globals.namePrefix}}
{{- if .manifest.spec.metadata.name }}
{{- $n := set .manifest.spec.metadata "name" (print .globals.namePrefix .manifest.spec.metadata.name ) -}}
{{- else }}
{{- $n := set .manifest.spec.metadata "name"  .globals.namePrefix -}}
{{- end }}
{{- end }}
{{- end }}

{{- define "chartUtils.setNameSuffix" }} 
{{- if .globals.nameSuffix}}
{{- if .manifest.spec.metadata.name }}
{{- $n := set .manifest.spec.metadata "name" (print .manifest.spec.metadata.name .globals.nameSuffix) -}}
{{- else }}
{{- $n := set .manifest.spec.metadata "name"  .globals.nameSuffix -}}
{{- end }}
{{- end }}
{{- end }}

{{- define "chartUtils.nameReleasePrefix" }} 
{{- if .globals.nameReleasePrefix}}
{{- if .manifest.spec.metadata.name }}
{{- $n := set .manifest.spec.metadata "name" (print .Values.Release.name "-" .manifest.spec.metadata.name) -}}
{{- else }}
{{- $n := set .manifest.spec.metadata "name"  .Values.Release -}}
{{- end }}
{{- end }}
{{- end }}

{{- define "chartUtils.updateConfigMap" }}
{{- $cmName := .name }}
{{- $patch  := .data }}
{{- $manifest := .manifest }}
{{- if and (eq $manifest.spec.kind "ConfigMap") (eq $manifest.spec.metadata.name $cmName) }}
  {{- if not $manifest.spec.data }}
    {{- $n := set $manifest.spec "data" dict }}
  {{- end }}
  {{- range $k, $v := $patch }}
    {{- $key := printf "%v" $k }}
    {{- $n := set $manifest.spec.data $key (printf "%v" $v) }}
  {{- end }}
{{- end }}
{{- end }}


{{- define "chartUtils.labels" }} 
{{- if .globals.labels}}
{{- if .manifest.spec.metadata.labels }}
{{- else }}
{{- $n := set .manifest.spec.metadata "labels" dict -}}
{{- end }}
{{- $n := merge .manifest.spec.metadata.labels .globals.labels }}
{{- end }}
{{- end }}

{{- define "chartUtils.annotations" }} 
{{- if .globals.annotations}}
{{- if .manifest.spec.metadata.annotations }}
{{- else }}
{{- $n := set .manifest.spec.metadata "annotations" dict -}}
{{- end }}
{{- $n := merge .manifest.spec.metadata.annotations .globals.annotations }}
{{- end }}
{{- end }}


{{- define "chartUtils.addStandardHeaders" -}}
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

{{- define "chartUtils.updataImages" }} 
{{- $images := "" }}
{{- if and .globals (hasKey .globals "images") }}
  {{- $images = .globals.images }}
{{- else if .images }}
  {{- $images = .images }}
{{- end }}
{{- if and $images (hasKey .manifest.spec "spec") (hasKey .manifest.spec.spec "template") (hasKey .manifest.spec.spec.template "spec") (hasKey .manifest.spec.spec.template.spec "containers") }}
  {{- range $j, $container := .manifest.spec.spec.template.spec.containers }}
    {{- if hasKey $container "image" }}
      {{- $currentImage := $container.image }}

      {{- range $i, $image := $images }}
      
        {{- if regexMatch (printf "^%s(:.*)?$" $image.image) $currentImage }}
          {{ $newName := include "chartUtils.image.name"  $container.image }}
          {{- if $image.newName}}
            {{- $newName = $image.newName}}
          {{- end}}
          {{ $newTag := include "chartUtils.image.tag"  $container.image }}
          {{- if $image.newTag }}
          {{- $newTag = printf ":%s" (print $image.newTag)}}
          {{- end }}
          {{ $newDigest := include "chartUtils.image.digest"  $container.image }}
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


{{- define "chartUtils.image.name" -}}
{{- $url := . -}}
{{- $withoutDigest := $url -}}
{{- if contains "@" $url -}}
  {{- $digestParts := split "@" $url -}}
  {{- $withoutDigest = $digestParts._0 -}}
{{- end -}}
{{- if contains ":" $withoutDigest -}}
  {{- $tagParts := split ":" $withoutDigest -}}
  {{- $tagParts._0 -}}
{{- else -}}
  {{- $withoutDigest -}}
{{- end -}}
{{- end -}}

{{- define "chartUtils.image.tag" -}}
{{- $url := . -}}
{{- $withoutDigest := $url -}}
{{- if contains "@" $url -}}
  {{- $digestParts := split "@" $url -}}
  {{- $withoutDigest = $digestParts._0 -}}
{{- end -}}
{{- $parts := split ":" $withoutDigest -}}
{{- if gt (len $parts) 1 -}}
  {{- $tag := $parts._1 -}}
  :{{- $tag -}}
{{- else -}}
:latest
{{- end -}}
{{- end -}}

{{- define "chartUtils.image.digest" -}}
{{- $url := . -}}
{{- $parts := split "@" $url -}}
{{- if gt (len $parts) 1 -}}
  {{- $digest := $parts._1 -}}
  @{{- $digest -}}
{{- else -}}
{{- end -}}
{{- end -}}