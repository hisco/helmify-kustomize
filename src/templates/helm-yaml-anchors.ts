import { analyzeYamlAnchors, AnchorInfo } from "../anchor-ref";

// the following code is not longer needed as we are using a static helper
// // this will generate an helper with the name templateName that will return the value of the path
// // if the path is not found, it will return the defaultValue
// // this can be use generate a helper to get the value of a path in the values.yaml file
// // e.g references and anchors when templateName="helperName" path=["exampleReference"]. you will be able to use helper inside the chart template with $refValue := include "helperName" (dict "Values" .)
// export function generateHelmGet(namespace: string, defaultValue: string, path: (string | number)[]): string {
//   if (!path || path.length === 0) {
//     return `{{- define "${getHelperSafeGetName(namespace, path)}" -}}\n{{- "${defaultValue}" -}}\n{{- end -}}`;
//   }
  
//   let template = `{{- define "${getHelperSafeGetName(namespace, path)}" -}}\n`;
//   template += `{{- $default := "${defaultValue}" -}}\n`;
  
//   // Build the nested structure
//   let currentObject = ".Values";
//   let conditions = [];
  
//   for (let i = 0; i < path.length; i++) {
//     const segment = path[i];
//     const isLast = i === path.length - 1;
//     const varName = `$v${i}`;
    
//     if (typeof segment === 'string') {
//       // Always separate type check from hasKey check to avoid type errors
//       conditions.push({
//         type: 'map_check',
//         condition: `and ${currentObject} (kindIs "map" ${currentObject})`,
//         assignment: null,
//         finalValue: null
//       });
      
//       conditions.push({
//         type: 'key_check',
//         condition: `hasKey ${currentObject} "${segment}"`,
//         assignment: isLast ? null : `${varName} := index ${currentObject} "${segment}"`,
//         finalValue: isLast ? `index ${currentObject} "${segment}"` : null
//       });
      
//       if (!isLast) {
//         currentObject = varName;
//       }
      
//     } else if (typeof segment === 'number') {
//       // Handle array index access
//       conditions.push({
//         type: 'slice',
//         condition: `and ${currentObject} (kindIs "slice" ${currentObject})`,
//         assignment: null,
//         finalValue: null
//       });
      
//       conditions.push({
//         type: 'length',
//         condition: `gt (len ${currentObject}) ${segment}`,
//         assignment: isLast ? null : `${varName} := index ${currentObject} ${segment}`,
//         finalValue: isLast ? `index ${currentObject} ${segment}` : null
//       });
      
//       if (!isLast) {
//         currentObject = varName;
//       }
//     }
//   }
  
//   // Generate the nested if structure
//   let indent = "";
//   for (let i = 0; i < conditions.length; i++) {
//     const cond = conditions[i];
//     template += `${indent}{{- if ${cond.condition} -}}\n`;
//     indent += "  ";
    
//     if (cond.assignment) {
//       template += `${indent}{{- ${cond.assignment} -}}\n`;
//     }
    
//     if (cond.finalValue) {
//       // This is the innermost condition with the final value
//       template += `${indent}{{- ${cond.finalValue} -}}\n`;
//     }
//   }
  
//   // Close all conditions with else blocks
//   for (let i = conditions.length - 1; i >= 0; i--) {
//     indent = "  ".repeat(i);
//     template += `${indent}{{- else -}}\n`;
//     template += `${indent}  {{- $default -}}\n`;
//     template += `${indent}{{- end -}}\n`;
//   }
  
//   template += `{{- end -}}`;
  
//   return template;
// }
export function generateYamlFromatInfraHelpers(namespace: string, yamlValuesString: string): string {
  // No need to generate utility functions anymore - they're in chart utils
  return '';
}

// export function getHelperGetAnchorFinalValueName(namespace: string,anchorName: string): string {
//   return `${namespace}.getAnchorFinalValue.${anchorName}`;
// }

// export function generateHelmGetAnchorFinalValue(namespace: string,anchorName: string , anchorPath: (string | number)[] , defaultValue: string): string {
//     const safeGetName = getHelperSafeGetName(namespace, anchorPath);
//   return `{{- define "${getHelperGetAnchorFinalValueName(namespace, anchorName)}" -}}
// {{- $defaultValueString := \`${defaultValue}\` -}}
// {{- $default := fromYaml $defaultValueString -}}
// {{- $anchorValue := include "${safeGetName}" (dict "Values" .) -}}
// {{- if $anchorValue }}
//   {{- $anchorValue }}
// {{- else }}
//   {{- $default }}
// {{- end }}
// {{- end }}`;
// }

/*

The function takes a yamlValuesString identify the anchors and generate a template that will return the values.yaml file with the anchors replaced by the values.
it is doing so by "cutting out" the anchors and replacing with call to final value helper.
note: an anchor can have in it's default value a reference to another anchor, this function will handle this case.

exmaple yaml with anchors:
```
app: &app
  replicas: 3
  port: 8080
  image: &app_image
    image: my-app
    tag: 1.0.0
testApp:
  app: *app
``` 

output:
{{- define "chartUitls.valuesYaml" -}}
{{ $runtime_app_image := include "chartUitls.getAnchorSafeGet.app_image" (dict "Values" .) }}
{{ $runtime_app := include "chartUitls.getAnchorSafeGet.app" (dict "Values" .) }}
{{ $anchor_app_image_default := printf `
image: my-app
tag: 1.0.0
` }}
{{ $final_app_image := (include "chartUitls.pickFirstNonEmpty" (list $runtime_app_image $anchor_app_image_default))}}
{{ $anchor_app_default := printf `
replicas: 3
port: 8080
image: %v
` ($final_app_image | toYaml | indent 2)
}}
{{- $final_app := (include "chartUitls.pickFirstNonEmpty" (list $runtime_app $anchor_app_default))}}
{{ $result := printf `
app: %v
` ($final_app | toYaml | indent 2)
}}
{{ $result | toYaml }}
{{- end }}


Notice that references (*app ..) are not replaced! as once the yaml string is parsed this will managed by the yaml parser.



*/
export function generateValuesYamlTemplate(namespace: string , yamlValuesString: string): string {
    const anchors = analyzeYamlAnchors(yamlValuesString);
    
    if (anchors.length === 0) {
      // No anchors found, return simple template
      return `{{- define "${namespace}.valuesYaml" -}}
${yamlValuesString}
{{- end -}}`;
    }
    
    // Sort anchors by dependency order (anchors that reference other anchors come after their dependencies)
    const sortedAnchors = topologicalSortAnchors(anchors);
    
    // Generate template lines
    const templateLines: string[] = [];
    templateLines.push(`{{- define "${namespace}.valuesYaml" -}}`);
    
    // Generate runtime variable declarations for each anchor using chart utils getValue helper
    sortedAnchors.slice().reverse().forEach(anchor => {
      const varName = `$runtime_${anchor.name}`;
      const pathList = anchor.path.map(p => `"${p}"`).join(' ');
      const defaultValue = anchor.value;
      templateLines.push(`{{- ${varName} := include "${namespace}.getValue" (dict "Values" .Values "path" (list ${pathList}) "default" "${defaultValue}") -}}`);
    });
    
    // Generate default value declarations for each anchor
    sortedAnchors.forEach(anchor => {
      const defaultVarName = `$anchor_${anchor.name}_default`;
      const defaultValue = formatYamlValue(anchor.value);
      
      // Check if this anchor's value references other anchors
      const anchorReferences = findAnchorReferences(anchor.value, sortedAnchors);
      
      if (anchorReferences.length > 0) {
        // Build printf statement with placeholders for referenced anchors
        const printfParts: string[] = [];
        let formattedValue = defaultValue;
        
        anchorReferences.forEach(refAnchor => {
          const refPattern = new RegExp(`\\*${refAnchor.name}`, 'g');
          formattedValue = formattedValue.replace(refPattern, '%s');
          const otherRuntimeVar = `$runtime_${refAnchor.name}`;
          const otherDefaultVar = `$anchor_${refAnchor.name}_default`;
          printfParts.push(`(include "${namespace}.pickFirstNonEmpty" (list ${otherRuntimeVar} ${otherDefaultVar}) | indent 2)`);
        });
        
        templateLines.push(`{{- ${defaultVarName} := printf \`${escapeBackticks(formattedValue)}\` ${printfParts.join(' ')} -}}`);
      } else {
        templateLines.push(`{{- ${defaultVarName} := printf \`${escapeBackticks(defaultValue)}\` -}}`);
      }
    });
    
    // Build the result template by replacing ONLY anchor definitions (NOT references)
    // References (*anchor_name) will be handled naturally by the YAML parser once anchors are resolved
    let resultTemplate = yamlValuesString;
    const replacements: Array<{anchor: string, runtime: string, default: string}> = [];
    
    // Process ONLY anchor definitions (&anchor_name), leave references (*anchor_name) untouched
    sortedAnchors.forEach(anchor => {
      // Match anchor definition and replace only the value part, keeping the anchor name
      // Pattern: "key: &anchor_name value" -> "key: &anchor_name %v"
      const anchorDefPattern = new RegExp(`(:\\s*&\\s*${anchor.name}\\b)\\s+[^\\n]*`, 'g');
      if (resultTemplate.match(anchorDefPattern)) {
        resultTemplate = resultTemplate.replace(anchorDefPattern, '$1 %v');
        const runtimeVar = `$runtime_${anchor.name}`;
        const defaultVar = `$anchor_${anchor.name}_default`;
        replacements.push({
          anchor: anchor.name,
          runtime: runtimeVar,
          default: defaultVar
        });
      }
    });
    
    // Build final value variables for each replacement
    replacements.forEach(replacement => {
      const finalVarName = `$final_${replacement.anchor}`;
      templateLines.push(`{{- ${finalVarName} := include "${namespace}.pickFirstNonEmpty" (list ${replacement.runtime} ${replacement.default}) -}}`);
    });
    
    // Build printf parameters using the final variables
    const printfParts = replacements.map(replacement => `$final_${replacement.anchor}`);
    
    templateLines.push(`{{- $result := printf \`${escapeBackticks(resultTemplate)}\` ${printfParts.join(' ')} -}}`);
    templateLines.push(`{{- $result -}}`);
    templateLines.push(`{{- end -}}`);
    
    return templateLines.join('\n');
}

// Helper function to escape backticks in template strings
function escapeBackticks(str: string): string {
  return str.replace(/`/g, '\\`');
}

// Helper function to find anchor references in a value
function findAnchorReferences(value: any, anchors: AnchorInfo[]): AnchorInfo[] {
  const valueStr = JSON.stringify(value);
  const references: AnchorInfo[] = [];
  
  anchors.forEach(anchor => {
    if (valueStr.includes(`*${anchor.name}`)) {
      references.push(anchor);
    }
  });
  
  return references;
}

// Helper function to perform topological sort on anchors based on their dependencies
function topologicalSortAnchors(anchors: AnchorInfo[]): AnchorInfo[] {
  const anchorMap = new Map(anchors.map(a => [a.name, a]));
  const visited = new Set<string>();
  const sorted: AnchorInfo[] = [];
  
  // Find dependencies for each anchor (which other anchors it references)
  const dependencies = new Map<string, Set<string>>();
  
  anchors.forEach(anchor => {
    const deps = new Set<string>();
    const valueStr = JSON.stringify(anchor.value);
    
    // Check if this anchor's value references other anchors
    anchors.forEach(otherAnchor => {
      if (anchor.name !== otherAnchor.name && valueStr.includes(`*${otherAnchor.name}`)) {
        deps.add(otherAnchor.name);
      }
    });
    
    dependencies.set(anchor.name, deps);
  });
  
  // Topological sort using DFS
  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    
    const deps = dependencies.get(name) || new Set();
    deps.forEach(dep => visit(dep));
    
    const anchor = anchorMap.get(name);
    if (anchor) sorted.push(anchor);
  }
  
  anchors.forEach(anchor => visit(anchor.name));
  
  return sorted;
}



// Helper function to format YAML value as a string
function formatYamlValue(value: any, indent: number = 0): string {
  const indentStr = '  '.repeat(indent);
  
  if (value === null || value === undefined) {
    return 'null';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const itemStr = formatYamlValue(item, indent + 1);
      const prefix = index === 0 ? '' : '\n' + indentStr;
      
      if (typeof item === 'object' && item !== null) {
        const itemLines = itemStr.split('\n');
        return `${prefix}- ${itemLines[0]}${itemLines.slice(1).map(line => '\n' + indentStr + '  ' + line).join('')}`;
      }
      
      return `${prefix}- ${itemStr}`;
    }).join('');
  }
  
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).map(([key, val], index) => {
      const prefix = index === 0 ? '' : '\n' + indentStr;
      
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const childStr = formatYamlValue(val, indent + 1);
        return `${prefix}${key}:\n${indentStr}  ${childStr.split('\n').join('\n' + indentStr + '  ')}`;
      }
      
      const valueStr = formatYamlValue(val, indent + 1);
      return `${prefix}${key}: ${valueStr}`;
    }).join('');
  }
  
  return '';
}

