import { parseDocument, isAlias, isMap, isSeq } from "yaml";

export interface AnchorReference {
  path: (string | number)[];
}

export interface AnchorInfo {
  name: string;
  path: (string | number)[];
  value: any;
  refs: AnchorReference[];
  hasMergeKey?: boolean;
  mergedAnchors?: string[];
}

export function analyzeYamlAnchors(yamlContent: string): AnchorInfo[] {
  const doc = parseDocument(yamlContent);
  const anchors: Map<string, AnchorInfo> = new Map();
  
  // First pass: collect all anchors and their definitions
  function collectAnchors(node: any, path: (string | number)[] = []): void {
    if (!node) return;
    
    if (node.anchor) {
      const anchorName = node.anchor;
      const value = node.toJSON();
      const mergedAnchors: string[] = [];
      let hasMergeKey = false;

      // Check if this node contains a merge key (<<)
      if (isMap(node) && node.items) {
        node.items.forEach((pair: any) => {
          const key = pair.key?.value || pair.key;
          if (key === '<<' && isAlias(pair.value)) {
            hasMergeKey = true;
            mergedAnchors.push(pair.value.source);
          }
        });
      }

      anchors.set(anchorName, {
        name: anchorName,
        path: [...path],
        value: value,
        refs: [],
        hasMergeKey,
        mergedAnchors
      });
    }
    
    // Recursively process children
    if (isMap(node) && node.items) {
      // Map
      node.items.forEach((pair: any) => {
        if (pair.key && pair.value) {
          const key = pair.key.value || pair.key;
          collectAnchors(pair.value, [...path, key]);
        }
      });
    } else if (isSeq(node) && node.items) {
      // Sequence/Array
      node.items.forEach((item: any, index: number) => {
        collectAnchors(item, [...path, index]);
      });
    }
  }
  
  // Second pass: find all references to anchors
  function findReferences(node: any, path: (string | number)[] = []): void {
    if (!node) return;
    
    // Check if this node is an alias (reference to an anchor)
    if (isAlias(node)) {
      const anchorName = node.source;
      if (anchors.has(anchorName)) {
        anchors.get(anchorName)!.refs.push({
          path: [...path]
        });
      }
    }
    
    // Recursively process children
    if (isMap(node) && node.items) {
      // Map
      node.items.forEach((pair: any) => {
        if (pair.key && pair.value) {
          const key = pair.key.value || pair.key;
          findReferences(pair.value, [...path, key]);
        }
      });
    } else if (isSeq(node) && node.items) {
      // Sequence/Array
      node.items.forEach((item: any, index: number) => {
        findReferences(item, [...path, index]);
      });
    }
  }
  
  // Process the root contents
  if (doc.contents) {
    // Handle the document contents
    if ('items' in doc.contents && doc.contents.items) {
      // Root is a map
      doc.contents.items.forEach((pair: any) => {
        if (pair.key && pair.value) {
          const key = pair.key.value || pair.key;
          collectAnchors(pair.value, [key]);
        }
      });
      
      // Second pass for references
      doc.contents.items.forEach((pair: any) => {
        if (pair.key && pair.value) {
          const key = pair.key.value || pair.key;
          findReferences(pair.value, [key]);
        }
      });
    } else {
      // Root is a sequence or scalar
      collectAnchors(doc.contents, []);
      findReferences(doc.contents, []);
    }
  }
  
  return Array.from(anchors.values());
}