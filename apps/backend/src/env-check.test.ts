import { describe, expect, it } from 'vitest';
import { explainDatabaseUrlProblem } from './env-check.js';

describe('IMP-25.4 — validation DATABASE_URL', () => {
  it('formes postgres:// et postgresql:// valides', () => {
    expect(explainDatabaseUrlProblem('postgres://u:p@h:5432/db')).toBeNull();
    expect(explainDatabaseUrlProblem('postgresql://u:p@h:5432/db')).toBeNull();
  });
  it('URL projet Supabase => message ciblé SUPABASE_URL', () => {
    const msg = explainDatabaseUrlProblem('https://otyogdtt.supabase.co');
    expect(msg).toContain('SUPABASE_URL');
    expect(msg).toContain('Connection string');
  });
  it('autre https => message forme attendue', () => {
    expect(explainDatabaseUrlProblem('https://exemple.com')).toContain('postgres://');
  });
  it('absente ou vide => message .env', () => {
    expect(explainDatabaseUrlProblem(undefined)).toContain('.env');
    expect(explainDatabaseUrlProblem('  ')).toContain('.env');
  });
});
