{{- define "chartUtils.applyPatches" -}}
{{- $object := .object -}}
{{- $patches := .patches -}}
{{- range $patches -}}
  {{- if eq .op "add" -}}
    {{- $path := .path -}}
    {{- $value := .value -}}
    {{- $pathSegments := splitList "/" (trimPrefix "/" $path) -}}
    {{- $current := $object -}}
    {{- $lastIndex := sub (len $pathSegments) 1 -}}
    {{- $lastSegment := index $pathSegments $lastIndex -}}
    
    {{- /* Navigate to the parent of the target location */ -}}
    {{- $stopIndex := $lastIndex -}}
    {{- if eq $lastSegment "-" -}}
      {{- $stopIndex = sub $lastIndex 1 -}}
    {{- end -}}
    {{- range $i, $segment := $pathSegments -}}
      {{- if lt $i $stopIndex -}}
        {{- /* Check if segment is numeric for array indexing */ -}}
        {{- if regexMatch "^[0-9]+$" $segment -}}
          {{- $current = index $current (int $segment) -}}
        {{- else -}}
          {{- $current = index $current $segment -}}
        {{- end -}}
      {{- end -}}
    {{- end -}}
    
    {{- if eq $lastSegment "-" -}}
      {{- /* Append to array */ -}}
      {{- $parentSegment := index $pathSegments (sub $lastIndex 1) -}}
      {{- $existingArray := index $current $parentSegment -}}
      {{- if $existingArray -}}
        {{- $_ := set $current $parentSegment (append $existingArray $value) -}}
      {{- else -}}
        {{- $_ := set $current $parentSegment (list $value) -}}
      {{- end -}}
    {{- else if regexMatch "^[0-9]+$" $lastSegment -}}
      {{- /* Array index */ -}}
      {{- if $current -}}
        {{- $_ := set $current (int $lastSegment) $value -}}
      {{- end -}}
    {{- else -}}
      {{- /* Object property */ -}}
      {{- if $current -}}
        {{- $_ := set $current $lastSegment $value -}}
      {{- end -}}
    {{- end -}}
  {{- else if eq .op "remove" -}}
    {{- $path := .path -}}
    {{- $pathSegments := splitList "/" (trimPrefix "/" $path) -}}
    {{- $current := $object -}}
    {{- $lastIndex := sub (len $pathSegments) 1 -}}
    {{- $lastSegment := index $pathSegments $lastIndex -}}
    
    {{- /* Determine navigation depth based on operation type */ -}}
    {{- $stopIndex := $lastIndex -}}
    {{- if regexMatch "^[0-9]+$" $lastSegment -}}
      {{- /* For array element removal, stop at parent of array */ -}}
      {{- $stopIndex = sub $lastIndex 1 -}}
    {{- end -}}
    
    {{- /* Navigate to the appropriate level */ -}}
    {{- range $i, $segment := $pathSegments -}}
      {{- if lt $i $stopIndex -}}
        {{- /* Check if segment is numeric for array indexing */ -}}
        {{- if regexMatch "^[0-9]+$" $segment -}}
          {{- $current = index $current (int $segment) -}}
        {{- else -}}
          {{- $current = index $current $segment -}}
        {{- end -}}
      {{- end -}}
    {{- end -}}
    
    {{- if $current -}}
      {{- if regexMatch "^[0-9]+$" $lastSegment -}}
        {{- /* Remove array element by index */ -}}
        {{- if gt $lastIndex 0 -}}
          {{- $parentSegment := index $pathSegments (sub $lastIndex 1) -}}
          {{- $existingArray := index $current $parentSegment -}}
          {{- if $existingArray -}}
            {{- $removeIndex := int $lastSegment -}}
            {{- $newArray := list -}}
            {{- range $i, $item := $existingArray -}}
              {{- if ne $i $removeIndex -}}
                {{- $newArray = append $newArray $item -}}
              {{- end -}}
            {{- end -}}
            {{- $_ := set $current $parentSegment $newArray -}}
          {{- end -}}
        {{- end -}}
      {{- else -}}
        {{- /* Remove object property */ -}}
        {{- $_ := unset $current $lastSegment -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- end -}}

{{- define "chartUtils.applyTargetedPatches" -}}
{{- $resources := .resources -}}
{{- $patches := .patches -}}
{{- range $patches -}}
  {{- $target := .target -}}
  {{- $ops := .ops -}}
  {{- range $resources -}}
    {{- $resource := . -}}
    {{- /* Check if this resource matches the target */ -}}
    {{- $apiVersion := $resource.apiVersion -}}
    {{- $kind := $resource.kind -}}
    {{- $name := $resource.metadata.name -}}
    {{- /* Split apiVersion into group and version */ -}}
    {{- $group := "" -}}
    {{- $version := $apiVersion -}}
    {{- if contains "/" $apiVersion -}}
      {{- $parts := splitList "/" $apiVersion -}}
      {{- $group = index $parts 0 -}}
      {{- $version = index $parts 1 -}}
    {{- end -}}
    
    {{- /* Check if target matches */ -}}
    {{- if and (eq $group $target.group) (eq $version $target.version) (eq $kind $target.kind) (eq $name $target.name) -}}
      {{- /* Apply operations to this resource */ -}}
      {{- include "chartUtils.applyPatches" (dict "object" $resource "patches" $ops) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- end -}}

{{- define "chartUtils.applyManifestPatchers" -}}
{{- $manifest := .manifest -}}
{{- $globals := .globals -}}
{{- if $globals.patches -}}
  {{- $patches := $globals.patches -}}
  {{- $resource := $manifest.spec -}}
  {{- $apiVersion := $resource.apiVersion -}}
  {{- $kind := $resource.kind -}}
  {{- $name := $resource.metadata.name -}}
  {{- /* Split apiVersion into group and version */ -}}
  {{- $group := "" -}}
  {{- $version := $apiVersion -}}
  {{- if contains "/" $apiVersion -}}
    {{- $parts := splitList "/" $apiVersion -}}
    {{- $group = index $parts 0 -}}
    {{- $version = index $parts 1 -}}
  {{- end -}}
  
  {{- /* Check each patch to see if it matches this manifest */ -}}
  {{- range $patches -}}
    {{- $target := .target -}}
    {{- $ops := .ops -}}
    {{- /* Check if target matches */ -}}
    {{- if and (eq $group $target.group) (eq $version $target.version) (eq $kind $target.kind) (eq $name $target.name) -}}
      {{- /* Apply operations to this resource */ -}}
      {{- include "chartUtils.applyPatches" (dict "object" $resource "patches" $ops) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- end -}}