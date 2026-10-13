import { TOOL_ACCESS } from '../config';
import { briefText } from '../brief';
import type { Employee } from './types';

// Instructions live in marketing/briefs/copywriter.md, which the owner edits directly.

export const copywriter: Employee = {
  key: 'copywriter',
  description: 'Writes posts, captions and blog drafts for the owner to approve.',
  instructions: briefText('copywriter'),
  tools: TOOL_ACCESS.copywriter,
  web: false,
  memory: { playbook: 'read_only', reads: ['researcher'] },
};
