/**
 * Trims leading indentation marked with the '|' symbol.
 * @param str - The input string to process.
 * @param addIndent - Optional string to replace the trimmed '|' with.
 * @returns A string with leading indentation removed/replaced.
 */
function trimIndent(str: string, addIndent?: string): string {
  return `${str || ''}`.replace(/^\s*?\|/gm, addIndent || '');
}

/**
 * Indents each line of a YAML string with a specified number of spaces.
 * @param yaml - The YAML string to indent.
 * @param spaces - Number of spaces to use for indentation.
 * @returns A new string with the specified indentation applied.
 */
function indentYaml(yaml: string, spaces: number): string {
  // Create a string with the specified number of spaces
  const indent = ' '.repeat(spaces);

  // Split the YAML string into an array of lines
  const lines = yaml.split('\n');

  // Add the indent to the beginning of each line
  const indentedLines = lines.map((line) => indent + line);

  // Join the lines back into a single string
  return indentedLines.join('\n');
}

// Export the functions for use in other modules
export { indentYaml, trimIndent };
