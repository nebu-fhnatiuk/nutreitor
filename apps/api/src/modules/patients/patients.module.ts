import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { AnthropometryController } from "./anthropometry.controller.js";
import { AnthropometryService } from "./anthropometry.service.js";
import { CareAssignmentsService } from "./care-assignments.service.js";
import { GroupsController } from "./groups.controller.js";
import { GroupsService } from "./groups.service.js";
import { MealPlansController } from "./meal-plans.controller.js";
import { MealPlansService } from "./meal-plans.service.js";
import { AdherenceController } from "./adherence.controller.js";
import { AdherenceService } from "./adherence.service.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";
import { EfficiencyController } from "./efficiency.controller.js";
import { EfficiencyService } from "./efficiency.service.js";
import { ConversationsController } from "./conversations.controller.js";
import { ConversationsService } from "./conversations.service.js";
import { MetricsController } from "./metrics.controller.js";
import { MetricsService } from "./metrics.service.js";
import { PatientNotesService } from "./patient-notes.service.js";
import { PatientsController } from "./patients.controller.js";
import { PatientsService } from "./patients.service.js";
import { PlanTemplatesController } from "./plan-templates.controller.js";
import { PlanTemplatesService } from "./plan-templates.service.js";

@Module({
  imports: [AuthModule],
  controllers: [
    PatientsController,
    MetricsController,
    MealPlansController,
    PlanTemplatesController,
    AdherenceController,
    ConversationsController,
    EfficiencyController,
    ReportsController,
    AnthropometryController,
    GroupsController,
  ],
  providers: [
    PatientsService,
    CareAssignmentsService,
    PatientNotesService,
    MetricsService,
    MealPlansService,
    PlanTemplatesService,
    AdherenceService,
    ConversationsService,
    EfficiencyService,
    ReportsService,
    AnthropometryService,
    GroupsService,
  ],
  exports: [AdherenceService, ConversationsService, ReportsService, CareAssignmentsService, AnthropometryService],
})
export class PatientsModule {}
