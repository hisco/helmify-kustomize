{{- define "chartUtils.applyPatches" -}}
{{- $object := .object -}}
{{- $patches := .patches -}}
{{- range $patches -}}
  {{- if eq .op "add" -}}
    {{- $path := .path -}}
    {{- $value := .value -}}
    {{- $pathSegments := splitList "/" (trimPrefix "/" $path) -}}
    {{- $lastIndex := sub (len $pathSegments) 1 -}}
    {{- $lastSegment := index $pathSegments $lastIndex -}}
    
    {{- if eq $lastSegment "-" -}}
      {{- /* Array append operation */ -}}
      {{- $current := $object -}}
      {{- $stopIndex := sub $lastIndex 1 -}}
      {{- range $i, $segment := $pathSegments -}}
        {{- if lt $i $stopIndex -}}
          {{- if $current -}}
            {{- if regexMatch "^[0-9]+$" $segment -}}
              {{- $current = index $current (int $segment) -}}
            {{- else -}}
              {{- if not (hasKey $current $segment) -}}
                {{- $_ := set $current $segment (dict) -}}
              {{- end -}}
              {{- $current = index $current $segment -}}
            {{- end -}}
          {{- end -}}
        {{- end -}}
      {{- end -}}
      {{- $parentSegment := index $pathSegments (sub $lastIndex 1) -}}
      {{- $existingArray := index $current $parentSegment -}}
      {{- if $existingArray -}}
        {{- $_ := set $current $parentSegment (append $existingArray $value) -}}
      {{- else -}}
        {{- $_ := set $current $parentSegment (list $value) -}}
      {{- end -}}
    {{- else -}}
      {{- /* Regular property set operation */ -}}
      {{- if eq (len $pathSegments) 1 -}}
        {{- /* Direct property on root object */ -}}
        {{- if regexMatch "^[0-9]+$" $lastSegment -}}
          {{- $_ := set $object (int $lastSegment) $value -}}
        {{- else -}}
          {{- $_ := set $object $lastSegment $value -}}
        {{- end -}}
      {{- else if eq (len $pathSegments) 2 -}}
        {{- /* One level deep - create intermediate if needed */ -}}
        {{- $firstSegment := index $pathSegments 0 -}}
        {{- if not (hasKey $object $firstSegment) -}}
          {{- $_ := set $object $firstSegment (dict) -}}
        {{- end -}}
        {{- $intermediate := index $object $firstSegment -}}
        {{- if regexMatch "^[0-9]+$" $lastSegment -}}
          {{- $_ := set $intermediate (int $lastSegment) $value -}}
        {{- else -}}
          {{- $_ := set $intermediate $lastSegment $value -}}
        {{- end -}}
      {{- else if eq (len $pathSegments) 3 -}}
        {{- /* Two levels deep - create intermediates if needed */ -}}
        {{- $firstSegment := index $pathSegments 0 -}}
        {{- $secondSegment := index $pathSegments 1 -}}
        {{- if not (hasKey $object $firstSegment) -}}
          {{- $_ := set $object $firstSegment (dict) -}}
        {{- end -}}
        {{- $firstLevel := index $object $firstSegment -}}
        {{- if not (hasKey $firstLevel $secondSegment) -}}
          {{- $_ := set $firstLevel $secondSegment (dict) -}}
        {{- end -}}
        {{- $secondLevel := index $firstLevel $secondSegment -}}
        {{- if regexMatch "^[0-9]+$" $lastSegment -}}
          {{- $_ := set $secondLevel (int $lastSegment) $value -}}
        {{- else -}}
          {{- $_ := set $secondLevel $lastSegment $value -}}
        {{- end -}}
      {{- else -}}
        {{- /* Multi-level deep - build recursively */ -}}
        {{- $current := $object -}}
        {{- range $i, $segment := $pathSegments -}}
          {{- if lt $i $lastIndex -}}
            {{- if $current -}}
              {{- if regexMatch "^[0-9]+$" $segment -}}
                {{- $current = index $current (int $segment) -}}
              {{- else -}}
                {{- if not (hasKey $current $segment) -}}
                  {{- $_ := set $current $segment (dict) -}}
                {{- end -}}
                {{- $current = index $current $segment -}}
              {{- end -}}
            {{- end -}}
          {{- end -}}
        {{- end -}}
        {{- if $current -}}
          {{- if regexMatch "^[0-9]+$" $lastSegment -}}
            {{- $_ := set $current (int $lastSegment) $value -}}
          {{- else -}}
            {{- $_ := set $current $lastSegment $value -}}
          {{- end -}}
        {{- end -}}
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
  {{- else if eq .op "replace" -}}
    {{- $path := .path -}}
    {{- $value := .value -}}
    {{- $pathSegments := splitList "/" (trimPrefix "/" $path) -}}
    {{- $current := $object -}}
    {{- $lastIndex := sub (len $pathSegments) 1 -}}
    {{- $lastSegment := index $pathSegments $lastIndex -}}
    
    {{- /* Navigate to the parent of the target location */ -}}
    {{- range $i, $segment := $pathSegments -}}
      {{- if lt $i $lastIndex -}}
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
        {{- /* Replace array element */ -}}
        {{- $_ := set $current (int $lastSegment) $value -}}
      {{- else -}}
        {{- /* Replace object property */ -}}
        {{- $_ := set $current $lastSegment $value -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- end -}}

{{- /* Enhanced helper function to check if a resource matches a target selector */ -}}
{{- define "chartUtils.matchesTarget" -}}
{{- $resource := .resource -}}
{{- $target := .target -}}
{{- $match := true -}}

{{- /* Extract resource properties */ -}}
{{- $apiVersion := $resource.apiVersion -}}
{{- $kind := $resource.kind -}}
{{- $name := $resource.metadata.name -}}
{{- $namespace := $resource.metadata.namespace | default "" -}}
{{- $labels := $resource.metadata.labels | default dict -}}
{{- $annotations := $resource.metadata.annotations | default dict -}}

{{- /* Split apiVersion into group and version */ -}}
{{- $group := "" -}}
{{- $version := $apiVersion -}}
{{- if contains "/" $apiVersion -}}
  {{- $parts := splitList "/" $apiVersion -}}
  {{- $group = index $parts 0 -}}
  {{- $version = index $parts 1 -}}
{{- end -}}

{{- /* Check group matching (with wildcard support) */ -}}
{{- if hasKey $target "group" -}}
  {{- if ne $group $target.group -}}
    {{- $match = false -}}
  {{- end -}}
{{- end -}}

{{- /* Check version matching (with wildcard support) */ -}}
{{- if hasKey $target "version" -}}
  {{- if ne $version $target.version -}}
    {{- $match = false -}}
  {{- end -}}
{{- end -}}

{{- /* Check kind matching (with regex support) */ -}}
{{- if hasKey $target "kind" -}}
  {{- $kindPattern := $target.kind -}}
  {{- if not (regexMatch $kindPattern $kind) -}}
    {{- $match = false -}}
  {{- end -}}
{{- end -}}

{{- /* Check name matching (exact or regex support) */ -}}
{{- if hasKey $target "name" -}}
  {{- $namePattern := $target.name -}}
  {{- /* Check if the pattern contains regex special characters */ -}}
  {{- if or (contains "^" $namePattern) (contains "$" $namePattern) (contains ".*" $namePattern) (contains "+" $namePattern) (contains "?" $namePattern) (contains "[" $namePattern) (contains "(" $namePattern) -}}
    {{- /* Use regex matching for patterns */ -}}
    {{- if not (regexMatch $namePattern $name) -}}
      {{- $match = false -}}
    {{- end -}}
  {{- else -}}
    {{- /* Use exact string matching for simple names */ -}}
    {{- if ne $name $namePattern -}}
      {{- $match = false -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- /* Check namespace matching */ -}}
{{- if hasKey $target "namespace" -}}
  {{- if ne $namespace $target.namespace -}}
    {{- $match = false -}}
  {{- end -}}
{{- end -}}

{{- /* Check label selector matching */ -}}
{{- if hasKey $target "labelSelector" -}}
  {{- $labelSelector := $target.labelSelector -}}
  {{- $labelMatch := include "chartUtils.matchesLabelSelector" (dict "labels" $labels "selector" $labelSelector) -}}
  {{- if ne (trim $labelMatch) "true" -}}
    {{- $match = false -}}
  {{- end -}}
{{- end -}}

{{- /* Check annotation selector matching */ -}}
{{- if hasKey $target "annotationSelector" -}}
  {{- $annotationSelector := $target.annotationSelector -}}
  {{- $annotationMatch := include "chartUtils.matchesAnnotationSelector" (dict "annotations" $annotations "selector" $annotationSelector) -}}
  {{- if ne (trim $annotationMatch) "true" -}}
    {{- $match = false -}}
  {{- end -}}
{{- end -}}

{{- $match -}}
{{- end -}}

{{- /* Helper function to check label selector matching */ -}}
{{- define "chartUtils.matchesLabelSelector" -}}
{{- $labels := .labels -}}
{{- $selector := .selector -}}
{{- $match := true -}}

{{- /* Parse selector: "key1=value1,key2 in (value2,value3),key4!=value4,key5" */ -}}
{{- $conditions := splitList "," $selector -}}
{{- range $conditions -}}
  {{- $condition := . | trim -}}
  {{- if contains " in (" $condition -}}
    {{- /* Handle "key in (value1,value2)" */ -}}
    {{- $parts := splitList " in (" $condition -}}
    {{- $key := (index $parts 0) | trim -}}
    {{- $valuesPart := (index $parts 1) | trimSuffix ")" -}}
    {{- $values := splitList "," $valuesPart -}}
    {{- $labelValue := index $labels $key | default "" -}}
    {{- $found := false -}}
    {{- range $values -}}
      {{- $value := . | trim -}}
      {{- if eq $labelValue $value -}}
        {{- $found = true -}}
      {{- end -}}
    {{- end -}}
    {{- if not $found -}}
      {{- $match = false -}}
    {{- end -}}
  {{- else if contains " notin (" $condition -}}
    {{- /* Handle "key notin (value1,value2)" */ -}}
    {{- $parts := splitList " notin (" $condition -}}
    {{- $key := (index $parts 0) | trim -}}
    {{- $valuesPart := (index $parts 1) | trimSuffix ")" -}}
    {{- $values := splitList "," $valuesPart -}}
    {{- $labelValue := index $labels $key | default "" -}}
    {{- $found := false -}}
    {{- range $values -}}
      {{- $value := . | trim -}}
      {{- if eq $labelValue $value -}}
        {{- $found = true -}}
      {{- end -}}
    {{- end -}}
    {{- if $found -}}
      {{- $match = false -}}
    {{- end -}}
  {{- else if contains "!=" $condition -}}
    {{- /* Handle "key!=value" */ -}}
    {{- $parts := splitList "!=" $condition -}}
    {{- $key := (index $parts 0) | trim -}}
    {{- $value := (index $parts 1) | trim -}}
    {{- $labelValue := index $labels $key | default "" -}}
    {{- if eq $labelValue $value -}}
      {{- $match = false -}}
    {{- end -}}
  {{- else if contains "=" $condition -}}
    {{- /* Handle "key=value" */ -}}
    {{- $parts := splitList "=" $condition -}}
    {{- $key := (index $parts 0) | trim -}}
    {{- $value := (index $parts 1) | trim -}}
    {{- $labelValue := index $labels $key | default "" -}}
    {{- if ne $labelValue $value -}}
      {{- $match = false -}}
    {{- end -}}
  {{- else -}}
    {{- /* Handle "key" (existence check) */ -}}
    {{- $key := $condition | trim -}}
    {{- if not (hasKey $labels $key) -}}
      {{- $match = false -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- $match -}}
{{- end -}}

{{- /* Helper function to check annotation selector matching */ -}}
{{- define "chartUtils.matchesAnnotationSelector" -}}
{{- $annotations := .annotations -}}
{{- $selector := .selector -}}
{{- $match := true -}}

{{- /* Parse selector: "key1=value1,key2 in (value2,value3),key4!=value4,key5" */ -}}
{{- $conditions := splitList "," $selector -}}
{{- range $conditions -}}
  {{- $condition := . | trim -}}
  {{- if contains " in (" $condition -}}
    {{- /* Handle "key in (value1,value2)" */ -}}
    {{- $parts := splitList " in (" $condition -}}
    {{- $key := (index $parts 0) | trim -}}
    {{- $valuesPart := (index $parts 1) | trimSuffix ")" -}}
    {{- $values := splitList "," $valuesPart -}}
    {{- $annotationValue := index $annotations $key | default "" -}}
    {{- $found := false -}}
    {{- range $values -}}
      {{- $value := . | trim -}}
      {{- if eq $annotationValue $value -}}
        {{- $found = true -}}
      {{- end -}}
    {{- end -}}
    {{- if not $found -}}
      {{- $match = false -}}
    {{- end -}}
  {{- else if contains " notin (" $condition -}}
    {{- /* Handle "key notin (value1,value2)" */ -}}
    {{- $parts := splitList " notin (" $condition -}}
    {{- $key := (index $parts 0) | trim -}}
    {{- $valuesPart := (index $parts 1) | trimSuffix ")" -}}
    {{- $values := splitList "," $valuesPart -}}
    {{- $annotationValue := index $annotations $key | default "" -}}
    {{- $found := false -}}
    {{- range $values -}}
      {{- $value := . | trim -}}
      {{- if eq $annotationValue $value -}}
        {{- $found = true -}}
      {{- end -}}
    {{- end -}}
    {{- if $found -}}
      {{- $match = false -}}
    {{- end -}}
  {{- else if contains "!=" $condition -}}
    {{- /* Handle "key!=value" */ -}}
    {{- $parts := splitList "!=" $condition -}}
    {{- $key := (index $parts 0) | trim -}}
    {{- $value := (index $parts 1) | trim -}}
    {{- $annotationValue := index $annotations $key | default "" -}}
    {{- if eq $annotationValue $value -}}
      {{- $match = false -}}
    {{- end -}}
  {{- else if contains "=" $condition -}}
    {{- /* Handle "key=value" */ -}}
    {{- $parts := splitList "=" $condition -}}
    {{- $key := (index $parts 0) | trim -}}
    {{- $value := (index $parts 1) | trim -}}
    {{- $annotationValue := index $annotations $key | default "" -}}
    {{- if ne $annotationValue $value -}}
      {{- $match = false -}}
    {{- end -}}
  {{- else -}}
    {{- /* Handle "key" (existence check) */ -}}
    {{- $key := $condition | trim -}}
    {{- if not (hasKey $annotations $key) -}}
      {{- $match = false -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- $match -}}
{{- end -}}

{{- define "chartUtils.applyTargetedPatches" -}}
{{- $resources := .resources -}}
{{- $patches := .patches -}}
{{- range $patches -}}
  {{- $target := .target -}}
  {{- $ops := .ops -}}
  {{- range $resources -}}
    {{- $resource := . -}}
    {{- /* Check if this resource matches the target using enhanced matching */ -}}
    {{- $matches := include "chartUtils.matchesTarget" (dict "resource" $resource "target" $target) -}}
    {{- if eq (trim $matches) "true" -}}
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
  
  {{- /* Check each patch to see if it matches this manifest */ -}}
  {{- range $patches -}}
    {{- $target := .target -}}
    {{- $ops := .ops -}}
    {{- /* Check if target matches using enhanced matching */ -}}
    {{- $matches := include "chartUtils.matchesTarget" (dict "resource" $resource "target" $target) -}}
    {{- if eq (trim $matches) "true" -}}
      {{- /* Apply operations to this resource */ -}}
      {{- include "chartUtils.applyPatches" (dict "object" $resource "patches" $ops) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- end -}}