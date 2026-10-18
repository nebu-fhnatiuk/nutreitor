import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { CareAssignmentsService } from "./care-assignments.service.js";
import { MealPlansController } from "./meal-plans.controller.js";
import { MealPlansService } from "./meal-plans.service.js";
import { MetricsController } from "./metrics.controller.js";
import { MetricsService } from "./metrics.service.js";
import { PatientNotesService } from "./patient-notes.service.js";
import { PatientsController } from "./patients.controller.js";
import { PatientsService } from "./patients.service.js";
import { PlanTemplatesController } from "./plan-templates.controller.js";
import { PlanTemplatesService } from "./plan-templates.service.js";

@Module({
  imports: [AuthModule],
  controllers: [PatientsController, MetricsController, MealPlansController, PlanTemplatesController],
  providers: [
    PatientsService,
    CareAssignmentsService,
    PatientNotesService,
    MetricsService,
    MealPlansService,
    PlanTemplatesService,
  ],
})
export class PatientsModule {}
