import { TOOL_ACCESS } from '../config';
import { briefText } from '../brief';
import type { Employee } from './types';

// The Researcher's instructions and allowed sites live in marketing/briefs/researcher.md, which
// the owner edits directly.
export const researcher: Employee = {
  key: 'researcher',
  description: 'Daily trend and competitor notes for the team.',
  instructions: briefText('researcher'),
  tools: TOOL_ACCESS.researcher,
  web: true,
  memory: { playbook: 'read_only', reads: [] },
};
