import { Elysia } from "elysia";
import { absenceController } from "./absences";
import { accidentController } from "./accidents";
import { cpfAnalysisController } from "./cpf-analyses";
import { medicalCertificatesController } from "./medical-certificates";
import { ppeDeliveryController } from "./ppe-deliveries";
import { promotionController } from "./promotions";
import { terminationController } from "./terminations";
import { vacationController } from "./vacations";
import { warningController } from "./warnings";

export const occurrencesController = new Elysia({
  name: "occurrences",
})
  .use(absenceController)
  .use(accidentController)
  .use(cpfAnalysisController)
  .use(medicalCertificatesController)
  .use(ppeDeliveryController)
  .use(promotionController)
  .use(terminationController)
  .use(vacationController)
  .use(warningController);
