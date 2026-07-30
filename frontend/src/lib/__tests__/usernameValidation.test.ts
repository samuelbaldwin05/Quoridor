import { describe, expect, it } from 'vitest';
import { validateUsername } from '../usernameValidation';

// These rules are intentionally kept in parity with the backend
// (_validate_username_value in backend/app/api/users.py + test_username_validation.py).

describe('validateUsername — valid', () => {
  it.each([
    'abc',
    'HelloWorld',
    'user123',
    'hello_world',
    '_username',
    'username_',
    '12345',
    'a'.repeat(24),
  ])('accepts %s', (name) => {
    expect(validateUsername(name)).toBeNull();
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateUsername('  goodname  ')).toBeNull();
  });
});

describe('validateUsername — length', () => {
  it.each(['a', 'ab', '  a  '])('rejects too-short %j', (name) => {
    expect(validateUsername(name)).toBe('At least 3 characters.');
  });
  it('rejects empty', () => {
    expect(validateUsername('')).toBe('At least 3 characters.');
  });
  it('rejects > 24 chars', () => {
    expect(validateUsername('a'.repeat(25))).toBe('At most 24 characters.');
  });
});

describe('validateUsername — characters', () => {
  it.each([
    'hello world',
    'hello-world',
    'hello.world',
    'hello@world',
    'héllo',
    'hi😀',
    '你好world',
  ])('rejects %j', (name) => {
    expect(validateUsername(name)).toBe('Letters, numbers, and underscores only.');
  });
});

describe('validateUsername — reserved + blocked (case-insensitive)', () => {
  it.each(['admin', 'ADMIN', 'Admin', 'administrator', 'moderator', 'mod', 'quoridor', 'staff'])(
    'rejects reserved %j',
    (name) => {
      expect(validateUsername(name)).toBe('Username not allowed.');
    },
  );

  it.each(['shit', 'bullshit', 'FUCK', 'Bitch123'])('rejects profanity %j', (name) => {
    expect(validateUsername(name)).toBe('Username not allowed.');
  });
});
