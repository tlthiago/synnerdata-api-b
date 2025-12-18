/**
 * Test user data fixtures
 * These are template data - actual users are created dynamically via auth helper
 */

export const testUserTemplates = {
  verified: {
    name: "Verified User",
    email: "verified@test.com",
    emailVerified: true,
  },
  unverified: {
    name: "Unverified User",
    email: "unverified@test.com",
    emailVerified: false,
  },
  admin: {
    name: "Admin User",
    email: "admin@test.com",
    emailVerified: true,
    role: "admin" as const,
  },
  member: {
    name: "Member User",
    email: "member@test.com",
    emailVerified: true,
    role: "member" as const,
  },
};
