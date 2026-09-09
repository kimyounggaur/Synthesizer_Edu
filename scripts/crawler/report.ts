import { appendFile } from 'node:fs/promises';
import { latestReport } from './lib/report';

const report = await latestReport();
console.log(report.markdown);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report.markdown);
}
