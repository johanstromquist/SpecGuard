import type { User } from './types.js';

// Correct method, type has mismatches
export async function getUsers(): Promise<User[]> {
  const res = await fetch('/api/users');
  return await res.json() as User[];
}

// Correct method, single user with same type mismatches
export async function getUser(id: number): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  return await res.json() as User;
}

// Method mismatch: using GET instead of POST
export async function createUser(name: string, email: string): Promise<User> {
  const res = await fetch('/api/users', {
    method: 'GET',
    body: JSON.stringify({ name, email, phone: '555-1234' }),
  });
  return await res.json() as User;
}

// Deprecated endpoint
export async function getDeprecated() {
  const res = await fetch('/api/deprecated');
  return await res.json();
}
