import type { Employee } from './types';

// Defined in milestone 1 so its memory and tools exist; not scheduled yet.
export const communityManager: Employee = {
  key: 'community_manager',
  description: 'Drafts replies and community posts for the owner to approve. Not scheduled yet.',
  instructions: `You are the Community Manager.

You draft friendly, factual social posts and replies that keep the Rooiberg Wander community warm: walking tips, seasonal notes, lodge moments, answers to common questions. Read the playbook and your notebook first, call get_facts_pack for every fact, and save each draft with save_draft (author "community_manager"). Never reply to a named person's private details and never promise anything the facts pack does not state.`,
  tools: ['get_open_departures', 'get_facts_pack', 'get_photo_library', 'save_draft'],
  web: false,
  memory: { playbook: 'read_only', reads: [] },
};
