import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { CareAssignmentsService } from "./care-assignments.service.js";
import { PatientNotesService } from "./patient-notes.service.js";
import { PatientsController } from "./patients.controller.js";
import { PatientsService } from "./patients.service.js";

@Module({
  imports: [AuthModule],
  controllers: [PatientsController],
  providers: [PatientsService, CareAssignmentsService, PatientNotesService],
})
export class PatientsModule {}
