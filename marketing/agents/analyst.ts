import { TOOL_ACCESS } from '../config';
import { briefText } from '../brief';
import type { Employee } from './types';

// Instructions live in marketing/briefs/analyst.md, which the owner edits directly.

export const analyst: Employee = {
  key: 'analyst',
  description: 'Reads the week\'s results and writes a short report for the owner.',
  instructions: briefText('analyst'),
  tools: TOOL_ACCESS.analyst,
  web: false,
  memory: { playbook: 'read_only', reads: [] },
};
