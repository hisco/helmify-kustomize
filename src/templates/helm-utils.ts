import { trimIndent } from '../lang';
import * as fs from 'fs';
import * as path from 'path';
/**
 * Generates the content of the chart utils file
 * @param {string} packageId - The id of the package that is used to prefix the helpers
 * @returns {string} The content of the chart utils file
 */
export const chartUtils = (packageId: string): string => {
  // get content of chart-utils/utils.tpl
  const utilsTplContent = fs.readFileSync(path.join(__dirname, 'chart-utils', 'utils.tpl'), 'utf8');
  // replace all occurrences of chartUtils. with packageId.
  const utilsContent = (utilsTplContent.replace(/chartUtils\./g, packageId + '.'));

  const patchUtilsTplContent = fs.readFileSync(path.join(__dirname, 'chart-utils', 'patches.tpl'), 'utf8');
  const patchUtilsContent = (patchUtilsTplContent.replace(/chartUtils\./g, packageId + '.'));

  return `${utilsContent}\n${patchUtilsContent}`;
};
