import { Elysia } from "elysia";
import { branchController } from "./branches";
import { costCenterController } from "./cost-centers";
import { jobClassificationController } from "./job-classifications";
import { jobPositionController } from "./job-positions";
import { ppeItemController } from "./ppe-items";
import { profileController } from "./profile";
import { projectController } from "./projects";
import { sectorController } from "./sectors";

export const organizationController = new Elysia({
  name: "organizations",
})
  .use(branchController)
  .use(costCenterController)
  .use(jobClassificationController)
  .use(jobPositionController)
  .use(ppeItemController)
  .use(projectController)
  .use(sectorController)
  .use(profileController);
