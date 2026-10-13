import { TOOL_ACCESS } from '../config';
import { briefText } from '../brief';
import type { Employee } from './types';

// The Researcher's instructions and starting sites live in marketing/briefs/researcher.md, which
// the owner edits directly.
export const researcher: Employee = {
  key: 'researcher',
  description: 'The weekly research brief: at most five sourced items for Monday\'s plan.',
  instructions: briefText('researcher'),
  tools: TOOL_ACCESS.researcher,
  web: true,
  memory: { playbook: 'read_only', reads: [] },
};
