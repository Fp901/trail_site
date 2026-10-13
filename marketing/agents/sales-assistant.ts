import { TOOL_ACCESS } from '../config';
import { briefText } from '../brief';
import type { Employee } from './types';

// Instructions live in marketing/briefs/sales-assistant.md, which the owner edits directly.

// Defined in milestone 1 so its memory and tools exist. Its trigger (a new enquiry) is a later
// milestone; nothing runs it yet.
export const salesAssistant: Employee = {
  key: 'sales_assistant',
  description: 'Drafts replies to website enquiries for the owner to send. Not triggered yet.',
  instructions: briefText('sales-assistant'),
  tools: TOOL_ACCESS.sales_assistant,
  web: false,
  memory: { playbook: 'read_only', reads: [] },
};
