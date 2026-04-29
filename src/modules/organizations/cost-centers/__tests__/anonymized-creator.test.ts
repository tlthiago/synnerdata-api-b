import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { CostCenterService } from "@/modules/organizations/cost-centers/cost-center.service";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { addMemberToOrganization } from "@/test/helpers/organization";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "TestPassword123!";
const ANONYMIZED_NAME = "Usuário removido";

describe("Cost-center surfaces anonymized creator", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("GET returns createdBy with anonymized name after creator self-anonymizes", async () => {
    const owner = await createTestUserWithOrganization({ emailVerified: true });
    const member = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(member, {
      organizationId: owner.organizationId,
      role: "manager",
    });

    const costCenter = await CostCenterService.create({
      organizationId: owner.organizationId,
      userId: member.user.id,
      name: `Centro Anonymized ${crypto.randomUUID().slice(0, 8)}`,
    });

    const anonymizeResp = await app.handle(
      new Request(`${BASE_URL}/v1/account/anonymize`, {
        method: "POST",
        headers: { ...member.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      })
    );
    expect(anonymizeResp.status).toBe(200);

    const getResp = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${costCenter.id}`, {
        method: "GET",
        headers: owner.headers,
      })
    );
    expect(getResp.status).toBe(200);
    const body = await getResp.json();
    expect(body.success).toBe(true);
    expect(body.data.createdBy).toEqual({
      id: member.user.id,
      name: ANONYMIZED_NAME,
    });
    expect(body.data.updatedBy).toEqual({
      id: member.user.id,
      name: ANONYMIZED_NAME,
    });
  });
});
