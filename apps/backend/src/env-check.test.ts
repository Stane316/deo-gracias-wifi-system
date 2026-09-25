import { describe, expect, it } from 'vitest';
import { describeDatabaseTarget, explainDatabaseUrlProblem } from './env-check.js';

describe('IMP-25.4/25.6 — validation DATABASE_URL', () => {
  it('accepte les formes PostgreSQL valides', () => {
    expect(explainDatabaseUrlProblem('postgres://u:p@h:5432/db')).toBeNull();
    expect(explainDatabaseUrlProblem('postgresql://u:p@h:5432/db')).toBeNull();
  });

  it('refuse une URI PostgreSQL sans hôte', () => {
    expect(explainDatabaseUrlProblem('postgres://')).toContain('URI PostgreSQL invalide');
  });

  it('URL projet Supabase => message ciblé SUPABASE_URL sans valeur', () => {
    const value = 'https://otyogdtt.supabase.co';
    const msg = explainDatabaseUrlProblem(value);
    expect(msg).toContain('SUPABASE_URL');
    expect(msg).not.toContain(value);
  });

  it('autre https => message forme attendue sans echo de la valeur', () => {
    const value = 'https://example.invalid/secret';
    const msg = explainDatabaseUrlProblem(value);
    expect(msg).toContain('postgres://');
    expect(msg).not.toContain(value);
  });

  it('absente ou vide => message .env', () => {
    expect(explainDatabaseUrlProblem(undefined)).toContain('.env');
    expect(explainDatabaseUrlProblem('  ')).toContain('.env');
  });

  it('décrit seulement protocole, hôte et port', () => {
    const target = describeDatabaseTarget(
      'postgres://admin:super-secret@db.example.invalid:6543/private?sslmode=require',
    );
    expect(target).toBe('postgres://db.example.invalid:6543');
    expect(target).not.toContain('admin');
    expect(target).not.toContain('super-secret');
    expect(target).not.toContain('private');
    expect(target).not.toContain('sslmode');
  });

  it('ne renvoie jamais une URI invalide dans la cible de log', () => {
    expect(describeDatabaseTarget('https://project.supabase.co')).toBe('postgres://[invalid]');
    expect(describeDatabaseTarget(undefined)).toBe('postgres://[missing]');
  });
});
