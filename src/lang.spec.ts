import { indentYaml, trimIndent } from './lang';

describe('trimIndent', () => {
  it('should remove leading "|" from lines', () => {
    const input = `|line1
      |  line2
      |line3`;
    const expectedOutput = `line1\n  line2\nline3`;
    expect(trimIndent(input)).toBe(expectedOutput);
  });

  it('should replace "|" with custom indentation', () => {
    const input = `|line1
      |  line2`;
    const expectedOutput = `-->line1\n-->  line2`;
    expect(trimIndent(input, '-->')).toBe(expectedOutput);
  });

  it('should handle empty strings', () => {
    expect(trimIndent('')).toBe('');
  });

  it('should not affect lines without leading "|" symbol', () => {
    const input = `line1
      |line2`;
    const expectedOutput = `line1\nline2`;
    expect(trimIndent(input)).toBe(expectedOutput);
  });
});

describe('indentYaml', () => {
  it('should add indentation to each line', () => {
    const yamlInput = `key: value\nnested:\n  key: value`;
    const expectedOutput = `    key: value\n    nested:\n      key: value`;
    expect(indentYaml(yamlInput, 4)).toBe(expectedOutput);
  });

  it('should handle single-line YAML', () => {
    const yamlInput = `key: value`;
    const expectedOutput = `    key: value`;
    expect(indentYaml(yamlInput, 4)).toBe(expectedOutput);
  });

  it('should handle empty YAML input', () => {
    expect(indentYaml('', 4)).toBe('    ');
  });

  it('should handle multi-line YAML with varying indentation', () => {
    const yamlInput = `root:\n  child: value\nanother: key`;
    const expectedOutput = `    root:\n      child: value\n    another: key`;
    expect(indentYaml(yamlInput, 4)).toBe(expectedOutput);
  });
});
