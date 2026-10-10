import { readFile, writeFile } from 'node:fs/promises';
import { compileCatalog, approveGeneration, assertGeneratedIntegrity } from '../src/vnext/ai-catalog/composition';
import { createSyntheticSpecifications } from '../src/vnext/ai-catalog/fixture';
import { reviewIssues } from '../src/vnext/ai-catalog/contracts';

const raw = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : await createSyntheticSpecifications();
const value = await compileCatalog(raw);
const issues = reviewIssues(value.input, value.decisions);
const result = { mode: 'deterministic-mock', networkCalls: 0, pages: value.document.pages.length, technicalValues: assertGeneratedIntegrity(value).length, unresolved: issues.filter(issue => !issue.resolved).length, physicalPreflight: 'REQUIRES_BROWSER_MEASUREMENT' };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(value, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!issues.length) await approveGeneration(value);
