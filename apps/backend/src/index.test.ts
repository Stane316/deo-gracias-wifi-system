import { describe, expect, it } from 'vitest';
import { APP_NAME } from './index.js';

describe('backend skeleton', () => {
  it('expose son identité', () => {
    expect(APP_NAME).toBe('dg-backend');
  });
});
