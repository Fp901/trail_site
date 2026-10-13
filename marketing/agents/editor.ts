import { TOOL_ACCESS } from '../config';
import { briefText } from '../brief';
import type { Employee } from './types';

// Instructions live in marketing/briefs/editor.md, which the owner edits directly.

export const editor: Employee = {
  key: 'editor',
  description: 'Second opinion on every new draft, after the code rules have passed it.',
  instructions: briefText('editor'),
  tools: TOOL_ACCESS.editor,
  web: false,
  memory: { playbook: 'read_only', reads: ['researcher'] },
};
