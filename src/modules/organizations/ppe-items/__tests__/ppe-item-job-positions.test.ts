import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestPpeItem } from "@/test/helpers/ppe-item";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PPE Item Job Position Endpoints", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("POST /v1/ppe-items/:id/job-positions", () => {
    test("should reject unauthenticated requests", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/ppe-item-123/job-positions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobPositionId: "job-position-123" }),
        })
      );

      expect(response.status).toBe(401);
    });

    test("should return 404 for non-existent ppe item", async () => {
      const { headers } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/ppe-items/ppe-item-nonexistent/job-positions`,
          {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ jobPositionId: "job-position-123" }),
          }
        )
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("PPE_ITEM_NOT_FOUND");
    });

    test("should return 404 for non-existent job position", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobPositionId: "job-position-nonexistent" }),
        })
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("PPE_JOB_POSITION_NOT_FOUND");
    });

    test("should add job position to ppe item successfully", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      const jobPosition = await createTestJobPosition({
        organizationId,
        userId: user.id,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobPositionId: jobPosition.id }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.ppeItemId).toBe(ppeItem.id);
      expect(body.data.jobPositionId).toBe(jobPosition.id);
      expect(body.data.createdAt).toBeDefined();
    });

    test("should return 409 when adding duplicate job position", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      const jobPosition = await createTestJobPosition({
        organizationId,
        userId: user.id,
      });

      // First add
      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobPositionId: jobPosition.id }),
        })
      );

      // Second add
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobPositionId: jobPosition.id }),
        })
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe("PPE_JOB_POSITION_ALREADY_EXISTS");
    });

    test.each([
      "viewer",
      "supervisor",
    ] as const)("should reject %s from adding job position", async (role) => {
      const { addMemberToOrganization } = await import(
        "@/test/helpers/organization"
      );

      const owner = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const ppeItem = await createTestPpeItem({
        organizationId: owner.organizationId,
        userId: owner.user.id,
      });

      const jobPosition = await createTestJobPosition({
        organizationId: owner.organizationId,
        userId: owner.user.id,
      });

      const member = await createTestUser({ emailVerified: true });
      await addMemberToOrganization(member, {
        organizationId: owner.organizationId,
        role,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "POST",
          headers: {
            ...member.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobPositionId: jobPosition.id }),
        })
      );

      expect(response.status).toBe(403);
    });
  });

  describe("GET /v1/ppe-items/:id/job-positions", () => {
    test("should return empty list when no job positions", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBe(0);
    });

    test("should return associated job positions", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      const jobPosition1 = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Operador",
      });

      const jobPosition2 = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Soldador",
      });

      // Add job positions
      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobPositionId: jobPosition1.id }),
        })
      );

      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobPositionId: jobPosition2.id }),
        })
      );

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(2);

      const names = body.data.map((jp: { name: string }) => jp.name);
      expect(names).toContain("Operador");
      expect(names).toContain("Soldador");
    });

    test("should allow viewer to list job positions", async () => {
      const { addMemberToOrganization } = await import(
        "@/test/helpers/organization"
      );

      const owner = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const ppeItem = await createTestPpeItem({
        organizationId: owner.organizationId,
        userId: owner.user.id,
      });

      const viewer = await createTestUser({ emailVerified: true });
      await addMemberToOrganization(viewer, {
        organizationId: owner.organizationId,
        role: "viewer",
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "GET",
          headers: viewer.headers,
        })
      );

      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /v1/ppe-items/:id/job-positions/:jobPositionId", () => {
    test("should return 404 for non-existent association", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      const jobPosition = await createTestJobPosition({
        organizationId,
        userId: user.id,
      });

      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions/${jobPosition.id}`,
          {
            method: "DELETE",
            headers,
          }
        )
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("PPE_JOB_POSITION_NOT_FOUND");
    });

    test("should remove job position from ppe item", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      const jobPosition = await createTestJobPosition({
        organizationId,
        userId: user.id,
      });

      // Add first
      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobPositionId: jobPosition.id }),
        })
      );

      // Delete
      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions/${jobPosition.id}`,
          {
            method: "DELETE",
            headers,
          }
        )
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      const listResponse = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "GET",
          headers,
        })
      );

      const listBody = await listResponse.json();
      expect(listBody.data.length).toBe(0);
    });

    test.each([
      "viewer",
      "supervisor",
    ] as const)("should reject %s from removing job position", async (role) => {
      const { addMemberToOrganization } = await import(
        "@/test/helpers/organization"
      );

      const owner = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const ppeItem = await createTestPpeItem({
        organizationId: owner.organizationId,
        userId: owner.user.id,
      });

      const jobPosition = await createTestJobPosition({
        organizationId: owner.organizationId,
        userId: owner.user.id,
      });

      // Add as owner
      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
          method: "POST",
          headers: {
            ...owner.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobPositionId: jobPosition.id }),
        })
      );

      const member = await createTestUser({ emailVerified: true });
      await addMemberToOrganization(member, {
        organizationId: owner.organizationId,
        role,
      });

      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions/${jobPosition.id}`,
          {
            method: "DELETE",
            headers: member.headers,
          }
        )
      );

      expect(response.status).toBe(403);
    });
  });
});
