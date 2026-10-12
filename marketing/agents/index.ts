// The seven employees (CLAUDE.md Part 18). Order matches EMPLOYEE_KEYS in config.ts.
import type { EmployeeKey } from '../config';
import type { Employee } from './types';
import { headOfMarketing } from './head-of-marketing';
import { researcher } from './researcher';
import { copywriter } from './copywriter';
import { editor } from './editor';
import { communityManager } from './community-manager';
import { salesAssistant } from './sales-assistant';
import { analyst } from './analyst';

export const EMPLOYEES: readonly Employee[] = [
  headOfMarketing,
  researcher,
  copywriter,
  editor,
  communityManager,
  salesAssistant,
  analyst,
];

export function employee(key: EmployeeKey): Employee {
  const found = EMPLOYEES.find((e) => e.key === key);
  if (!found) throw new Error(`Unknown employee: ${key}`);
  return found;
}

export type { Employee };
