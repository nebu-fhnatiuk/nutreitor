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

@Module({
  imports: [AuthModule],
  controllers: [PatientsController, MetricsController, MealPlansController],
  providers: [
    PatientsService,
    CareAssignmentsService,
    PatientNotesService,
    MetricsService,
    MealPlansService,
  ],
})
export class PatientsModule {}
