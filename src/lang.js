function trimIndent(str, addIndent) {
    return `${str || ''}`.replace(/^\s*?\|/gm, addIndent || '');
  }

  function indentYaml(yaml, spaces) {
    // Create a string with the specified number of spaces
    const indent = ' '.repeat(spaces);
    
    // Split the YAML string into an array of lines
    const lines = yaml.split('\n');
    
    // Add the indent to the beginning of each line
    const indentedLines = lines.map(line => indent + line);
    
    // Join the lines back into a single string
    return indentedLines.join('\n');
  }
module.exports = {
    trimIndent,
    indentYaml
}