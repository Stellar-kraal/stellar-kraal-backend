/**
 * tests/unit/authCookie.test.ts
 *
 * Unit tests for the session-cookie helpers. These assert the security-relevant
 * cookie attributes (HttpOnly, SameSite, expiry) that mitigate FE-02.
 */

import { Response } from 'express';
import {
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE_NAME,
} from '../../src/lib/authCookie';
import { issueJwt } from '../../src/services/auth.service';
import { Role } from '../../src/types/domain';

function mockRes(): { res: Response; cookie: jest.Mock; clearCookie: jest.Mock } {
  const cookie = jest.fn().mockReturnThis();
  const clearCookie = jest.fn().mockReturnThis();
  const res = { cookie, clearCookie } as unknown as Response;
  return { res, cookie, clearCookie };
}

const payload = {
  sub: 'user-001',
  publicKey: 'GCFARMERPUBLICKEY',
  role: 'FARMER' as Role,
};

describe('setSessionCookie', () => {
  it('sets an HttpOnly cookie under the session name carrying the token', () => {
    const token = issueJwt(payload);
    const { res, cookie } = mockRes();

    setSessionCookie(res, token);

    expect(cookie).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookie.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(value).toBe(token);
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/');
    expect(['lax', 'strict', 'none']).toContain(options.sameSite);
  });

  it('derives a positive maxAge from the token exp claim', () => {
    const token = issueJwt(payload); // JWT_EXPIRES_IN=1h in tests
    const { res, cookie } = mockRes();

    setSessionCookie(res, token);

    const options = cookie.mock.calls[0][2];
    expect(typeof options.maxAge).toBe('number');
    expect(options.maxAge).toBeGreaterThan(0);
    // 1h ≈ 3_600_000 ms, allow generous slack for clock/exec time
    expect(options.maxAge).toBeLessThanOrEqual(3_600_000);
  });
});

describe('clearSessionCookie', () => {
  it('clears the session cookie with matching attributes', () => {
    const { res, clearCookie } = mockRes();

    clearSessionCookie(res);

    expect(clearCookie).toHaveBeenCalledTimes(1);
    const [name, options] = clearCookie.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/');
  });
});
