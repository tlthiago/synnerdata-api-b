import { describe, expect, it } from "bun:test";
import { orgRoles } from "@/lib/permissions";

/**
 * Permission matrix test — validates that each org role has exactly
 * the expected permissions. If someone accidentally adds or removes
 * a permission, this test breaks immediately.
 */

const CRUD = ["create", "read", "update", "delete"];

const expectedMatrix: Record<string, Record<string, string[]>> = {
  owner: {
    organization: ["read", "update", "delete"],
    branch: CRUD,
    sector: CRUD,
    costCenter: CRUD,
    jobClassification: CRUD,
    jobPosition: CRUD,
    ppeItem: CRUD,
    ppeDelivery: CRUD,
    laborLawsuit: CRUD,
    project: CRUD,
    employee: CRUD,
    absence: CRUD,
    accident: CRUD,
    medicalCertificate: CRUD,
    cpfAnalysis: CRUD,
    vacation: CRUD,
    warning: CRUD,
    promotion: CRUD,
    termination: CRUD,
    member: CRUD,
    invitation: ["create", "read", "cancel"],
    subscription: ["read", "update"],
    billing: ["read", "update"],
    billingProfile: ["create", "read", "update"],
    report: ["read", "export"],
    audit: ["read"],
  },
  manager: {
    organization: ["read", "update"],
    branch: CRUD,
    sector: CRUD,
    costCenter: CRUD,
    jobClassification: CRUD,
    jobPosition: CRUD,
    ppeItem: CRUD,
    ppeDelivery: CRUD,
    laborLawsuit: CRUD,
    project: CRUD,
    employee: CRUD,
    absence: CRUD,
    accident: CRUD,
    medicalCertificate: CRUD,
    cpfAnalysis: CRUD,
    vacation: CRUD,
    warning: CRUD,
    promotion: CRUD,
    termination: CRUD,
    member: ["create", "read"],
    invitation: ["create", "read", "cancel"],
    subscription: ["read"],
    billing: [],
    billingProfile: [],
    report: ["read", "export"],
    audit: [],
  },
  supervisor: {
    organization: ["read"],
    branch: ["read"],
    sector: ["read"],
    costCenter: ["read"],
    jobClassification: ["read"],
    jobPosition: ["read"],
    ppeItem: ["read"],
    ppeDelivery: CRUD,
    laborLawsuit: ["create", "read", "update"],
    project: ["read"],
    employee: ["create", "read", "update"],
    absence: CRUD,
    accident: CRUD,
    medicalCertificate: CRUD,
    cpfAnalysis: CRUD,
    vacation: CRUD,
    warning: CRUD,
    promotion: CRUD,
    termination: CRUD,
    member: ["read"],
    invitation: ["read"],
    subscription: ["read"],
    billing: [],
    billingProfile: [],
    report: ["read", "export"],
    audit: [],
  },
  viewer: {
    organization: ["read"],
    branch: ["read"],
    sector: ["read"],
    costCenter: ["read"],
    jobClassification: ["read"],
    jobPosition: ["read"],
    ppeItem: ["read"],
    ppeDelivery: ["read"],
    laborLawsuit: ["read"],
    project: ["read"],
    employee: ["read"],
    absence: ["read"],
    accident: ["read"],
    medicalCertificate: ["read"],
    cpfAnalysis: ["read"],
    vacation: ["read"],
    warning: ["read"],
    promotion: ["read"],
    termination: ["read"],
    member: ["read"],
    invitation: ["read"],
    subscription: ["read"],
    billing: [],
    billingProfile: [],
    report: ["read"],
    audit: [],
  },
};

describe("Organization role permissions matrix", () => {
  for (const [role, expectedPermissions] of Object.entries(expectedMatrix)) {
    describe(role, () => {
      const actual = orgRoles[role as keyof typeof orgRoles].statements;

      for (const [resource, expectedActions] of Object.entries(
        expectedPermissions
      )) {
        it(`${resource}: [${expectedActions.join(", ")}]`, () => {
          const actualActions =
            (actual as Record<string, string[]>)[resource] ?? [];
          expect(actualActions.sort()).toEqual([...expectedActions].sort());
        });
      }

      it("should not have unexpected resources", () => {
        const expectedResources = Object.keys(expectedPermissions).sort();
        const actualResources = Object.keys(actual).sort();
        expect(actualResources).toEqual(expectedResources);
      });
    });
  }

  it("should cover all defined roles", () => {
    const expectedRoleNames = Object.keys(expectedMatrix).sort();
    const actualRoleNames = Object.keys(orgRoles).sort();
    expect(actualRoleNames).toEqual(expectedRoleNames);
  });
});
