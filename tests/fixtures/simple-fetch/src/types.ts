// Deliberate mismatches:
// - has 'phone' which is NOT in the spec
// - missing 'createdAt' which IS required in the spec

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;    // NOT in spec
  // createdAt is missing -- spec requires it
}
