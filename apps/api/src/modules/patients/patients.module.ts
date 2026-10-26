import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { AnthropometryController } from "./anthropometry.controller.js";
import { AnthropometryService } from "./anthropometry.service.js";
import { CareAssignmentsService } from "./care-assignments.service.js";
import { EnergyController } from "./energy.controller.js";
import { FoodFrequencyController } from "./food-frequency.controller.js";
import { GroupHydrationController, HydrationController } from "./hydration.controller.js";
import { HydrationService } from "./hydration.service.js";
import { FoodFrequencyService } from "./food-frequency.service.js";
import { RecallsController } from "./recalls.controller.js";
import { RecallsService } from "./recalls.service.js";
import { EnergyService } from "./energy.service.js";
import { GroupsController } from "./groups.controller.js";
import { GroupBoardService } from "./group-board.service.js";
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
import { GroupActionsService } from "./group-actions.service.js";
import { PatientImportController } from "./patient-import.controller.js";
import { PatientImportService } from "./patient-import.service.js";

@Module({
  imports: [AuthModule],
  controllers: [
    PatientImportController,
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
    EnergyController,
    RecallsController,
    FoodFrequencyController,
    HydrationController,
    GroupHydrationController,
  ],
  providers: [
    PatientsService,
    PatientImportService,
    GroupActionsService,
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
    EnergyService,
    RecallsService,
    FoodFrequencyService,
    HydrationService,
    GroupBoardService,
  ],
  exports: [AdherenceService, ConversationsService, ReportsService, CareAssignmentsService, AnthropometryService],
})
export class PatientsModule {}
