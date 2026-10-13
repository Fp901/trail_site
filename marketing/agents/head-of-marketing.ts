import { TOOL_ACCESS } from '../config';
import { briefText } from '../brief';
import type { Employee } from './types';

// Instructions live in marketing/briefs/head-of-marketing.md, which the owner edits directly.

export const headOfMarketing: Employee = {
  key: 'head_of_marketing',
  description: 'Plans the week, reviews results and owns the shared team playbook.',
  instructions: briefText('head-of-marketing'),
  tools: TOOL_ACCESS.head_of_marketing,
  web: false,
  memory: {
    playbook: 'read_write',
    reads: ['researcher', 'copywriter', 'editor', 'community_manager', 'sales_assistant', 'analyst'],
  },
};
