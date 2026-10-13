import { TOOL_ACCESS } from '../config';
import { briefText } from '../brief';
import type { Employee } from './types';

// Instructions live in marketing/briefs/community-manager.md, which the owner edits directly.

// Defined in milestone 1 so its memory and tools exist; not scheduled yet.
export const communityManager: Employee = {
  key: 'community_manager',
  description: 'Drafts replies and community posts for the owner to approve. Not scheduled yet.',
  instructions: briefText('community-manager'),
  tools: TOOL_ACCESS.community_manager,
  web: false,
  memory: { playbook: 'read_only', reads: [] },
};
